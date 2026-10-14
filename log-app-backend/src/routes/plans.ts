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
import { resolvePlanDayForDate, resolveTrainedPlanDay } from "../services/planRotation";
import { matchPlanDayIds } from "../services/planDays";
import {
    createPlanSchema,
    planIdParamSchema,
    planListQuerySchema,
    planParseBodySchema,
    planTodayQuerySchema,
    type CreatePlanInput,
} from "../validation/schemas";

/** Generous for a workout plan, and it goes to the model inline (see planParser). */
const PLAN_FILE_MAX_BYTES = 1024 * 1024;

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PLAN_FILE_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.mimetype === "text/plain") {
      cb(null, true);
    } else {
      cb(new AppError(400, "VALIDATION_ERROR", "Only PDF or text files are accepted"));
    }
  },
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
  weight_kg?: number;
}

function planExerciseNames(exercises: Prisma.JsonValue): string[] {
  return ((exercises as unknown as PlanExercise[]) ?? []).map((e) => e.name);
}

function serializePlan(plan: {
  id: string;
  name: string;
  source: string;
  rationale: string | null;
  isActive: boolean;
  createdAt: Date;
  planDays: {
    id: string;
    dayName: string;
    rationale: string | null;
    dayOrder: number;
    exercises: Prisma.JsonValue;
  }[];
}) {
  return {
    id: plan.id,
    name: plan.name,
    source: plan.source,
    rationale: plan.rationale ?? null,
    is_active: plan.isActive,
    created_at: plan.createdAt.toISOString(),
    days: plan.planDays.map((day) => ({
      id: day.id,
      day_name: day.dayName,
      rationale: day.rationale ?? null,
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
    let text: string | undefined;

    if (req.file) {
      const result = await parsePlanPdf(
        req.file.buffer,
        req.file.mimetype || "application/pdf",
      );
      res.json(result);
      return;
    } else {
      const parsed = planParseBodySchema.safeParse(req.body);
      if (!parsed.success) {
        next(new AppError(400, "VALIDATION_ERROR", "text is required"));
        return;
      }
      text = parsed.data.text;
    }

    if (!text || text.trim().length === 0) {
      next(new AppError(400, "VALIDATION_ERROR", "no plan text provided"));
      return;
    }

    const result = await parsePlanText(text);
    res.json(result);
  } catch (err) {
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
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        next(
          new AppError(
            400,
            "VALIDATION_ERROR",
            `File is too large. Maximum size is ${PLAN_FILE_MAX_BYTES / (1024 * 1024)} MB.`,
          ),
        );
        return;
      }
      next(err);
    });
  },
  handleParseRequest,
);

router.post(
  "/",
  requireAuth,
  validate(createPlanSchema),
  async (req, res: Response, next: NextFunction) => {
    try {
      const { name, source, rationale, days, is_active } = req.body as CreatePlanInput;
      const activate = is_active ?? true;

      const plan = await prisma.$transaction(async (tx) => {
        if (activate) {
          await tx.workoutPlan.updateMany({
            where: { userId: req.userId, isActive: true },
            data: { isActive: false },
          });
        }

        return tx.workoutPlan.create({
          data: {
            userId: req.userId,
            name,
            source,
            rationale: rationale ?? null,
            isActive: activate,
            planDays: {
              create: days.map((day, index) => ({
                dayName: day.day_name,
                rationale: day.rationale ?? null,
                dayOrder: index + 1,
                exercises: day.exercises as unknown as Prisma.InputJsonValue,
              })),
            },
          },
          include: { planDays: { orderBy: { dayOrder: "asc" } } },
        });
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
  validate(planListQuerySchema, "query"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // The Lift screen only needs the active plan, and doesn't need every other
      // plan's days and exercises on the wire to find it.
      const { active } = req.query as unknown as { active?: string };
      const plans = await prisma.workoutPlan.findMany({
        where: { userId: req.userId, ...(active === "1" ? { isActive: true } : {}) },
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
  validate(planTodayQuerySchema, "query"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planId = req.params.id as string;
      // The athlete's local date: the server runs on UTC, and their "today" decides
      // both which day the plan rotates to and which sets already count as logged.
      const { date } = req.query as unknown as { date?: string };
      const scopeDate = date ?? today();
      const plan = await prisma.workoutPlan.findFirst({
        where: { id: planId, userId: req.userId },
        include: { planDays: { orderBy: { dayOrder: "asc" } } },
      });

      if (!plan) {
        next(new AppError(404, "NOT_FOUND", "Plan not found"));
        return;
      }

      const rotatedDay = resolvePlanDayForDate(
        plan.createdAt,
        plan.planDays,
        new Date(`${scopeDate}T00:00:00Z`),
      );
      if (!rotatedDay) {
        res.json({ plan_id: plan.id, plan_name: plan.name, day: null });
        return;
      }

      // Every set logged that date, not just the ones the rotation expects — so a day
      // the athlete swapped mid-session (Legs on a Push day) still shows as Legs.
      const logged = await prisma.liftLog.findMany({
        where: { userId: req.userId, date: new Date(scopeDate) },
        orderBy: { createdAt: "asc" },
        select: { exerciseName: true, weightKg: true, reps: true, planDayId: true },
      });

      const trainedDay = resolveTrainedPlanDay(
        plan.planDays.map((day) => ({ ...day, exerciseNames: planExerciseNames(day.exercises) })),
        logged,
      );
      const day = trainedDay ?? rotatedDay;

      const exercises = day.exercises as unknown as PlanExercise[];

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
              weight_kg: exercise.weight_kg ?? null,
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

router.put(
  "/:id",
  requireAuth,
  validate(planIdParamSchema, "params"),
  validate(createPlanSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planId = req.params.id as string;
      const { name, source, rationale, days } = req.body as CreatePlanInput;

      const existing = await prisma.workoutPlan.findFirst({
        where: { id: planId, userId: req.userId },
      });
      if (!existing) {
        next(new AppError(404, "NOT_FOUND", "Plan not found"));
        return;
      }

      const plan = await prisma.$transaction(async (tx) => {
        const existingDays = await tx.planDay.findMany({
          where: { planId, plan: { userId: req.userId } },
          orderBy: { dayOrder: "asc" },
          select: { id: true },
        });

        const updated = await tx.workoutPlan.updateMany({
          where: { id: planId, userId: req.userId },
          // `rationale` is left untouched when the payload omits it (it's coach-authored).
          data: { name, source, rationale },
        });
        if (updated.count === 0) {
          throw new AppError(404, "NOT_FOUND", "Plan not found");
        }

        const { keep, remove } = matchPlanDayIds(
          existingDays.map((day) => day.id),
          days.length,
        );
        if (remove.length > 0) {
          await tx.planDay.deleteMany({ where: { id: { in: remove } } });
        }

        for (const [index, day] of days.entries()) {
          const data = {
            dayName: day.day_name,
            // Omitted = keep whatever the day already had.
            rationale: day.rationale,
            dayOrder: index + 1,
            exercises: day.exercises as unknown as Prisma.InputJsonValue,
          };
          const id = keep[index];
          if (id) await tx.planDay.update({ where: { id }, data });
          else await tx.planDay.create({ data: { planId, ...data } });
        }

        return tx.workoutPlan.findFirstOrThrow({
          where: { id: planId, userId: req.userId },
          include: { planDays: { orderBy: { dayOrder: "asc" } } },
        });
      });

      res.json(serializePlan(plan));
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/:id/activate",
  requireAuth,
  validate(planIdParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planId = req.params.id as string;

      const existing = await prisma.workoutPlan.findFirst({
        where: { id: planId, userId: req.userId },
        select: { id: true },
      });
      if (!existing) {
        next(new AppError(404, "NOT_FOUND", "Plan not found"));
        return;
      }

      const plan = await prisma.$transaction(async (tx) => {
        await tx.workoutPlan.updateMany({
          where: { userId: req.userId, isActive: true },
          data: { isActive: false },
        });
        const updated = await tx.workoutPlan.updateMany({
          where: { id: planId, userId: req.userId },
          data: { isActive: true },
        });
        if (updated.count === 0) {
          throw new AppError(404, "NOT_FOUND", "Plan not found");
        }
        return tx.workoutPlan.findFirstOrThrow({
          where: { id: planId, userId: req.userId },
          include: { planDays: { orderBy: { dayOrder: "asc" } } },
        });
      });

      res.json(serializePlan(plan));
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/:id",
  requireAuth,
  validate(planIdParamSchema, "params"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const planId = req.params.id as string;

      const existing = await prisma.workoutPlan.findFirst({
        where: { id: planId, userId: req.userId },
        select: { id: true },
      });
      if (!existing) {
        next(new AppError(404, "NOT_FOUND", "Plan not found"));
        return;
      }

      await prisma.$transaction([
        prisma.planDay.deleteMany({ where: { planId, plan: { userId: req.userId } } }),
        prisma.workoutPlan.deleteMany({ where: { id: planId, userId: req.userId } }),
      ]);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
