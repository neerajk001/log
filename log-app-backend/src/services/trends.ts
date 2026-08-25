import { prisma } from "../db/client";

export interface WeightPoint {
  week_start: string;
  avg_kg: number | null;
}

export interface LiftDelta {
  exercise: string;
  this_week_kg: number | null;
  last_week_kg: number | null;
  delta: "up" | "flat" | "down";
}

export interface TrendsResult {
  weight: WeightPoint[];
  lifts: LiftDelta[];
  adherence_pct: number | null;
}

const STRENGTH_DELTA_THRESHOLD = 0.025;

function toUtcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfIsoWeek(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return utc;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function topSetByWeek(
  lifts: { date: Date; exerciseName: string; weightKg: unknown }[],
  weekStart: Date,
  weekEnd: Date,
): number | null {
  let max: number | null = null;
  for (const l of lifts) {
    if (l.date < weekStart || l.date >= weekEnd) continue;
    const w = Number(l.weightKg);
    if (max == null || w > max) max = w;
  }
  return max;
}

export async function computeTrends(
  userId: string,
  now: Date = new Date(),
): Promise<TrendsResult> {
  const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentWeekStart = startOfIsoWeek(todayUtcMidnight);
  const lastWeekStart = addDays(currentWeekStart, -7);
  const fourWeeksAgoStart = addDays(currentWeekStart, -28);

  const logs = await prisma.dailyLog.findMany({
    where: {
      userId,
      date: { gte: fourWeeksAgoStart, lte: todayUtcMidnight },
    },
    select: { date: true, weightKg: true, proteinG: true },
    orderBy: { date: "asc" },
  });

  const weight: WeightPoint[] = [];
  for (let i = 0; i < 4; i++) {
    const weekStart = addDays(currentWeekStart, -7 * (3 - i));
    const weekEnd = addDays(weekStart, 7);
    const weekLogs = logs.filter((l) => l.date >= weekStart && l.date < weekEnd && l.weightKg != null);
    if (weekLogs.length === 0) {
      weight.push({ week_start: toUtcDateString(weekStart), avg_kg: null });
      continue;
    }
    const sum = weekLogs.reduce((acc, l) => acc + Number(l.weightKg), 0);
    weight.push({
      week_start: toUtcDateString(weekStart),
      avg_kg: +(sum / weekLogs.length).toFixed(2),
    });
  }

  const lifts = await prisma.liftLog.findMany({
    where: {
      userId,
      date: { gte: lastWeekStart, lte: todayUtcMidnight },
    },
    select: { date: true, exerciseName: true, weightKg: true },
  });

  const byExercise = new Map<string, typeof lifts>();
  for (const l of lifts) {
    const arr = byExercise.get(l.exerciseName) ?? [];
    arr.push(l);
    byExercise.set(l.exerciseName, arr);
  }

  const liftDeltas: LiftDelta[] = [];
  for (const [exercise, entries] of byExercise) {
    const thisWeek = topSetByWeek(entries, currentWeekStart, addDays(currentWeekStart, 7));
    const lastWeek = topSetByWeek(entries, lastWeekStart, currentWeekStart);
    let delta: LiftDelta["delta"] = "flat";
    if (thisWeek != null && lastWeek != null && lastWeek !== 0) {
      const ratio = (thisWeek - lastWeek) / lastWeek;
      if (ratio > STRENGTH_DELTA_THRESHOLD) delta = "up";
      else if (ratio < -STRENGTH_DELTA_THRESHOLD) delta = "down";
    } else if (thisWeek != null && lastWeek == null) {
      delta = "up";
    }
    liftDeltas.push({
      exercise,
      this_week_kg: thisWeek,
      last_week_kg: lastWeek,
      delta,
    });
  }

  liftDeltas.sort((a, b) => a.exercise.localeCompare(b.exercise));

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { proteinTargetG: true },
  });

  let adherencePct: number | null = null;
  if (user?.proteinTargetG != null && user.proteinTargetG > 0) {
    const target = user.proteinTargetG;
    const weekLogs = logs.filter((l) => l.date >= currentWeekStart);
    let hits = 0;
    for (const l of weekLogs) {
      if (l.proteinG != null && l.proteinG >= target) hits++;
    }
    adherencePct = clamp(Math.round((hits / 7) * 100), 0, 100);
  }

  return {
    weight,
    lifts: liftDeltas,
    adherence_pct: adherencePct,
  };
}