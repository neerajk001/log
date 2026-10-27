import { prisma } from "../db/client";

export type BodyAnalysisRange = "30d" | "90d" | "1y";

const RANGE_DAYS: Record<BodyAnalysisRange, number> = {
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/** Energy in one kg of body-weight change, used only for the maintenance estimate. */
const KCAL_PER_KG = 7700;
const DAY_MS = 86_400_000;

export interface BodyAnalysisLog {
  date: string; // YYYY-MM-DD
  weight_kg: number | null;
  calories: number | null;
  protein_g: number | null;
}

export interface MacroAnalysis {
  target: number | null;
  average: number | null;
  /** Calories: days within ±5% of target. Protein: days at or above target. */
  hit_rate_pct: number | null;
  days_logged: number;
  weekday_avg: number | null;
  weekend_avg: number | null;
  variability: number | null;
}

export interface WeightPoint {
  date: string;
  kg: number;
}

export interface BodyAnalysis {
  range: BodyAnalysisRange;
  from: string;
  to: string;
  data_quality: {
    days: number;
    days_with_calories: number;
    days_with_protein: number;
    weigh_ins: number;
    coverage_pct: number;
    sufficient: boolean;
  };
  weight: {
    latest_kg: number | null;
    average_7d_kg: number | null;
    start_kg: number | null;
    change_kg: number | null;
    rate_kg_per_week: number | null;
    plateau: boolean;
    weigh_ins: number;
    points: WeightPoint[];
    goal: {
      target_kg: number | null;
      direction: "losing" | "gaining" | "maintaining" | null;
      weeks_to_target: number | null;
      target_date: string | null;
    } | null;
  };
  calories: MacroAnalysis;
  protein: MacroAnalysis & { grams_per_kg: number | null };
  implied_maintenance: {
    kcal: number;
    low: number;
    high: number;
    span_days: number;
    logged_days: number;
    note: string;
  } | null;
  insights: string[];
}

export interface BodyAnalysisInput {
  from: string;
  to: string;
  days: number;
  logs: BodyAnalysisLog[];
  calorieTarget: number | null;
  proteinTarget: number | null;
  targetWeightKg: number | null;
}

function round(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = average(values) as number;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function dayMs(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

function addDays(date: string, days: number): string {
  return new Date(dayMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / DAY_MS);
}

function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** Least-squares kg/week across all weigh-ins in the window. */
function ratePerWeek(points: WeightPoint[]): number | null {
  if (points.length < 2) return null;
  const origin = dayMs(points[0].date);
  const xs = points.map((point) => (dayMs(point.date) - origin) / DAY_MS);
  if (Math.max(...xs) < 7) return null;
  const meanX = average(xs) as number;
  const meanY = average(points.map((point) => point.kg)) as number;
  const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (denominator === 0) return null;
  const slope = xs.reduce(
    (sum, x, i) => sum + (x - meanX) * (points[i].kg - meanY),
    0,
  ) / denominator;
  return round(slope * 7, 2);
}

function macroStats(
  completed: BodyAnalysisLog[],
  pick: (log: BodyAnalysisLog) => number | null,
  target: number | null,
  isHit: (value: number, target: number) => boolean,
): MacroAnalysis {
  const rows = completed.filter((log) => pick(log) != null);
  const values = rows.map((log) => pick(log) as number);
  const weekday = rows
    .filter((log) => {
      const day = dayOfWeek(log.date);
      return day !== 0 && day !== 6;
    })
    .map((log) => pick(log) as number);
  const weekend = rows
    .filter((log) => {
      const day = dayOfWeek(log.date);
      return day === 0 || day === 6;
    })
    .map((log) => pick(log) as number);

  const hits =
    target != null && target > 0
      ? values.filter((value) => isHit(value, target)).length
      : null;

  return {
    target,
    average: values.length > 0 ? round(average(values) as number) : null,
    hit_rate_pct:
      hits != null && values.length > 0
        ? round((hits / values.length) * 100)
        : null,
    days_logged: values.length,
    weekday_avg: weekday.length > 0 ? round(average(weekday) as number) : null,
    weekend_avg: weekend.length > 0 ? round(average(weekend) as number) : null,
    variability:
      values.length >= 2 ? round(stdDev(values) as number) : null,
  };
}

function buildInsights(analysis: Omit<BodyAnalysis, "insights">): string[] {
  const insights: string[] = [];
  const { weight, calories, protein, data_quality: quality } = analysis;

  if (weight.rate_kg_per_week != null) {
    if (weight.plateau) {
      insights.push("Weight has been flat over the recent weigh-ins.");
    } else {
      insights.push(
        `Weight is ${weight.rate_kg_per_week < 0 ? "down" : "up"} ${Math.abs(weight.rate_kg_per_week).toFixed(2)} kg/week.`,
      );
    }
  }

  if (calories.average != null) {
    const targetLine =
      calories.target != null
        ? ` against a ${calories.target} kcal target, on target ${calories.hit_rate_pct ?? 0}% of logged days`
        : "";
    insights.push(`Calories average ${calories.average} kcal${targetLine}.`);
  }

  if (protein.average != null) {
    const perKg =
      protein.grams_per_kg != null ? ` (${protein.grams_per_kg} g/kg)` : "";
    const hitLine =
      protein.target != null
        ? `, hitting the target ${protein.hit_rate_pct ?? 0}% of logged days`
        : "";
    insights.push(`Protein averages ${protein.average} g/day${perKg}${hitLine}.`);
  }

  if (
    calories.weekday_avg != null &&
    calories.weekend_avg != null &&
    Math.abs(calories.weekend_avg - calories.weekday_avg) >= 100
  ) {
    const difference = calories.weekend_avg - calories.weekday_avg;
    insights.push(
      `Weekends run ${Math.abs(difference)} kcal ${difference > 0 ? "higher" : "lower"} than weekdays.`,
    );
  } else if (
    protein.weekday_avg != null &&
    protein.weekend_avg != null &&
    Math.abs(protein.weekend_avg - protein.weekday_avg) >= 10
  ) {
    const difference = protein.weekend_avg - protein.weekday_avg;
    insights.push(
      `Protein is ${Math.abs(difference)} g ${difference > 0 ? "higher" : "lower"} on weekends.`,
    );
  }

  if (weight.goal?.weeks_to_target != null && weight.goal.target_kg != null) {
    insights.push(
      `At this rate, ${weight.goal.target_kg} kg is about ${weight.goal.weeks_to_target} weeks away.`,
    );
  }

  if (!quality.sufficient) {
    insights.push(
      `Based on ${quality.days_with_calories} logged days and ${quality.weigh_ins} weigh-ins — treat this as directional.`,
    );
  } else if (quality.coverage_pct < 100) {
    insights.push(
      `Based on ${quality.days_with_calories} of ${quality.days} days logged.`,
    );
  }

  return insights.slice(0, 6);
}

/**
 * Pure analysis over the athlete's daily logs. No model call and no external
 * data: every number is derived from weight, calories and protein in the
 * selected window, with explicit data-quality limits.
 */
export function computeBodyAnalysis(
  input: BodyAnalysisInput,
  range: BodyAnalysisRange,
): BodyAnalysis {
  const logs = [...input.logs].sort((a, b) => a.date.localeCompare(b.date));
  const completed = logs.filter((log) => log.date < input.to);
  const points: WeightPoint[] = logs
    .filter(
      (log): log is BodyAnalysisLog & { weight_kg: number } =>
        log.weight_kg != null,
    )
    .map((log) => ({ date: log.date, kg: log.weight_kg }));

  const latest = points.length > 0 ? points[points.length - 1] : null;
  const first = points.length > 0 ? points[0] : null;
  const recent = points.filter((point) => point.date >= addDays(input.to, -6));
  const average7 = recent.length > 0 ? average(recent.map((point) => point.kg)) : null;
  const rate = ratePerWeek(points);
  const spanDays = first && latest ? daysBetween(first.date, latest.date) : 0;
  const plateau =
    rate != null && Math.abs(rate) < 0.1 && spanDays >= 14 && points.length >= 4;

  const calories = macroStats(
    completed,
    (log) => log.calories,
    input.calorieTarget,
    (value, target) => Math.abs(value - target) <= target * 0.05,
  );
  const protein = macroStats(
    completed,
    (log) => log.protein_g,
    input.proteinTarget,
    (value, target) => value >= target,
  );

  const referenceWeight = average7 ?? latest?.kg ?? null;
  const gramsPerKg =
    protein.average != null && referenceWeight != null && referenceWeight > 0
      ? round(protein.average / referenceWeight, 1)
      : null;

  let goal: BodyAnalysis["weight"]["goal"] = null;
  if (input.targetWeightKg != null && latest) {
    const difference = latest.kg - input.targetWeightKg;
    const direction: "losing" | "gaining" | "maintaining" =
      Math.abs(difference) <= 0.5 ? "maintaining" : difference > 0 ? "losing" : "gaining";
    let weeks: number | null = null;
    if (rate != null) {
      const matchesDirection =
        (direction === "losing" && rate < 0) || (direction === "gaining" && rate > 0);
      if (matchesDirection) {
        const rawWeeks = Math.abs(difference / rate);
        if (Number.isFinite(rawWeeks) && rawWeeks > 0 && rawWeeks <= 520) {
          weeks = Math.round(rawWeeks);
        }
      }
    }
    goal = {
      target_kg: input.targetWeightKg,
      direction,
      weeks_to_target: weeks,
      target_date: weeks != null ? addDays(input.to, weeks * 7) : null,
    };
  }

  let maintenance: BodyAnalysis["implied_maintenance"] = null;
  if (first && latest && spanDays >= 21 && points.length >= 6) {
    const intakeRows = completed.filter(
      (log) =>
        log.calories != null &&
        log.date >= first.date &&
        log.date <= latest.date,
    );
    const intake = average(intakeRows.map((log) => log.calories as number));
    if (intake != null && intakeRows.length >= 14) {
      const change = latest.kg - first.kg;
      const kcal = round(intake - (change * KCAL_PER_KG) / spanDays);
      maintenance = {
        kcal,
        low: kcal - 200,
        high: kcal + 200,
        span_days: spanDays,
        logged_days: intakeRows.length,
        note: `Estimate from ${intakeRows.length} logged days and ${spanDays} days of weigh-ins.`,
      };
    }
  }

  const analysis: Omit<BodyAnalysis, "insights"> = {
    range,
    from: input.from,
    to: input.to,
    data_quality: {
      days: input.days,
      days_with_calories: calories.days_logged,
      days_with_protein: protein.days_logged,
      weigh_ins: points.length,
      coverage_pct: round((calories.days_logged / input.days) * 100),
      sufficient:
        points.length >= 4 && calories.days_logged >= Math.min(14, input.days),
    },
    weight: {
      latest_kg: latest?.kg ?? null,
      average_7d_kg: average7 != null ? round(average7, 1) : null,
      start_kg: first?.kg ?? null,
      change_kg:
        first && latest ? round(latest.kg - first.kg, 2) : null,
      rate_kg_per_week: rate,
      plateau,
      weigh_ins: points.length,
      points,
      goal,
    },
    calories,
    protein: { ...protein, grams_per_kg: gramsPerKg },
    implied_maintenance: maintenance,
  };

  return { ...analysis, insights: buildInsights(analysis) };
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Loads the window and returns the complete detailed analysis. */
export async function getBodyAnalysis(
  userId: string,
  range: BodyAnalysisRange = "30d",
  localDate?: string,
): Promise<BodyAnalysis> {
  const days = RANGE_DAYS[range];
  const to =
    localDate && isCalendarDate(localDate)
      ? localDate
      : new Date().toISOString().slice(0, 10);
  const from = addDays(to, -(days - 1));

  const [logs, user, profile] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      orderBy: { date: "asc" },
      select: { date: true, weightKg: true, calories: true, proteinG: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { calorieTarget: true, proteinTargetG: true },
    }),
    prisma.coachProfile.findUnique({
      where: { userId },
      select: { targetWeightKg: true },
    }),
  ]);

  return computeBodyAnalysis(
    {
      from,
      to,
      days,
      logs: logs.map((log) => ({
        date: log.date.toISOString().slice(0, 10),
        weight_kg: log.weightKg == null ? null : Number(log.weightKg),
        calories: log.calories,
        protein_g: log.proteinG,
      })),
      calorieTarget: user?.calorieTarget ?? null,
      proteinTarget: user?.proteinTargetG ?? null,
      targetWeightKg:
        profile?.targetWeightKg == null ? null : Number(profile.targetWeightKg),
    },
    range,
  );
}
