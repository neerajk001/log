import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db/client";

export type LiftProgressMode = "kg" | "plate" | "bw";
export type LiftProgressUnit = "kg" | "lb";

/** The best set of one session, shaped for the same formatters as a logged set. */
export interface LiftProgressBestSet {
  weight_kg: number | null;
  reps: number;
  plate_position: number | null;
  plate_increment: number | null;
  plate_unit: LiftProgressUnit | null;
}

/** One exercise's aggregate for one training day. */
export interface LiftProgressPoint {
  date: string;
  sets: number;
  reps: number;
  /** Kg volume only; plate and bodyweight sets contribute zero. */
  volume: number;
  /** Weight, stack position, or reps depending on the exercise's mode. */
  top_value: number | null;
  best_set: LiftProgressBestSet;
}

export interface LiftProgressExercise {
  name: string;
  mode: LiftProgressMode;
  sessions: number;
  sets: number;
  volume: number;
  /** Best top_value in the current window. */
  best_value: number | null;
  /** The same metric in the equally-long window before it. */
  previous_best_value: number | null;
  /** Percent change for kg exercises; null for plate/bodyweight. */
  change_pct: number | null;
  /** Absolute change in the mode's unit (kg, positions, or reps). */
  change_value: number | null;
  best_set: LiftProgressBestSet;
  /** Session aggregates, oldest first. */
  points: LiftProgressPoint[];
}

export interface LiftProgressResult {
  from: string;
  to: string;
  prev_from: string;
  prev_to: string;
  exercises: LiftProgressExercise[];
}

type ProgressRow = {
  date: Date;
  exerciseName: string;
  weightKg: Prisma.Decimal | null;
  reps: number;
  platePosition: number | null;
  plateIncrement: Prisma.Decimal | null;
  plateUnit: string | null;
};

function isoOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function unitOf(value: string | null): LiftProgressUnit | null {
  return value === "kg" || value === "lb" ? value : null;
}

function valueOf(row: ProgressRow, mode: LiftProgressMode): number | null {
  if (mode === "kg") return row.weightKg == null ? null : Number(row.weightKg);
  if (mode === "plate") return row.platePosition;
  return row.weightKg == null && row.platePosition == null ? row.reps : null;
}

function bestSetOf(row: ProgressRow): LiftProgressBestSet {
  return {
    weight_kg: row.weightKg == null ? null : Number(row.weightKg),
    reps: row.reps,
    plate_position: row.platePosition,
    plate_increment: row.plateIncrement == null ? null : Number(row.plateIncrement),
    plate_unit: unitOf(row.plateUnit),
  };
}

/** Pick the session's top set for the exercise's mode. */
function pickTop(rows: ProgressRow[], mode: LiftProgressMode): ProgressRow | null {
  let best: ProgressRow | null = null;
  for (const row of rows) {
    const value = valueOf(row, mode);
    if (value == null) continue;
    if (best == null) {
      best = row;
      continue;
    }
    const bestValue = valueOf(best, mode);
    if (bestValue == null || value > bestValue || (value === bestValue && row.reps > best.reps)) {
      best = row;
    }
  }
  // A session that only contains another mode (e.g. a stray bodyweight set in
  // a kg exercise) still needs a readable "best set" for the recent-session row.
  if (best == null) {
    for (const row of rows) {
      if (best == null || row.reps > best.reps) best = row;
    }
  }
  return best;
}

function modeOf(rows: ProgressRow[]): LiftProgressMode {
  if (rows.some((row) => row.weightKg != null)) return "kg";
  if (rows.some((row) => row.platePosition != null)) return "plate";
  return "bw";
}

function previousBest(rows: ProgressRow[], mode: LiftProgressMode): number | null {
  let best: number | null = null;
  for (const row of rows) {
    const value = valueOf(row, mode);
    if (value == null) continue;
    if (best == null || value > best) best = value;
  }
  return best;
}

/**
 * Per-exercise progress for the Insights "Lift progress" card and the exercise
 * detail screen. Sessions are aggregated server-side; raw sets never leave the
 * backend. `from`/`to` are inclusive date strings, and `prev_from`/`prev_to`
 * are the equally-long window immediately before `from`.
 */
export async function getLiftProgress(
  userId: string,
  opts: { from: string; to: string; prevFrom: string; prevTo: string },
  client: Pick<PrismaClient, "liftLog"> = prisma,
): Promise<LiftProgressResult> {
  const rows = (await client.liftLog.findMany({
    where: {
      userId,
      date: {
        gte: new Date(`${opts.prevFrom}T00:00:00Z`),
        lte: new Date(`${opts.to}T00:00:00Z`),
      },
    },
    select: {
      date: true,
      exerciseName: true,
      weightKg: true,
      reps: true,
      platePosition: true,
      plateIncrement: true,
      plateUnit: true,
    },
    orderBy: [{ date: "asc" }],
  })) as ProgressRow[];

  const byExercise = new Map<string, ProgressRow[]>();
  for (const row of rows) {
    const list = byExercise.get(row.exerciseName) ?? [];
    list.push(row);
    byExercise.set(row.exerciseName, list);
  }

  const exercises: LiftProgressExercise[] = [];

  for (const [name, exerciseRows] of byExercise) {
    const currentRows = exerciseRows.filter((row) => {
      const iso = isoOf(row.date);
      return iso >= opts.from && iso <= opts.to;
    });
    if (currentRows.length === 0) continue;

    const previousRows = exerciseRows.filter((row) => {
      const iso = isoOf(row.date);
      return iso >= opts.prevFrom && iso <= opts.prevTo;
    });
    const mode = modeOf(currentRows);

    const byDate = new Map<string, ProgressRow[]>();
    for (const row of currentRows) {
      const iso = isoOf(row.date);
      const list = byDate.get(iso) ?? [];
      list.push(row);
      byDate.set(iso, list);
    }

    const points: LiftProgressPoint[] = [];
    for (const [date, sessionRows] of byDate) {
      const top = pickTop(sessionRows, mode);
      const volume = sessionRows.reduce((sum, row) => {
        const kg = row.weightKg == null ? 0 : Number(row.weightKg);
        return sum + kg * row.reps;
      }, 0);
      points.push({
        date,
        sets: sessionRows.length,
        reps: sessionRows.reduce((sum, row) => sum + row.reps, 0),
        volume: round(volume, 2),
        top_value: top == null ? null : valueOf(top, mode),
        best_set: top == null ? { weight_kg: null, reps: 0, plate_position: null, plate_increment: null, plate_unit: null } : bestSetOf(top),
      });
    }
    points.sort((a, b) => a.date.localeCompare(b.date));

    const bestPoint = points.reduce<LiftProgressPoint | null>((best, point) => {
      if (point.top_value == null) return best;
      if (best == null || best.top_value == null || point.top_value > best.top_value) return point;
      return best;
    }, null);
    const bestValue = bestPoint?.top_value ?? null;
    const prevValue = previousBest(previousRows, mode);
    const changeValue =
      bestValue != null && prevValue != null ? round(bestValue - prevValue, 2) : null;
    const changePct =
      mode === "kg" && bestValue != null && prevValue != null && prevValue > 0
        ? round(((bestValue - prevValue) / prevValue) * 100, 1)
        : null;

    exercises.push({
      name,
      mode,
      sessions: points.length,
      sets: points.reduce((sum, point) => sum + point.sets, 0),
      volume: round(points.reduce((sum, point) => sum + point.volume, 0), 2),
      best_value: bestValue,
      previous_best_value: prevValue,
      change_pct: changePct,
      change_value: changeValue,
      best_set:
        bestPoint?.best_set ?? {
          weight_kg: null,
          reps: 0,
          plate_position: null,
          plate_increment: null,
          plate_unit: null,
        },
      points,
    });
  }

  exercises.sort((a, b) => {
    const aLatest = a.points[a.points.length - 1]?.date ?? "";
    const bLatest = b.points[b.points.length - 1]?.date ?? "";
    return bLatest.localeCompare(aLatest) || a.name.localeCompare(b.name);
  });

  return {
    from: opts.from,
    to: opts.to,
    prev_from: opts.prevFrom,
    prev_to: opts.prevTo,
    exercises,
  };
}
