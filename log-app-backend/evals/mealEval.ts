/**
 * Meal-estimation evaluation protocol (Report 6 of the production audit).
 *
 * Pure scoring: no network, no provider, no database. The runner
 * (`runMealEval.ts`) feeds predictions in (from a JSONL file or a live model
 * call); this module turns them into per-case results and pass/fail gates so
 * "the model is accurate" is a measurable statement, not a vibe.
 *
 * Ground truth is per-item + meal totals, established by annotation with an
 * IFCT/USDA-backed reference. The shipped dataset values are explicit
 * placeholders to be re-adjudicated before an accuracy claim is published.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface MealEvalCase {
  id: string;
  description: string;
  /** Ground-truth meal energy (kcal). */
  kcal: number;
  /** Ground-truth protein (g). */
  proteinG: number;
  /** Expected item names; matched case-insensitively against predictions. */
  items: string[];
  /** True when a clarifying question (or a loose number match) is acceptable. */
  ambiguous: boolean;
}

export interface MealEvalPrediction {
  id: string;
  calories: number;
  proteinG: number;
  items: { name: string; calories?: number; protein_g?: number }[];
  question?: string | null;
}

export interface MealEvalCaseResult {
  id: string;
  kcalErrorPct: number;
  proteinErrorPct: number;
  itemsExpected: number;
  itemsMatched: number;
  predictedItems: number;
  inventedItems: number;
  questioned: boolean;
  passedKcal: boolean;
  passedProtein: boolean;
  passedItems: boolean;
}

export interface MealEvalSummary {
  cases: number;
  kcalWithinPct: number;
  proteinWithinPct: number;
  inventedItemRate: number;
  itemRecall: number;
  gates: {
    kcal: boolean;
    protein: boolean;
    invented: boolean;
    items: boolean;
  };
  passed: boolean;
  results: MealEvalCaseResult[];
}

export const MEAL_EVAL_TOLERANCE = {
  /** Pass a case when the total is within this percentage of ground truth. */
  kcalPct: 15,
  proteinPct: 20,
  /** Ambiguous dishes may be up to this far off when the model asks a question. */
  ambiguousKcalPct: 25,
} as const;

/** Acceptance gates — proposed in the audit; tune only with the dataset owners. */
export const MEAL_EVAL_GATES = {
  /** Share of cases within kcalPct of ground truth. */
  minKcalWithinPct: 0.7,
  /** Share of cases within proteinPct of ground truth. */
  minProteinWithinPct: 0.75,
  /** Share of predicted items that match no expected item (invented food). */
  maxInventedItemRate: 0.02,
  /** Share of expected items the model found at all. */
  minItemRecall: 0.8,
} as const;

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function itemMatches(expectedName: string, predictedName: string): boolean {
  const expected = normalise(expectedName);
  const predicted = normalise(predictedName);
  if (!expected || !predicted) return false;
  if (predicted.includes(expected) || expected.includes(predicted)) return true;
  const expectedTokens = expected.split(" ").filter((token) => token.length >= 4);
  const predictedTokens = new Set(predicted.split(" ").filter((token) => token.length >= 4));
  return expectedTokens.some((token) => predictedTokens.has(token));
}

function errorPct(predicted: number, expected: number): number {
  if (expected <= 0) return predicted <= 0 ? 0 : 100;
  return ((predicted - expected) / expected) * 100;
}

export function scoreMealCase(
  expected: MealEvalCase,
  predicted: MealEvalPrediction,
): MealEvalCaseResult {
  const kcalErrorPct = errorPct(predicted.calories, expected.kcal);
  const proteinErrorPct = errorPct(predicted.proteinG, expected.proteinG);

  const matchedExpected = new Set<string>();
  let inventedItems = 0;
  for (const item of predicted.items) {
    // One predicted item can satisfy several expected names ("curd rice" →
    // curd + rice); only a prediction matching nothing expected is invented.
    const hits = expected.items.filter((name) => itemMatches(name, item.name));
    if (hits.length === 0) inventedItems += 1;
    for (const hit of hits) matchedExpected.add(hit);
  }

  const questioned = typeof predicted.question === "string" && predicted.question.trim().length > 0;
  const withinKcal = Math.abs(kcalErrorPct) <= MEAL_EVAL_TOLERANCE.kcalPct;
  const withinKcalLoose = Math.abs(kcalErrorPct) <= MEAL_EVAL_TOLERANCE.ambiguousKcalPct;
  const passedKcal =
    withinKcal || (expected.ambiguous && (questioned || withinKcalLoose));

  return {
    id: expected.id,
    kcalErrorPct: Math.round(kcalErrorPct * 10) / 10,
    proteinErrorPct: Math.round(proteinErrorPct * 10) / 10,
    itemsExpected: expected.items.length,
    itemsMatched: matchedExpected.size,
    predictedItems: predicted.items.length,
    inventedItems,
    questioned,
    passedKcal,
    passedProtein: Math.abs(proteinErrorPct) <= MEAL_EVAL_TOLERANCE.proteinPct,
    passedItems: matchedExpected.size === expected.items.length,
  };
}

export function summariseMealEval(results: MealEvalCaseResult[]): MealEvalSummary {
  const n = results.length || 1;
  const kcalWithinPct = results.filter((r) => r.passedKcal).length / n;
  const proteinWithinPct = results.filter((r) => r.passedProtein).length / n;
  const predictedItems = results.reduce((sum, r) => sum + r.predictedItems, 0);
  const inventedItems = results.reduce((sum, r) => sum + r.inventedItems, 0);
  const expectedItems = results.reduce((sum, r) => sum + r.itemsExpected, 0);
  const matchedItems = results.reduce((sum, r) => sum + r.itemsMatched, 0);

  const inventedItemRate = predictedItems > 0 ? inventedItems / predictedItems : 0;
  const itemRecall = expectedItems > 0 ? matchedItems / expectedItems : 1;

  const gates = {
    kcal: kcalWithinPct >= MEAL_EVAL_GATES.minKcalWithinPct,
    protein: proteinWithinPct >= MEAL_EVAL_GATES.minProteinWithinPct,
    invented: inventedItemRate <= MEAL_EVAL_GATES.maxInventedItemRate,
    items: itemRecall >= MEAL_EVAL_GATES.minItemRecall,
  };

  return {
    cases: results.length,
    kcalWithinPct: Math.round(kcalWithinPct * 1000) / 10,
    proteinWithinPct: Math.round(proteinWithinPct * 1000) / 10,
    inventedItemRate: Math.round(inventedItemRate * 1000) / 10,
    itemRecall: Math.round(itemRecall * 1000) / 10,
    gates,
    passed: gates.kcal && gates.protein && gates.invented && gates.items,
    results,
  };
}

/** Loads the shipped golden dataset (path resolved relative to this module). */
export function loadMealDataset(): MealEvalCase[] {
  const path = fileURLToPath(new URL("./mealDataset.json", import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as MealEvalCase[];
}
