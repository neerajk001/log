import { Router, Response } from "express";
import * as Sentry from "@sentry/node";
import { config } from "../config";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParamSchema, liftLogSchema, liftLogUpdateSchema, liftLogsQuerySchema, liftMetricsQuerySchema, liftProgressQuerySchema, liftSummaryQuerySchema } from "../validation/schemas";
import { prisma } from "../db/client";
import { isPro } from "../services/entitlements";
import { addDays, daysBetween } from "../utils/range";
import {
  createLiftLogIdempotent,
  getLiftMetrics,
  getLiftSummary,
  serializeLiftLog,
  updateLiftLog,
  type LiftLogUpdateInput,
} from "../services/liftLogs";
import { getLiftProgress } from "../services/liftProgress";
import {
  computeProgression,
  type ProgressionPrescription,
  type ProgressionTarget,
} from "../services/liftProgression";
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
      plate_position: req.body.plate_position ?? null,
      plate_increment: req.body.plate_increment ?? null,
      plate_unit: req.body.plate_unit ?? null,
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
      weight_kg: log.weightKg == null ? null : Number(log.weightKg),
      reps: log.reps,
      plate_position: log.platePosition,
      plate_increment: log.plateIncrement == null ? null : Number(log.plateIncrement),
      plate_unit: log.plateUnit,
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
  const today = new Date().toISOString().slice(0, 10);

  if (date) {
    if (exercise) where.exerciseName = exercise;
    where.date = new Date(date);
  } else if (exercise || from || to || days) {
    if (exercise) where.exerciseName = exercise;
    // `exercise` still honours an explicit from/to/days range; only the default
    // (no range) uses `weeks`. Both bounds are always applied.
    const end = to ?? today;
    let start = from;
    if (!start) {
      const lookback = days ?? (exercise ? (weeks ?? 4) * 7 : 0);
      const d = new Date(`${end}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - lookback);
      start = d.toISOString().slice(0, 10);
    }
    assertRangeSize(start, end);
    where.date = { gte: new Date(start), lte: new Date(end) };
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
      platePosition: true,
      plateIncrement: true,
      plateUnit: true,
      planDayId: true,
    },
  });

  res.json(
    logs.map(serializeLiftLog),
  );
});

router.get(
  "/lift/metrics",
  requireAuth,
  validate(liftMetricsQuerySchema, "query"),
  async (req, res: Response) => {
    const { from, to, prev_from, prev_to } = req.query as unknown as {
      from: string;
      to: string;
      prev_from: string;
      prev_to: string;
    };
    const metrics = await getLiftMetrics(req.userId, {
      from,
      to,
      prevFrom: prev_from,
      prevTo: prev_to,
    });
    res.json({
      days: metrics.days,
      exercises: metrics.exercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        volume: e.volume,
        best_kg: e.bestKg,
        best_reps: e.bestReps,
        best_date: e.bestDate,
        prev_best_kg: e.prevBestKg,
        current_top_kg: e.currentTopKg,
        previous_top_kg: e.previousTopKg,
      })),
    });
  },
);

router.get(
  "/lift/progress",
  requireAuth,
  validate(liftProgressQuerySchema, "query"),
  async (req, res: Response) => {
    let { from, to, prev_from, prev_to } = req.query as unknown as {
      from: string;
      to: string;
      prev_from: string;
      prev_to: string;
    };

    // Windows wider than the free allowance are clamped here, not just hidden in
    // the client, and the comparison window is rebuilt to match so the deltas
    // stay like-for-like.
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { planTier: true, trialEndsAt: true, proUntil: true },
    });
    const pro = user ? isPro(user) : false;
    const maxDays = pro ? null : config.billing.freeLiftProgressDays;
    let limited = false;
    if (maxDays !== null && daysBetween(from, to) > maxDays) {
      limited = true;
      from = addDays(to, -(maxDays - 1));
      prev_to = addDays(from, -1);
      prev_from = addDays(from, -maxDays);
    }

    const progress = await getLiftProgress(req.userId, {
      from,
      to,
      prevFrom: prev_from,
      prevTo: prev_to,
    });
    res.json({ ...progress, limited, max_days: maxDays });
  },
);

/** The active plan's prescriptions, keyed by exercise name (first match wins). */
function planPrescriptions(plan: { planDays: { exercises: unknown }[] } | null) {
  const map = new Map<string, ProgressionPrescription>();
  if (!plan) return map;
  for (const day of plan.planDays) {
    if (!Array.isArray(day.exercises)) continue;
    for (const raw of day.exercises) {
      if (!raw || typeof raw !== "object") continue;
      const exercise = raw as Record<string, unknown>;
      const name = typeof exercise.name === "string" ? exercise.name.trim() : "";
      if (!name || map.has(name)) continue;
      const plateConfig =
        exercise.plate_config && typeof exercise.plate_config === "object"
          ? (exercise.plate_config as { min_position?: number; max_position?: number })
          : null;
      map.set(name, {
        sets: typeof exercise.sets === "number" ? exercise.sets : 3,
        reps: typeof exercise.reps === "string" ? exercise.reps : "8-12",
        ...(typeof exercise.weight_kg === "number" ? { weight_kg: exercise.weight_kg } : {}),
        ...(Array.isArray(exercise.set_targets)
          ? {
              set_targets: exercise.set_targets as {
                weight_kg?: number | null;
                reps?: string | null;
              }[],
            }
          : {}),
        ...(exercise.load_mode === "plate" ? { load_mode: "plate" as const } : {}),
        ...(plateConfig ? { plate_config: plateConfig } : {}),
      });
    }
  }
  return map;
}

/**
 * Pro next-session aims ride with the summary so the Lift screen gets them in
 * the read it already makes. Free accounts get the exact same response without
 * the field, and the server — not the UI — decides who sees it.
 */
async function progressionFor(
  userId: string,
  summary: Awaited<ReturnType<typeof getLiftSummary>>,
): Promise<Record<string, ProgressionTarget> | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { planTier: true, trialEndsAt: true, proUntil: true },
  });
  if (!user || !isPro(user)) return null;

  const plan = await prisma.workoutPlan.findFirst({
    where: { userId, isActive: true },
    select: { planDays: { select: { exercises: true } } },
  });
  const prescriptions = planPrescriptions(plan);
  const progression: Record<string, ProgressionTarget> = {};
  for (const [name, session] of Object.entries(summary.lastSetsByExercise)) {
    const target = computeProgression(session.sets, session.date, prescriptions.get(name) ?? null);
    if (target) progression[name] = target;
  }
  return progression;
}

router.get(
  "/lift/summary",
  requireAuth,
  validate(liftSummaryQuerySchema, "query"),
  async (req, res: Response) => {
    const { days, before } = req.query as unknown as { days?: number; before?: string };
    const summary = await getLiftSummary(req.userId, {
      days: days ?? 120,
      before: before ?? new Date().toISOString().slice(0, 10),
    });
    const progression = await progressionFor(req.userId, summary);
    res.json({
      names: summary.names,
      last_by_exercise: summary.lastByExercise.map(serializeLiftLog),
      last_sets_by_exercise: summary.lastSetsByExercise,
      ...(progression ? { progression_by_exercise: progression } : {}),
    });
  },
);

router.put(
  "/lift/:id",
  requireAuth,
  validate(idParamSchema, "params"),
  validate(liftLogUpdateSchema),
  async (req, res: Response) => {
    const { id } = req.params as unknown as { id: string };
    const input = req.body as LiftLogUpdateInput;

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
