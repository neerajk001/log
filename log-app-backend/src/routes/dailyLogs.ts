import { Router, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { dailyLogSchema, dateParamSchema, dailyLogsQuerySchema } from "../validation/schemas";
import { prisma } from "../db/client";
import { AppError } from "../middleware/errorHandler";

const router = Router();

router.get("/daily", requireAuth, validate(dailyLogsQuerySchema, "query"), async (req, res: Response) => {
  const { from, to } = req.query as unknown as { from: string; to: string };

  const logs = await prisma.dailyLog.findMany({
    where: {
      userId: req.userId,
      date: { gte: new Date(from), lte: new Date(to) },
    },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      weightKg: true,
      calories: true,
      proteinG: true,
      sleepHours: true,
    },
  });

  res.json(
    logs.map((l) => ({
      id: l.id,
      date: l.date.toISOString().slice(0, 10),
      weight_kg: l.weightKg,
      calories: l.calories,
      protein_g: l.proteinG,
      sleep_hours: l.sleepHours,
    })),
  );
});

router.get("/daily/:date", requireAuth, validate(dateParamSchema, "params"), async (req, res: Response) => {
  const date = req.params.date as string;

  const log = await prisma.dailyLog.findUnique({
    where: { userId_date: { userId: req.userId, date: new Date(date) } },
    select: {
      id: true,
      date: true,
      weightKg: true,
      calories: true,
      proteinG: true,
      sleepHours: true,
    },
  });

  res.json({
    date,
    weight_kg: log?.weightKg ?? null,
    calories: log?.calories ?? null,
    protein_g: log?.proteinG ?? null,
    sleep_hours: log?.sleepHours ?? null,
  });
});

router.put(
  "/daily/:date",
  requireAuth,
  validate(dateParamSchema, "params"),
  validate(dailyLogSchema),
  async (req, res: Response) => {
    const date = req.params.date as string;
    const { weight_kg, calories, protein_g, sleep_hours } = req.body;

    const log = await prisma.dailyLog.upsert({
      where: { userId_date: { userId: req.userId, date: new Date(date) } },
      create: {
        userId: req.userId,
        date: new Date(date),
        weightKg: weight_kg,
        calories,
        proteinG: protein_g,
        sleepHours: sleep_hours,
      },
      update: {
        weightKg: weight_kg,
        calories,
        proteinG: protein_g,
        sleepHours: sleep_hours,
      },
      select: {
        id: true,
        date: true,
        weightKg: true,
        calories: true,
        proteinG: true,
        sleepHours: true,
      },
    });

    res.json({
      id: log.id,
      date: log.date.toISOString().slice(0, 10),
      weight_kg: log.weightKg,
      calories: log.calories,
      protein_g: log.proteinG,
      sleep_hours: log.sleepHours,
    });
  },
);

export default router;
