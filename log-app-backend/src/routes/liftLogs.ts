import { Router, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { liftLogSchema, liftLogsQuerySchema } from "../validation/schemas";
import { prisma } from "../db/client";

const router = Router();

router.post("/lift", requireAuth, validate(liftLogSchema), async (req, res: Response) => {
  const { date, exercise_name, weight_kg, reps, plan_day_id } = req.body;

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
  const { exercise, weeks, date } = req.query as unknown as {
    exercise?: string;
    weeks?: number;
    date?: string;
  };

  const where: Record<string, unknown> = { userId: req.userId };

  if (date) {
    where.date = new Date(date);
  } else if (exercise) {
    where.exerciseName = exercise;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - (weeks ?? 4) * 7);
    where.date = { gte: fromDate };
  }

  const logs = await prisma.liftLog.findMany({
    where,
    orderBy: { date: "desc" },
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

export default router;
