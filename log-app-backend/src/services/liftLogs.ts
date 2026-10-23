import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import { liftLogSchema, liftLogUpdateSchema } from "../validation/schemas";
import type { z } from "zod";

export type LiftLogInput = z.infer<typeof liftLogSchema>;
export type LiftLogUpdateInput = z.infer<typeof liftLogUpdateSchema>;

type LiftLogRecord = {
  id: string;
  userId: string;
  date: Date;
  exerciseName: string;
  /** Null = bodyweight set (reps only) or a machine plate-stack set. */
  weightKg: Prisma.Decimal | null;
  reps: number;
  platePosition: number | null;
  plateIncrement: Prisma.Decimal | null;
  plateUnit: string | null;
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
  platePosition: true,
  plateIncrement: true,
  plateUnit: true,
  planDayId: true,
} satisfies Prisma.LiftLogSelect;

export function serializeLiftLog(log: Omit<LiftLogRecord, "userId"> | LiftLogRecord) {
  return {
    id: log.id,
    date: log.date.toISOString().slice(0, 10),
    exercise_name: log.exerciseName,
    weight_kg: log.weightKg == null ? null : Number(log.weightKg),
    reps: log.reps,
    plate_position: log.platePosition ?? null,
    plate_increment: log.plateIncrement == null ? null : Number(log.plateIncrement),
    plate_unit: log.plateUnit === "kg" || log.plateUnit === "lb" ? log.plateUnit : null,
    plan_day_id: log.planDayId,
  };
}

function sameDecimal(stored: Prisma.Decimal | null, input: number | null | undefined): boolean {
  if (stored == null) return input == null;
  return input != null && stored.equals(new Prisma.Decimal(input).toDecimalPlaces(2));
}

function sameLiftRequest(log: LiftLogRecord, userId: string, input: LiftLogInput): boolean {
  return (
    log.userId === userId &&
    log.date.toISOString().slice(0, 10) === input.date &&
    log.exerciseName === input.exercise_name &&
    sameDecimal(log.weightKg, input.weight_kg) &&
    log.reps === input.reps &&
    (log.platePosition ?? null) === (input.plate_position ?? null) &&
    sameDecimal(log.plateIncrement, input.plate_increment) &&
    (log.plateUnit ?? null) === (input.plate_unit ?? null) &&
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
        weightKg: input.weight_kg ?? null,
        reps: input.reps,
        platePosition: input.plate_position ?? null,
        plateIncrement: input.plate_increment ?? null,
        plateUnit: input.plate_unit ?? null,
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

/** Update the load/reps of one owned set. Returns null when not found. */
export async function updateLiftLog(
  userId: string,
  id: string,
  input: LiftLogUpdateInput,
  client: LiftLogClient = prisma,
): Promise<LiftLogRecord | null> {
  const data: Prisma.LiftLogUpdateManyMutationInput = {
    weightKg: input.weight_kg,
    reps: input.reps,
  };
  if (input.weight_kg != null) {
    // A kg set replaces any plate-stack data on the row.
    data.platePosition = null;
    data.plateIncrement = null;
    data.plateUnit = null;
  } else if (input.plate_position !== undefined) {
    data.platePosition = input.plate_position;
    if (input.plate_position == null) {
      // Clearing the position clears its calibration.
      if (input.plate_increment === undefined) data.plateIncrement = null;
      if (input.plate_unit === undefined) data.plateUnit = null;
    }
    if (input.plate_increment !== undefined) data.plateIncrement = input.plate_increment;
    if (input.plate_unit !== undefined) data.plateUnit = input.plate_unit;
  }
  // When plate fields are omitted (e.g. a coach correcting reps), keep the
  // existing plate snapshot instead of silently turning the set into bodyweight.

  const result = await client.liftLog.updateMany({
    where: { id, userId },
    data,
  });
  if (result.count === 0) return null;
  return findExisting(client, id);
}

/** One set of a previous session, in the order it was logged. */
export interface ExerciseSet {
  /** Null = bodyweight set (reps only) or machine plate-stack set. */
  weight_kg: number | null;
  reps: number;
  /** Numbered stack position for machine sets; null otherwise. */
  plate_position: number | null;
  /** Calibration snapshot for the set, so history stays correct. */
  plate_increment: number | null;
  plate_unit: string | null;
}

/** The sets of an exercise's previous session. */
export interface LastSessionSets {
  date: string;
  sets: ExerciseSet[];
}

/** Recent exercise names plus the top set from each one's previous session. */
export interface LiftSummary {
  names: string[];
  lastByExercise: LiftLogRecord[];
  /**
   * Every set of each exercise's previous session (newest session before today),
   * in logged order, so the lift rows can be pre-filled set-by-set instead of
   * every row getting the same heaviest set. Capped per session.
   */
  lastSetsByExercise: Record<string, LastSessionSets>;
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
    // Bodyweight sets still count as work (and in `days`), but they have no load
    // to add to volume or compare as a record.
    const kg = row.weightKg == null ? null : Number(row.weightKg);
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

    if (kg != null && kg > entry.bestKg) {
      entry.prevBestKg = entry.bestKg;
      entry.bestKg = kg;
      entry.bestReps = row.reps;
      entry.bestDate = iso;
    }

    if (inCurrent) {
      dayCounts.set(iso, (dayCounts.get(iso) ?? 0) + 1);
      entry.sets += 1;
      if (kg != null) {
        entry.volume += kg * row.reps;
        entry.currentTopKg = Math.max(entry.currentTopKg, kg);
      }
    } else if (kg != null) {
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
/** Bound on the per-session set list returned for pre-filling (plenty for training). */
const MAX_SETS_PER_SESSION = 20;

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
  if (names.length === 0) return { names: [], lastByExercise: [], lastSetsByExercise: {} };

  // One row per exercise: newest session, heaviest set of that session — the same
  // rule the client applied in JS, and strictly before the athlete's today.
  // Bodyweight sets (null) sort after weighted ones, so a loaded set stays the cue.
  const lastByExercise = await client.liftLog.findMany({
    where: { userId, exerciseName: { in: names }, date: { gte: from, lt: before } },
    orderBy: [
      { date: "desc" },
      { weightKg: { sort: "desc", nulls: "last" } },
      { platePosition: { sort: "desc", nulls: "last" } },
    ],
    distinct: ["exerciseName"],
    select: liftLogSelect,
  });

  // Then every set of each exercise's newest session, in logged order.
  const sessionRows = await client.liftLog.findMany({
    where: { userId, exerciseName: { in: names }, date: { gte: from, lt: before } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: liftLogSelect,
  });
  const rowsByExercise = new Map<string, LiftLogRecord[]>();
  for (const row of sessionRows) {
    const list = rowsByExercise.get(row.exerciseName) ?? [];
    list.push(row);
    rowsByExercise.set(row.exerciseName, list);
  }
  const lastSetsByExercise: Record<string, LastSessionSets> = {};
  for (const [exercise, rows] of rowsByExercise) {
    // Date-ascending, so the last row carries the newest session's date.
    const date = rows[rows.length - 1].date.toISOString().slice(0, 10);
    const sets = rows
      .filter((row) => row.date.toISOString().slice(0, 10) === date)
      .slice(0, MAX_SETS_PER_SESSION)
      .map((row) => ({
        weight_kg: row.weightKg == null ? null : Number(row.weightKg),
        reps: row.reps,
        plate_position: row.platePosition ?? null,
        plate_increment: row.plateIncrement == null ? null : Number(row.plateIncrement),
        plate_unit: row.plateUnit === "kg" || row.plateUnit === "lb" ? row.plateUnit : null,
      }));
    if (sets.length > 0) lastSetsByExercise[exercise] = { date, sets };
  }

  return { names, lastByExercise, lastSetsByExercise };
}
