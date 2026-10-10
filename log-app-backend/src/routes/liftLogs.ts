import { Router, Response } from "express";
import * as Sentry from "@sentry/node";
import { config } from "../config";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParamSchema, liftLogSchema, liftLogUpdateSchema, liftLogsQuerySchema } from "../validation/schemas";
import { prisma } from "../db/client";
import { createLiftLogIdempotent, serializeLiftLog, updateLiftLog } from "../services/liftLogs";
import { assertRangeSize } from "../utils/range";

const router = Router();

router.post("/lift", requireAuth, validate(liftLogSchema), async (req, res: Response) => {
  const requestId = req.body.id as string | undefined;
  Sentry.getCurrentScope().setTag("operation", "lift.create");
  Sentry.getCurrentScope().setTag("lift.has_request_id", requestId ? "true" : "false");
  if (requestId) Sentry.getCurrentScope().setTag("lift.request_id", requestId);

  if (config.nodeEnv !== "production") {
    console.log("[lift] POST /api/logs/lift <-", {
      id: requestId ?? null,
      user: req.userId,
      date: req.body.date,
      exercise_name: req.body.exercise_name,
      weight_kg: req.body.weight_kg,
      reps: req.body.reps,
      plan_day_id: req.body.plan_day_id ?? null,
    });
  }

  const { log, created } = await createLiftLogIdempotent(req.userId, req.body);
  Sentry.getCurrentScope().setTag("lift.outcome", created ? "created" : "replayed");

  if (config.nodeEnv !== "production") {
    console.log("[lift] saved ->", {
      id: log.id,
      created,
      exercise_name: log.exerciseName,
      weight_kg: Number(log.weightKg),
      reps: log.reps,
      plan_day_id: log.planDayId,
    });
  }

  res.status(created ? 201 : 200).json(serializeLiftLog(log));
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
    logs.map(serializeLiftLog),
  );
});

router.put(
  "/lift/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(liftLogUpdateSchema),
  async (req, res: Response) => {
    const { id } = req.params as unknown as { id: string };
    const input = req.body as { weight_kg: number; reps: number };

    const log = await updateLiftLog(req.userId, id, input);
    if (!log) {
      res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Lift log not found" } });
      return;
    }

    res.json(serializeLiftLog(log));
  },
);

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
