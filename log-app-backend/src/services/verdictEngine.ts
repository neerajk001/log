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

export interface VerdictInput {
  weightSeriesKg: number[];
  perExercise: PerExerciseDelta[];
  adherencePct: number | null;
  previousVerdict: PreviousVerdict | null;
}

export interface VerdictOutput {
  verdict: VerdictKind;
  reasoning: string[];
  weightTrendKgPerWeek: number | null;
  strengthTrend: StrengthTrend | null;
  adherencePct: number | null;
}

const STRENGTH_DELTA_THRESHOLD = 0.025;
const MIN_DAYS_FOR_VERDICT = 4;

export function linearRegressionSlopePerDay(values: number[]): number | null {
  const n = values.length;
  if (n < 2) return null;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i];
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

export function computeVerdict(input: VerdictInput): VerdictOutput {
  const reasoning: string[] = [];

  if (input.weightSeriesKg.length < MIN_DAYS_FOR_VERDICT) {
    return {
      verdict: "hold",
      reasoning: ["Need at least 4 days of weight data for a verdict"],
      weightTrendKgPerWeek: null,
      strengthTrend: null,
      adherencePct: input.adherencePct,
    };
  }

  const slopePerDay = linearRegressionSlopePerDay(input.weightSeriesKg);
  const weightTrendKgPerWeek = slopePerDay == null ? null : slopePerDay * 7;
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
      `Weight dropping ${weightTrendKgPerWeek.toFixed(2)} kg/wk — faster than the 0.4–0.8 target`,
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
        `Weight trending ${weightTrendKgPerWeek.toFixed(2)} kg/wk — in the 0.3–0.8 target range`,
      );
    } else if (weightTrendKgPerWeek > -0.2) {
      reasoning.push("Weight stalled this week");
    } else {
      reasoning.push(
        `Weight trending ${weightTrendKgPerWeek.toFixed(2)} kg/wk — slightly outside target`,
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