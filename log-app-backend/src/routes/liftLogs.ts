import { Router, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { AppError } from "../middleware/errorHandler";
import { idParamSchema, liftLogSchema, liftLogsQuerySchema } from "../validation/schemas";
import { prisma } from "../db/client";
import { MAX_RANGE_DAYS, RANGE_TOO_LARGE, assertRangeSize } from "../utils/range";

const router = Router();

router.post("/lift", requireAuth, validate(liftLogSchema), async (req, res: Response) => {
  const { date, exercise_name, weight_kg, reps, plan_day_id } = req.body;

  if (plan_day_id) {
    const planDay = await prisma.planDay.findFirst({
      where: { id: plan_day_id, plan: { userId: req.userId } },
      select: { id: true },
    });
    if (!planDay) {
      throw new AppError(404, "NOT_FOUND", "Plan day not found");
    }
  }

  const log = await prisma.liftLog.create({
    data: {
      userId: req.userId,
      date: new Date(date),
      exerciseName: exercise_name,
      weightKg: weight_kg,
      reps,
      planDayId: plan_day_id ?? null,
    },
    select: {
      id: true,
      date: true,
      exerciseName: true,
      weightKg: true,
      reps: true,
      planDayId: true,
    },
  });

  res.status(201).json({
    id: log.id,
    date: log.date.toISOString().slice(0, 10),
    exercise_name: log.exerciseName,
    weight_kg: log.weightKg,
    reps: log.reps,
    plan_day_id: log.planDayId,
  });
});

router.get("/lift", requireAuth, validate(liftLogsQuerySchema, "query"), async (req, res: Response) => {
  const { exercise, weeks, date, from, to, days } = req.query as unknown as {
    exercise?: string;
    weeks?: number;
    date?: string;
    from?: string;
    to?: string;
    days?: number;
  };

  const where: Record<string, unknown> = { userId: req.userId };

  if (exercise) {
    where.exerciseName = exercise;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - (weeks ?? 4) * 7);
    where.date = { gte: fromDate };
  } else if (date) {
    where.date = new Date(date);
  } else {
    let fromDate = from;
    if (!fromDate && days) {
      const d = new Date();
      d.setDate(d.getDate() - days);
      fromDate = d.toISOString().slice(0, 10);
    }
    if (fromDate || to) {
      const end = to ?? new Date().toISOString().slice(0, 10);
      const start = fromDate ?? end;
      assertRangeSize(start, end);
      where.date = {
        ...(fromDate ? { gte: new Date(fromDate) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
  }

  const logs = await prisma.liftLog.findMany({
    where,
    orderBy: { date: "desc" },
    take: 5000,
    select: {
      id: true,
      date: true,
      exerciseName: true,
      weightKg: true,
      reps: true,
      planDayId: true,
    },
  });

  res.json(
    logs.map((l) => ({
      id: l.id,
      date: l.date.toISOString().slice(0, 10),
      exercise_name: l.exerciseName,
      weight_kg: l.weightKg,
      reps: l.reps,
      plan_day_id: l.planDayId,
    })),
  );
});

router.delete(
  "/lift/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  async (req, res: Response) => {
    const { id } = req.params as unknown as { id: string };

    const result = await prisma.liftLog.deleteMany({
      where: { id, userId: req.userId },
    });

    if (result.count === 0) {
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Lift log not found" } });
      return;
    }

    res.json({ ok: true });
  },
);

export default router;
