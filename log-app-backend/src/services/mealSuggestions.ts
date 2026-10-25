import { prisma } from "../db/client";
import type { MealItem } from "./meals";

/** History is bounded so the read stays small on accounts with years of meals. */
const HISTORY_DAYS = 90;
const MAX_HISTORY_ROWS = 400;
const MAX_SUGGESTIONS = 3;
const DEFAULT_AGE_DAYS = HISTORY_DAYS;

export interface MealHistoryEntry {
  id: string;
  date: string;
  title: string;
  items: MealItem[];
  calories: number;
  protein_g: number;
  source: string;
}

export interface PlannedMacros {
  calories: number | null;
  protein_g: number | null;
}

export interface ConsumedMacros {
  calories: number;
  protein_g: number;
}

export interface MealSuggestion extends MealHistoryEntry {
  last_logged: string;
  remaining_after: { calories: number | null; protein_g: number | null };
  fits: boolean;
}

export type MealSuggestionReason =
  | "no_targets"
  | "target_met"
  | "no_history"
  | "nothing_fits"
  | null;

export interface MealSuggestionResult {
  targets: PlannedMacros;
  consumed: ConsumedMacros;
  remaining: PlannedMacros;
  suggestions: MealSuggestion[];
  reason: MealSuggestionReason;
}

export interface MealSuggestionInput {
  targets: PlannedMacros;
  consumed: ConsumedMacros;
  /** Newest first. */
  history: MealHistoryEntry[];
  maxSuggestions?: number;
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

function daysSince(date: string, today: string): number {
  const from = new Date(`${date}T00:00:00Z`).getTime();
  const to = new Date(`${today}T00:00:00Z`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return DEFAULT_AGE_DAYS;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * Picks 2-3 meals the athlete has actually logged before that fit today's
 * remaining calories, preferring protein-dense, recent, budget-sized meals.
 * Deterministic and pure so the selection rules are testable without a database.
 */
export function pickMealSuggestions(
  input: MealSuggestionInput,
  today: string,
): MealSuggestionResult {
  const { targets, consumed, history } = input;
  const remaining: PlannedMacros = {
    calories:
      targets.calories == null ? null : Math.max(0, targets.calories - consumed.calories),
    protein_g:
      targets.protein_g == null ? null : Math.max(0, targets.protein_g - consumed.protein_g),
  };

  const base = { targets, consumed, remaining };

  if (targets.calories == null && targets.protein_g == null) {
    return { ...base, suggestions: [], reason: "no_targets" };
  }
  // Nothing can fit if the calorie budget is already spent.
  if (remaining.calories != null && remaining.calories <= 0) {
    return { ...base, suggestions: [], reason: "target_met" };
  }

  // Most recent version of each distinct meal, in recency order.
  const seen = new Set<string>();
  const candidates: MealHistoryEntry[] = [];
  for (const meal of history) {
    if (meal.calories <= 0) continue;
    const key = normalizeTitle(meal.title);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(meal);
  }
  if (candidates.length === 0) {
    return { ...base, suggestions: [], reason: "no_history" };
  }

  const fitsRemaining = candidates.filter(
    (meal) =>
      remaining.calories == null || meal.calories <= (remaining.calories as number),
  );
  if (fitsRemaining.length === 0) {
    return { ...base, suggestions: [], reason: "nothing_fits" };
  }

  const calorieLeft = remaining.calories;
  const proteinLeft = remaining.protein_g;
  const scored = fitsRemaining.map((meal) => {
    const proteinCover =
      proteinLeft != null && proteinLeft > 0
        ? Math.min(meal.protein_g, proteinLeft) / proteinLeft
        : Math.min(meal.protein_g / 100, 1);
    const budgetUse =
      calorieLeft != null && calorieLeft > 0
        ? Math.min(meal.calories / calorieLeft, 1)
        : 0.5;
    // Protein per 100 kcal, capped so a very lean meal doesn't dominate forever.
    const density = Math.min(meal.protein_g / Math.max(meal.calories, 1) / 0.25, 1);
    const recency = 1 - Math.min(daysSince(meal.date, today) / DEFAULT_AGE_DAYS, 1);
    return {
      meal,
      score: proteinCover * 0.45 + budgetUse * 0.2 + density * 0.2 + recency * 0.15,
    };
  });

  scored.sort((a, b) => b.score - a.score || b.meal.date.localeCompare(a.meal.date));

  const suggestions = scored
    .slice(0, input.maxSuggestions ?? MAX_SUGGESTIONS)
    .map(({ meal }) => ({
      ...meal,
      last_logged: meal.date,
      remaining_after: {
        calories: calorieLeft == null ? null : Math.max(0, calorieLeft - meal.calories),
        protein_g:
          proteinLeft == null ? null : Math.max(0, proteinLeft - meal.protein_g),
      },
      fits: true,
    }));

  return { ...base, suggestions, reason: null };
}

/** Loads the athlete's targets, today's intake and recent meals, then suggests. */
export async function getMealSuggestions(
  userId: string,
  date: string,
): Promise<MealSuggestionResult> {
  const day = new Date(`${date}T00:00:00Z`);
  const from = new Date(day);
  from.setUTCDate(from.getUTCDate() - HISTORY_DAYS);

  const [user, log, rows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { calorieTarget: true, proteinTargetG: true },
    }),
    prisma.dailyLog.findUnique({
      where: { userId_date: { userId, date: day } },
      select: { calories: true, proteinG: true },
    }),
    prisma.mealLog.findMany({
      // Include today: a meal logged earlier is still a valid suggestion for
      // later in the day, and a brand-new account shouldn't have to wait 24h.
      where: { userId, date: { gte: from, lte: day } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: MAX_HISTORY_ROWS,
      select: {
        id: true,
        date: true,
        title: true,
        items: true,
        calories: true,
        proteinG: true,
        source: true,
      },
    }),
  ]);

  const history: MealHistoryEntry[] = rows.map((row) => ({
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    title: row.title,
    items: row.items as unknown as MealItem[],
    calories: row.calories,
    protein_g: row.proteinG,
    source: row.source,
  }));

  return pickMealSuggestions(
    {
      targets: {
        calories: user?.calorieTarget ?? null,
        protein_g: user?.proteinTargetG ?? null,
      },
      consumed: {
        calories: log?.calories ?? 0,
        protein_g: log?.proteinG ?? 0,
      },
      history,
    },
    date,
  );
}
