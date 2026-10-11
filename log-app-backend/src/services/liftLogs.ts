import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import { liftLogSchema } from "../validation/schemas";
import type { z } from "zod";

export type LiftLogInput = z.infer<typeof liftLogSchema>;

type LiftLogRecord = {
  id: string;
  userId: string;
  date: Date;
  exerciseName: string;
  weightKg: Prisma.Decimal;
  reps: number;
  planDayId: string | null;
};

type LiftLogClient = Pick<PrismaClient, "liftLog" | "planDay">;

const liftLogSelect = {
  id: true,
  userId: true,
  date: true,
  exerciseName: true,
  weightKg: true,
  reps: true,
  planDayId: true,
} satisfies Prisma.LiftLogSelect;

export function serializeLiftLog(log: Omit<LiftLogRecord, "userId"> | LiftLogRecord) {
  return {
    id: log.id,
    date: log.date.toISOString().slice(0, 10),
    exercise_name: log.exerciseName,
    weight_kg: Number(log.weightKg),
    reps: log.reps,
    plan_day_id: log.planDayId,
  };
}

function sameLiftRequest(log: LiftLogRecord, userId: string, input: LiftLogInput): boolean {
  return (
    log.userId === userId &&
    log.date.toISOString().slice(0, 10) === input.date &&
    log.exerciseName === input.exercise_name &&
    log.weightKg.equals(new Prisma.Decimal(input.weight_kg).toDecimalPlaces(2)) &&
    log.reps === input.reps &&
    log.planDayId === (input.plan_day_id ?? null)
  );
}

function idempotencyConflict(): AppError {
  return new AppError(409, "IDEMPOTENCY_CONFLICT", "Lift request ID was already used");
}

async function requireOwnedPlanDay(
  client: LiftLogClient,
  userId: string,
  planDayId: string | null | undefined,
): Promise<void> {
  if (!planDayId) return;
  const planDay = await client.planDay.findFirst({
    where: { id: planDayId, plan: { userId } },
    select: { id: true },
  });
  if (!planDay) throw new AppError(404, "NOT_FOUND", "Plan day not found");
}

async function findExisting(
  client: LiftLogClient,
  id: string,
): Promise<LiftLogRecord | null> {
  return client.liftLog.findUnique({ where: { id }, select: liftLogSelect });
}

export async function createLiftLogIdempotent(
  userId: string,
  input: LiftLogInput,
  client: LiftLogClient = prisma,
): Promise<{ log: LiftLogRecord; created: boolean }> {
  if (input.id) {
    const existing = await findExisting(client, input.id);
    if (existing) {
      if (!sameLiftRequest(existing, userId, input)) throw idempotencyConflict();
      return { log: existing, created: false };
    }
  }

  await requireOwnedPlanDay(client, userId, input.plan_day_id);

  try {
    const log = await client.liftLog.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        userId,
        date: new Date(input.date),
        exerciseName: input.exercise_name,
        weightKg: input.weight_kg,
        reps: input.reps,
        planDayId: input.plan_day_id ?? null,
      },
      select: liftLogSelect,
    });
    return { log, created: true };
  } catch (err) {
    if (
      input.id &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await findExisting(client, input.id);
      if (existing && sameLiftRequest(existing, userId, input)) {
        return { log: existing, created: false };
      }
      throw idempotencyConflict();
    }
    throw err;
  }
}

/** Update the weight/reps of one owned set. Returns null when not found. */
export async function updateLiftLog(
  userId: string,
  id: string,
  input: { weight_kg: number; reps: number },
  client: LiftLogClient = prisma,
): Promise<LiftLogRecord | null> {
  const result = await client.liftLog.updateMany({
    where: { id, userId },
    data: { weightKg: input.weight_kg, reps: input.reps },
  });
  if (result.count === 0) return null;
  return findExisting(client, id);
}

/** Recent exercise names plus the top set from each one's previous session. */
export interface LiftSummary {
  names: string[];
  lastByExercise: LiftLogRecord[];
}

/** One exercise's rollup for the Insights screen. */
export interface ExerciseMetrics {
  name: string;
  sets: number;
  /** weight × reps summed across the window. */
  volume: number;
  /** Heaviest set in the whole window, with the set that set it. */
  bestKg: number;
  bestReps: number;
  bestDate: string;
  /** The best before it (0 when it was the first), for the PR delta. */
  prevBestKg: number;
  /** Heaviest set inside the current period, and inside the previous one. */
  currentTopKg: number;
  previousTopKg: number;
}

export interface LiftMetrics {
  /** One row per training day in the current period. */
  days: { date: string; sets: number }[];
  exercises: ExerciseMetrics[];
}

/**
 * Everything the Insights screen derives, reduced server-side.
 *
 * It used to download up to 5,000 individual sets (a year's range fetches two years)
 * and reduce them in the app — on every visit and after every logged set. The
 * presentation maths (muscle names, streaks, series) still happens on the client, so
 * nothing is duplicated; only the row transfer moved here.
 */
export async function getLiftMetrics(
  userId: string,
  opts: { from: string; to: string; prevFrom: string; prevTo: string },
  client: Pick<PrismaClient, "liftLog"> = prisma,
): Promise<LiftMetrics> {
  const start = new Date(`${opts.prevFrom}T00:00:00Z`);
  const end = new Date(`${opts.to}T00:00:00Z`);
  const rows = await client.liftLog.findMany({
    where: { userId, date: { gte: start, lte: end } },
    select: { date: true, exerciseName: true, weightKg: true, reps: true },
    orderBy: { date: "asc" },
  });

  const dayCounts = new Map<string, number>();
  const exercises = new Map<string, ExerciseMetrics>();

  for (const row of rows) {
    const iso = row.date.toISOString().slice(0, 10);
    const kg = Number(row.weightKg);
    const inCurrent = iso >= opts.from && iso <= opts.to;
    const inPrevious = iso >= opts.prevFrom && iso <= opts.prevTo;
    if (!inCurrent && !inPrevious) continue;

    const entry =
      exercises.get(row.exerciseName) ??
      {
        name: row.exerciseName,
        sets: 0,
        volume: 0,
        bestKg: 0,
        bestReps: 0,
        bestDate: iso,
        prevBestKg: 0,
        currentTopKg: 0,
        previousTopKg: 0,
      };

    if (kg > entry.bestKg) {
      entry.prevBestKg = entry.bestKg;
      entry.bestKg = kg;
      entry.bestReps = row.reps;
      entry.bestDate = iso;
    }

    if (inCurrent) {
      dayCounts.set(iso, (dayCounts.get(iso) ?? 0) + 1);
      entry.sets += 1;
      entry.volume += kg * row.reps;
      entry.currentTopKg = Math.max(entry.currentTopKg, kg);
    } else {
      entry.previousTopKg = Math.max(entry.previousTopKg, kg);
    }

    exercises.set(row.exerciseName, entry);
  }

  return {
    days: Array.from(dayCounts.entries())
      .map(([date, sets]) => ({ date, sets }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    exercises: Array.from(exercises.values()),
  };
}

const MAX_RECENT_EXERCISES = 12;

function daysBefore(isoDate: string, days: number): Date {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

/**
 * The Lift screen's "recent exercises" and "Last:" cue, computed in SQL.
 *
 * The client used to download every set of the last four months and reduce them in
 * JS — and that refetched on each logged set. This returns 12 names and one row
 * per exercise instead.
 */
export async function getLiftSummary(
  userId: string,
  opts: { days: number; before: string },
  client: Pick<PrismaClient, "liftLog"> = prisma,
): Promise<LiftSummary> {
  const days = Math.max(1, Math.min(730, Math.round(opts.days)));
  const before = new Date(`${opts.before}T00:00:00Z`);
  const from = daysBefore(opts.before, days);

  const grouped = await client.liftLog.groupBy({
    by: ["exerciseName"],
    where: { userId, date: { gte: from, lte: before } },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: MAX_RECENT_EXERCISES,
  });
  const names = grouped.map((row) => row.exerciseName);
  if (names.length === 0) return { names: [], lastByExercise: [] };

  // One row per exercise: newest session, heaviest set of that session — the same
  // rule the client applied in JS, and strictly before the athlete's today.
  const lastByExercise = await client.liftLog.findMany({
    where: { userId, exerciseName: { in: names }, date: { lt: before } },
    orderBy: [{ date: "desc" }, { weightKg: "desc" }],
    distinct: ["exerciseName"],
    select: liftLogSelect,
  });

  return { names, lastByExercise };
}
