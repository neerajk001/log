/**
 * Meal-accuracy evaluation runner (audit Report 6).
 *
 * Two modes:
 *
 *   npx tsx evals/runMealEval.ts --predictions evals/predictions.sample.jsonl
 *       Score a predictions file (one JSON object per line:
 *       { id, calories, proteinG, items: [{name, calories?, protein_g?}], question? }).
 *       Reproducible, free, safe for CI.
 *
 *   npx tsx evals/runMealEval.ts --live
 *       Call the configured AI provider once per dataset case with the same
 *       MEAL_SYSTEM the product uses. Costs real credits; never run in CI.
 *
 * Exits non-zero when any acceptance gate fails, so it can gate a model/prompt
 * change before it ships.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "../src/config";
import { MEAL_SYSTEM } from "../src/services/coach";
import {
  loadMealDataset,
  scoreMealCase,
  summariseMealEval,
  MEAL_EVAL_GATES,
  type MealEvalCase,
  type MealEvalPrediction,
} from "./mealEval";

function readPredictions(path: string): Map<string, MealEvalPrediction> {
  const predictions = new Map<string, MealEvalPrediction>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = JSON.parse(trimmed) as MealEvalPrediction;
    predictions.set(parsed.id, parsed);
  }
  return predictions;
}

/** One provider call for one text description, using the product's instructions. */
async function estimateLive(testCase: MealEvalCase): Promise<MealEvalPrediction> {
  const res = await fetch(`${config.ai.baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.ai.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.models.meal,
      instructions: MEAL_SYSTEM,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: `Estimate this meal: ${testCase.description}` }],
        },
      ],
      text: { format: { type: "json_object" } },
      max_output_tokens: 3000,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`provider returned ${res.status} for ${testCase.id}`);
  const data = (await res.json()) as {
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  const text = data.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error(`provider returned no text for ${testCase.id}`);
  const parsed = JSON.parse(text) as {
    items?: { name?: unknown; calories?: unknown; protein_g?: unknown }[];
    calories?: unknown;
    protein_g?: unknown;
    question?: unknown;
  };
  return {
    id: testCase.id,
    calories: Number(parsed.calories ?? 0),
    proteinG: Number(parsed.protein_g ?? 0),
    items: (parsed.items ?? []).map((item) => ({
      name: String(item.name ?? ""),
      calories: Number(item.calories ?? 0),
      protein_g: Number(item.protein_g ?? 0),
    })),
    question: typeof parsed.question === "string" ? parsed.question : null,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dataset = loadMealDataset();
  let predictions: Map<string, MealEvalPrediction>;
  let mode: string;

  if (args.includes("--live")) {
    if (!config.ai.apiKey) throw new Error("AI_API_KEY (or a fallback key) is required for --live");
    mode = `live (${config.models.meal})`;
    predictions = new Map();
    for (const testCase of dataset) {
      predictions.set(testCase.id, await estimateLive(testCase));
      process.stdout.write(".");
    }
    process.stdout.write("\n");
  } else {
    const flag = args.indexOf("--predictions");
    const path = flag >= 0 ? args[flag + 1] : "evals/predictions.sample.jsonl";
    if (!path) throw new Error("Usage: --predictions <file.jsonl> | --live");
    mode = `file (${path})`;
    predictions = readPredictions(resolve(path));
  }

  const results = dataset.map((testCase) => {
    const prediction = predictions.get(testCase.id);
    if (!prediction) throw new Error(`No prediction for dataset case "${testCase.id}"`);
    return scoreMealCase(testCase, prediction);
  });
  const summary = summariseMealEval(results);

  console.log(`\nMeal-accuracy eval — ${mode}`);
  console.log(
    "id".padEnd(20) +
      "kcal err".padStart(10) +
      "prot err".padStart(10) +
      "items".padStart(8) +
      "invented".padStart(10) +
      "question".padStart(10) +
      "  kcal",
  );
  for (const result of summary.results) {
    console.log(
      result.id.padEnd(20) +
        `${result.kcalErrorPct}%`.padStart(10) +
        `${result.proteinErrorPct}%`.padStart(10) +
        `${result.itemsMatched}/${result.itemsExpected}`.padStart(8) +
        String(result.inventedItems).padStart(10) +
        String(result.questioned).padStart(10) +
        (result.passedKcal ? "  pass" : "  FAIL"),
    );
  }

  console.log("\nSummary");
  console.log(
    `  kcal within ±15%: ${summary.kcalWithinPct}% (gate ≥ ${MEAL_EVAL_GATES.minKcalWithinPct * 100}%)`,
  );
  console.log(
    `  protein within ±20%: ${summary.proteinWithinPct}% (gate ≥ ${MEAL_EVAL_GATES.minProteinWithinPct * 100}%)`,
  );
  console.log(
    `  item recall: ${summary.itemRecall}% (gate ≥ ${MEAL_EVAL_GATES.minItemRecall * 100}%)`,
  );
  console.log(
    `  invented-item rate: ${summary.inventedItemRate}% (gate ≤ ${MEAL_EVAL_GATES.maxInventedItemRate * 100}%)`,
  );
  console.log(summary.passed ? "\nPASS — all gates met." : "\nFAIL — gates not met.");

  if (!summary.passed) process.exitCode = 1;
}

void main().catch((err: unknown) => {
  console.error(`\nEval failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
