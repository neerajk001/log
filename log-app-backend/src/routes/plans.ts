import { Prisma } from "@prisma/client";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { rateLimit } from "../middleware/rateLimit";
import { validate } from "../middleware/validate";
import {
    parsePlanPdf,
    parsePlanText,
    PlanParseError,
} from "../services/planParser";
import { resolvePlanDayForDate } from "../services/planRotation";
import {
    createPlanSchema,
    planIdParamSchema,
    planParseBodySchema,
    type CreatePlanInput,
} from "../validation/schemas";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const parseRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req: Request) => req.userId,
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

interface PlanExercise {
  name: string;
  sets: number;
  reps: string;
}

function serializePlan(plan: {
  id: string;
  name: string;
  source: string;
  isActive: boolean;
  createdAt: Date;
  planDays: {
    id: string;
    dayName: string;
    dayOrder: number;
    exercises: Prisma.JsonValue;
  }[];
}) {
  return {
    id: plan.id,
    name: plan.name,
    source: plan.source,
    is_active: plan.isActive,
    created_at: plan.createdAt.toISOString(),
    days: plan.planDays.map((day) => ({
      id: day.id,
      day_name: day.dayName,
      day_order: day.dayOrder,
      exercises: day.exercises as unknown as PlanExercise[],
    })),
  };
}

async function handleParseRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    console.log("[plans/parse] content-type:", req.headers["content-type"]);
    console.log(
      "[plans/parse] has file:",
      !!req.file,
      "body keys:",
      Object.keys(req.body ?? {}),
    );
    let text: string | undefined;

    if (req.file) {
      console.log(
        "[plans/parse] file:",
        req.file.originalname,
        "size:",
        req.file.size,
        "mimetype:",
        req.file.mimetype,
      );
      const result = await parsePlanPdf(
        req.file.buffer,
        req.file.mimetype || "application/pdf",
      );
      console.log("[plans/parse] parsed PDF OK, days:", result.days.length);
      res.json(result);
      return;
    } else {
      const parsed = planParseBodySchema.safeParse(req.body);
      if (!parsed.success) {
        next(new AppError(400, "VALIDATION_ERROR", "text is required"));
        return;
      }
      text = parsed.data.text;
      console.log("[plans/parse] text input length:", text?.length);
    }

    if (!text || text.trim().length === 0) {
      next(new AppError(400, "VALIDATION_ERROR", "no plan text provided"));
      return;
    }

    console.log("[plans/parse] calling OpenAI...");
    const result = await parsePlanText(text);
    console.log("[plans/parse] parsed OK, days:", result.days.length);
    res.json(result);
  } catch (err) {
    console.error("[plans/parse] error:", err);
    if (err instanceof PlanParseError) {
      next(new AppError(422, "PARSE_FAILED", err.message));
    } else {
      next(err);
    }
  }
}

router.post(
  "/parse",
  requireAuth,
  parseRateLimit,
  upload.single("file"),
  handleParseRequest,
);

router.post(
  "/",
  requireAuth,
  validate(createPlanSchema),
  async (req, res: Response, next: NextFunction) => {
    try {
      const { name, source, days } = req.body as CreatePlanInput;

      await prisma.workoutPlan.updateMany({
        where: { userId: req.userId, isActive: true },
        data: { isActive: false },
      });

      const plan = await prisma.workoutPlan.create({
        data: {
          userId: req.userId,
          name,
          source,
          isActive: true,
          planDays: {
            create: days.map((day, index) => ({
              dayName: day.day_name,
              dayOrder: index + 1,
              exercises: day.exercises as unknown as Prisma.InputJsonValue,
            })),
          },
        },
        include: { planDays: { orderBy: { dayOrder: "asc" } } },
      });

      res.status(201).json(serializePlan(plan));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const plans = await prisma.workoutPlan.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: "desc" },
        include: { planDays: { orderBy: { dayOrder: "asc" } } },
      });

      res.json(plans.map(serializePlan));
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/:id/today",
  requireAuth,
  validate(planIdParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planId = req.params.id as string;
      const plan = await prisma.workoutPlan.findFirst({
        where: { id: planId, userId: req.userId },
        include: { planDays: { orderBy: { dayOrder: "asc" } } },
      });

      if (!plan) {
        next(new AppError(404, "NOT_FOUND", "Plan not found"));
        return;
      }

      const day = resolvePlanDayForDate(
        plan.createdAt,
        plan.planDays,
        new Date(),
      );
      if (!day) {
        res.json({ plan_id: plan.id, plan_name: plan.name, day: null });
        return;
      }

      const exercises = day.exercises as unknown as PlanExercise[];
      const exerciseNames = exercises.map((e) => e.name);

      const logged = await prisma.liftLog.findMany({
        where: {
          userId: req.userId,
          date: new Date(today()),
          exerciseName: { in: exerciseNames },
        },
        orderBy: { createdAt: "asc" },
        select: { exerciseName: true, weightKg: true, reps: true },
      });

      res.json({
        plan_id: plan.id,
        plan_name: plan.name,
        day: {
          id: day.id,
          day_name: day.dayName,
          day_order: day.dayOrder,
          exercises: exercises.map((exercise) => {
            const logs = logged.filter((l) => l.exerciseName === exercise.name);
            const lastLog = logs[logs.length - 1] ?? null;
            return {
              name: exercise.name,
              sets: exercise.sets,
              reps: exercise.reps,
              logged: logs.length > 0,
              last_log: lastLog
                ? { weight_kg: lastLog.weightKg, reps: lastLog.reps }
                : null,
            };
          }),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
