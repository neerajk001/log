import { prisma } from "../db/client";

export type TrendRange = "7d" | "30d" | "90d" | "1y";
export type BucketSize = "day" | "week" | "month";

export interface TrendBucket {
  start: string;
  weight_kg: number | null;
  calories: number | null;
  protein_g: number | null;
  /**
   * How many completed days in this bucket actually had calories/protein — the basis for the
   * averages above. Days left unlogged are absent from the average, never counted as zero.
   */
  days: number;
}

/** One month of the consistency rollup (newest first in the response). */
export interface MonthSummary {
  month_start: string;
  workouts: number;
  days_logged: number;
  calories: number | null;
  protein_g: number | null;
  protein_adherence_pct: number | null;
  calorie_adherence_pct: number | null;
}

export interface LiftDelta {
  exercise: string;
  this_week_kg: number | null;
  last_week_kg: number | null;
  delta: "up" | "flat" | "down";
}

export interface TrendsResult {
  bucket: BucketSize;
  series: TrendBucket[];
  /** Weekly nutrient averages for the nutrition card (its own window). */
  nutrition: TrendBucket[];
  /**
   * The selected nutrition window plus the preceding equally-long window, as
   * completed daily buckets ending yesterday (2 × weeks × 7 days). The card
   * uses the tail for the current window and the slice before it for the
   * comparison, so "2 weeks" really means 14 completed days.
   */
  nutrition_days: TrendBucket[];
  months: MonthSummary[];
  lifts: LiftDelta[];
  adherence_pct: number | null;
  calorie_adherence_pct: number | null;
}

const STRENGTH_DELTA_THRESHOLD = 0.025;
/** How many buckets each range shows, and how wide each bucket is. */
const RANGE_BUCKETS: Record<TrendRange, { bucket: BucketSize; count: number }> = {
  "7d": { bucket: "day", count: 7 },
  "30d": { bucket: "week", count: 5 },
  "90d": { bucket: "week", count: 13 },
  "1y": { bucket: "month", count: 12 },
};
const MONTHS_BACK = 6;
/** 1 week = just the current week, which is what the app shows first. */
const DEFAULT_NUTRITION_WEEKS = 1;
const MIN_NUTRITION_WEEKS = 1;
const MAX_NUTRITION_WEEKS = 52;

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

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

function daysInMonth(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function average(values: number[], decimals = 0): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Number(mean.toFixed(decimals));
}

function numbers(values: (number | null)[]): number[] {
  return values.filter((v): v is number => v != null);
}

/** Days that met `target` as a percentage of the days available. */
function hitsPct(
  logs: { date: Date; proteinG: number | null; calories: number | null }[],
  pick: (log: { proteinG: number | null; calories: number | null }) => number | null,
  target: number | null,
  days: number,
): number | null {
  if (target == null || target <= 0 || days <= 0) return null;
  let hits = 0;
  for (const log of logs) {
    const value = pick(log);
    if (value != null && value >= target) hits++;
  }
  return clamp(Math.round((hits / days) * 100), 0, 100);
}

function bucketStart(d: Date, bucket: BucketSize): Date {
  if (bucket === "day") return d;
  if (bucket === "week") return startOfIsoWeek(d);
  return startOfMonth(d);
}

function shiftBucket(d: Date, bucket: BucketSize, n: number): Date {
  if (bucket === "day") return addDays(d, n);
  if (bucket === "week") return addDays(d, n * 7);
  return addMonths(d, n);
}

function topSetByWeek(
  lifts: { date: Date; exerciseName: string; weightKg: unknown }[],
  weekStart: Date,
  weekEnd: Date,
): number | null {
  let max: number | null = null;
  for (const l of lifts) {
    if (l.date < weekStart || l.date >= weekEnd) continue;
    // Bodyweight sets carry no load, so they can't set a top-set delta.
    if (l.weightKg == null) continue;
    const w = Number(l.weightKg);
    if (max == null || w > max) max = w;
  }
  return max;
}

/** `count` consecutive buckets ending with the one that contains `anchor`. */
function buildBuckets(
  logs: { date: Date; weightKg: unknown; proteinG: number | null; calories: number | null }[],
  anchor: Date,
  bucket: BucketSize,
  count: number,
  today: Date,
): TrendBucket[] {
  const out: TrendBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = shiftBucket(anchor, bucket, -i);
    const end = shiftBucket(start, bucket, 1);
    const inBucket = logs.filter((l) => l.date >= start && l.date < end);
    // Today isn't over, so a partial day would drag the average down. Nutrition
    // counts completed days only; weight is a momentary reading, so it counts.
    const completed = inBucket.filter((l) => l.date < today);
    out.push({
      start: toUtcDateString(start),
      weight_kg: average(
        numbers(inBucket.map((l) => (l.weightKg == null ? null : Number(l.weightKg)))),
        2,
      ),
      calories: average(numbers(completed.map((l) => l.calories))),
      protein_g: average(numbers(completed.map((l) => l.proteinG))),
      // Days that contributed: a day with neither value isn't part of the average.
      days: completed.filter((l) => l.calories != null || l.proteinG != null).length,
    });
  }
  return out;
}

/**
 * Trends for the Insights screen: a series bucketed to the requested range
 * (day for 7d, week for 30d/90d, month for 1y), a weekly nutrient series for
 * the nutrition card's own window, a six-month consistency rollup,
 * this-vs-last-week lift deltas, and the week's target adherence.
 */
export async function computeTrends(
  userId: string,
  range: TrendRange = "30d",
  options: { nutritionWeeks?: number; now?: Date } = {},
): Promise<TrendsResult> {
  const now = options.now ?? new Date();
  const nutritionWeeks = clamp(
    Math.round(options.nutritionWeeks ?? DEFAULT_NUTRITION_WEEKS),
    MIN_NUTRITION_WEEKS,
    MAX_NUTRITION_WEEKS,
  );
  const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const currentWeekStart = startOfIsoWeek(todayUtcMidnight);
  const lastWeekStart = addDays(currentWeekStart, -7);
  // Wide enough for the 1y monthly buckets, the six-month rollup, and the
  // selected nutrition window (up to 52 weeks plus its comparison week).
  const monthlyStart = addMonths(startOfMonth(todayUtcMidnight), -(MONTHS_BACK + 5));
  // The daily nutrition series needs the selected window plus the equally-long
  // previous window for the comparison.
  const nutritionStart = addDays(currentWeekStart, -(nutritionWeeks * 14 + 7));
  const historyStart = new Date(Math.min(monthlyStart.getTime(), nutritionStart.getTime()));

  const [logs, liftDates, lifts, user] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: historyStart, lte: todayUtcMidnight } },
      select: { date: true, weightKg: true, proteinG: true, calories: true },
      orderBy: { date: "asc" },
    }),
    // One row per training day — enough for the monthly workout counts.
    // Capped at today like every sibling query: future-dated rows must not
    // inflate the current month's workout count.
    prisma.liftLog.groupBy({
      by: ["date"],
      where: { userId, date: { gte: historyStart, lte: todayUtcMidnight } },
      _count: { _all: true },
    }),
    prisma.liftLog.findMany({
      where: { userId, date: { gte: lastWeekStart, lte: todayUtcMidnight } },
      select: { date: true, exerciseName: true, weightKg: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { proteinTargetG: true, calorieTarget: true },
    }),
  ]);

  const proteinTarget = user?.proteinTargetG ?? null;
  const calorieTarget = user?.calorieTarget ?? null;

  const { bucket, count } = RANGE_BUCKETS[range] ?? RANGE_BUCKETS["30d"];
  const series = buildBuckets(
    logs,
    bucketStart(todayUtcMidnight, bucket),
    bucket,
    count,
    todayUtcMidnight,
  );
  // The nutrition card always reads weekly averages. It ends on the current week when that
  // week has completed data; otherwise (a Monday, or a week with nothing logged yet) it ends
  // on the last complete week instead of showing an empty card — the client labels which one
  // from the bucket's start date.
  const thisWeek = buildBuckets(logs, currentWeekStart, "week", 1, todayUtcMidnight)[0];
  const currentWeekHasData = thisWeek.calories != null || thisWeek.protein_g != null;
  const nutrition = buildBuckets(
    logs,
    currentWeekHasData ? currentWeekStart : addDays(currentWeekStart, -7),
    "week",
    nutritionWeeks,
    todayUtcMidnight,
  );
  // Rolling, fully-completed days for every nutrition window: the selected
  // N weeks plus the preceding N weeks. Anchoring on yesterday avoids the
  // "6 of 7" off-by-one caused by excluding today's half-finished intake.
  const nutritionDays = buildBuckets(
    logs,
    addDays(todayUtcMidnight, -1),
    "day",
    nutritionWeeks * 14,
    todayUtcMidnight,
  );

  const workoutDays = liftDates.map((row) => row.date.getTime());
  const currentMonthStart = startOfMonth(todayUtcMidnight);
  const months: MonthSummary[] = [];
  for (let i = 0; i < MONTHS_BACK; i++) {
    const monthStart = addMonths(currentMonthStart, -i);
    const monthEnd = addMonths(monthStart, 1);
    const monthLogs = logs.filter((l) => l.date >= monthStart && l.date < monthEnd);
    // Same rule as the series: today's partial totals stay out of the averages.
    const completedInMonth = monthLogs.filter((l) => l.date < todayUtcMidnight);
    // The month in progress divides by the days elapsed so far.
    const elapsedDays = i === 0 ? todayUtcMidnight.getUTCDate() : daysInMonth(monthStart);
    months.push({
      month_start: toUtcDateString(monthStart),
      workouts: workoutDays.filter((t) => t >= monthStart.getTime() && t < monthEnd.getTime()).length,
      days_logged: monthLogs.length,
      calories: average(numbers(completedInMonth.map((l) => l.calories))),
      protein_g: average(numbers(completedInMonth.map((l) => l.proteinG))),
      // A month with nothing logged reports no adherence, not 0%.
      protein_adherence_pct:
        monthLogs.length === 0
          ? null
          : hitsPct(monthLogs, (l) => l.proteinG, proteinTarget, elapsedDays),
      calorie_adherence_pct:
        monthLogs.length === 0
          ? null
          : hitsPct(monthLogs, (l) => l.calories, calorieTarget, elapsedDays),
    });
  }

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

  const weekLogs = logs.filter((l) => l.date >= currentWeekStart);
  // Same rule as the weekly verdict: dividing by all 7 days made a Tuesday with both
  // of its target days hit read as 29% here while the verdict screen said 100%.
  const weekElapsedDays = clamp(
    Math.floor((todayUtcMidnight.getTime() - currentWeekStart.getTime()) / 86400000) + 1,
    1,
    7,
  );

  return {
    bucket,
    series,
    nutrition,
    nutrition_days: nutritionDays,
    months,
    lifts: liftDeltas,
    adherence_pct: hitsPct(weekLogs, (l) => l.proteinG, proteinTarget, weekElapsedDays),
    calorie_adherence_pct: hitsPct(weekLogs, (l) => l.calories, calorieTarget, weekElapsedDays),
  };
}
