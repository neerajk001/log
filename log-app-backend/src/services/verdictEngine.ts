export type VerdictKind = "hold" | "adjust_calories" | "check_recovery";
export type StrengthTrend = "up" | "flat" | "down";

export interface PerExerciseDelta {
  name: string;
  thisWeekKg: number | null;
  lastWeekKg: number | null;
}

export interface PreviousVerdict {
  strengthTrend: StrengthTrend;
  weightTrendKgPerWeek: number | null;
}

/** A weight observation pinned to its calendar offset (0–6) in the trailing week. */
export interface WeightPoint {
  day: number;
  kg: number;
}

export interface VerdictInput {
  weightSeriesKg: (number | WeightPoint)[];
  perExercise: PerExerciseDelta[];
  adherencePct: number | null;
  previousVerdict: PreviousVerdict | null;
  /**
   * The athlete doesn't weigh themselves. We skip the weight-data gate and judge
   * on strength and adherence alone, rather than leaving them without a verdict.
   */
  allowNoWeight?: boolean;
}

export interface VerdictOutput {
  verdict: VerdictKind;
  reasoning: string[];
  weightTrendKgPerWeek: number | null;
  strengthTrend: StrengthTrend | null;
  adherencePct: number | null;
}

/** A stored `weekly_verdicts` row, as read back from the database. */
export interface StoredVerdict {
  verdict: string;
  weightTrendKgPerWeek: unknown;
  strengthTrend: string | null;
  adherencePct: number | null;
  reasoning: unknown;
}

/**
 * Whether a freshly computed verdict says the same thing as the row already stored
 * for the week. `GET /api/verdict/weekly` computes on read, but it only needs to
 * write when the picture actually changed — otherwise merely opening the app is a
 * database write.
 */
export function verdictIsUnchanged(stored: StoredVerdict, computed: VerdictOutput): boolean {
  const storedWeight =
    stored.weightTrendKgPerWeek == null ? null : Number(stored.weightTrendKgPerWeek);
  const computedWeight = computed.weightTrendKgPerWeek ?? null;
  // `weight_trend_kg_per_week` is Decimal(4,2), so the stored value is rounded —
  // compare with slack rather than demanding float equality.
  const sameWeight =
    storedWeight == null || computedWeight == null
      ? storedWeight === computedWeight
      : Math.abs(storedWeight - computedWeight) < 0.005;

  const storedReasoning = Array.isArray(stored.reasoning) ? (stored.reasoning as unknown[]) : [];

  return (
    sameWeight &&
    stored.verdict === computed.verdict &&
    stored.strengthTrend === computed.strengthTrend &&
    stored.adherencePct === computed.adherencePct &&
    storedReasoning.join("\n") === computed.reasoning.join("\n")
  );
}

export interface StrengthLiftRow {
  date: Date;
  exerciseName: string;
  weightKg: unknown;
}

/** Highest kg set for one exercise inside a week (bodyweight/plate ignored). */
function topSetByWeek(
  rows: StrengthLiftRow[],
  weekStart: Date,
  weekEnd: Date,
): number | null {
  let max: number | null = null;
  for (const row of rows) {
    if (row.date < weekStart || row.date >= weekEnd) continue;
    if (row.weightKg == null) continue;
    const kg = Number(row.weightKg);
    if (max == null || kg > max) max = kg;
  }
  return max;
}

/**
 * One delta per exercise, using only that exercise's sets. Computing a single
 * global top set and copying it onto every exercise makes all movements look
 * identical, which corrupts the strength trend and the weekly verdict.
 */
export function buildPerExerciseDeltas(
  lifts: StrengthLiftRow[],
  currentWeekStart: Date,
  previousWeekStart: Date,
): PerExerciseDelta[] {
  const nextWeekStart = new Date(currentWeekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);
  const byExercise = new Map<string, StrengthLiftRow[]>();
  for (const row of lifts) {
    const rows = byExercise.get(row.exerciseName) ?? [];
    rows.push(row);
    byExercise.set(row.exerciseName, rows);
  }
  return Array.from(byExercise.entries())
    .slice(0, 200)
    .map(([name, rows]) => ({
      name,
      thisWeekKg: topSetByWeek(rows, currentWeekStart, nextWeekStart),
      lastWeekKg: topSetByWeek(rows, previousWeekStart, currentWeekStart),
    }));
}

const STRENGTH_DELTA_THRESHOLD = 0.025;
/**
 * Sparse weighers are normal — plenty of people weigh once a week. Two weigh-ins
 * spanning at least this many days are enough to read a weekly rate, so we don't
 * demand a 4-of-7-days diary.
 */
const MIN_WEIGH_IN_SPAN_DAYS = 5;

export function linearRegressionSlopePerDay(values: number[]): number | null {
  return linearRegressionSlope(values.map((y, i) => ({ x: i, y })));
}

function linearRegressionSlope(points: { x: number; y: number }[]): number | null {
  const n = points.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const { x, y } of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;

  return (n * sumXY - sumX * sumY) / denom;
}

export function computeStrengthTrend(
  perExercise: PerExerciseDelta[],
): StrengthTrend | null {
  let usable = 0;
  let up = 0;
  let down = 0;

  for (const ex of perExercise) {
    if (ex.thisWeekKg == null || ex.lastWeekKg == null || ex.lastWeekKg === 0) continue;
    usable++;
    const delta = (ex.thisWeekKg - ex.lastWeekKg) / ex.lastWeekKg;
    if (delta > STRENGTH_DELTA_THRESHOLD) up++;
    else if (delta < -STRENGTH_DELTA_THRESHOLD) down++;
  }

  if (usable === 0) return null;
  if (up >= 2 && down === 0) return "up";
  if (down >= 2 && up === 0) return "down";
  return "flat";
}

/** Spread of the weight samples in days (0 when there's nothing to spread). */
export function weighInSpanDays(series: (number | WeightPoint)[]): number {
  const xs = series.map((p, i) => (typeof p === "number" ? i : p.day));
  return xs.length < 2 ? 0 : Math.max(...xs) - Math.min(...xs);
}

export function computeVerdict(input: VerdictInput): VerdictOutput {
  const reasoning: string[] = [];

  const spanDays = weighInSpanDays(input.weightSeriesKg);
  const enoughWeight = input.weightSeriesKg.length >= 2 && spanDays >= MIN_WEIGH_IN_SPAN_DAYS;
  // How sparse the weigh-ins are, so a two-point reading says so out loud.
  const basis =
    input.weightSeriesKg.length >= 4
      ? ""
      : ` (from ${input.weightSeriesKg.length} weigh-ins over ${spanDays} days)`;

  if (!input.allowNoWeight && !enoughWeight) {
    return {
      verdict: "hold",
      reasoning: ["Log two weigh-ins a few days apart and I can read your trend"],
      weightTrendKgPerWeek: null,
      strengthTrend: null,
      adherencePct: input.adherencePct,
    };
  }

  const slopePerDay = linearRegressionSlope(
    input.weightSeriesKg.map((p, i) =>
      typeof p === "number" ? { x: i, y: p } : { x: p.day, y: p.kg },
    ),
  );
  // Decimal(4,2) stores at most ±99.99; clamp the computed slope so an extreme
  // (but schema-valid) weight series cannot overflow the verdict upsert.
  const weightTrendKgPerWeek =
    slopePerDay == null
      ? null
      : Math.max(-99.99, Math.min(99.99, slopePerDay * 7));
  const strengthTrend = computeStrengthTrend(input.perExercise);

  const prev = input.previousVerdict;
  const strengthDownTwoWeeks =
    strengthTrend === "down" &&
    prev != null &&
    prev.strengthTrend === "down";
  const weightStalledTwoWeeks =
    weightTrendKgPerWeek != null &&
    weightTrendKgPerWeek > -0.2 &&
    prev != null &&
    prev.weightTrendKgPerWeek != null &&
    prev.weightTrendKgPerWeek > -0.2;

  if (strengthDownTwoWeeks) {
    reasoning.push(
      "Strength has dropped two weeks in a row",
      "Check sleep, stress, and adherence before pushing harder",
    );
    return {
      verdict: "check_recovery",
      reasoning,
      weightTrendKgPerWeek,
      strengthTrend,
      adherencePct: input.adherencePct,
    };
  }

  if (weightTrendKgPerWeek != null && weightTrendKgPerWeek < -0.8 && strengthTrend !== "up") {
    reasoning.push(
      `Weight dropping ${weightTrendKgPerWeek.toFixed(2)} kg/wk${basis} — faster than the 0.4–0.8 target`,
      "Deficit is too aggressive for current strength — increase calories slightly",
    );
    if (strengthTrend === "down") {
      reasoning.push("Strength also trending down this week");
    }
    return {
      verdict: "adjust_calories",
      reasoning,
      weightTrendKgPerWeek,
      strengthTrend,
      adherencePct: input.adherencePct,
    };
  }

  if (
    weightStalledTwoWeeks &&
    input.adherencePct != null &&
    input.adherencePct >= 80
  ) {
    reasoning.push(
      "Weight has stalled for two consecutive weeks",
      `Adherence is ${input.adherencePct}% — tracking is not the cause`,
      "Intake is likely underestimated, or the deficit is too small",
    );
    return {
      verdict: "adjust_calories",
      reasoning,
      weightTrendKgPerWeek,
      strengthTrend,
      adherencePct: input.adherencePct,
    };
  }

  if (weightTrendKgPerWeek != null) {
    if (weightTrendKgPerWeek >= -0.8 && weightTrendKgPerWeek <= -0.3) {
      reasoning.push(
        `Weight trending ${weightTrendKgPerWeek.toFixed(2)} kg/wk${basis} — in the 0.3–0.8 target range`,
      );
    } else if (weightTrendKgPerWeek > -0.2) {
      reasoning.push(`Weight stalled this week${basis}`);
    } else {
      reasoning.push(
        `Weight trending ${weightTrendKgPerWeek.toFixed(2)} kg/wk${basis} — slightly outside target`,
      );
    }
  }

  if (strengthTrend === "up") {
    reasoning.push("Strength is up this week — no muscle-loss signal");
  } else if (strengthTrend === "flat") {
    reasoning.push("Strength is flat this week — holding steady");
  } else if (strengthTrend === "down") {
    reasoning.push("Strength dipped this week — watch next week for a second decline");
  }

  if (input.adherencePct != null) {
    reasoning.push(`Protein hit on ${input.adherencePct}% of days this week`);
  }

  return {
    verdict: "hold",
    reasoning,
    weightTrendKgPerWeek,
    strengthTrend,
    adherencePct: input.adherencePct,
  };
}