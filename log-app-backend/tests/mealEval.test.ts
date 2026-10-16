import { describe, expect, it } from "vitest";
import {
  MEAL_EVAL_GATES,
  loadMealDataset,
  scoreMealCase,
  summariseMealEval,
  type MealEvalCase,
} from "../evals/mealEval";

const baseCase: MealEvalCase = {
  id: "x",
  description: "2 rotis with dal",
  kcal: 500,
  proteinG: 30,
  items: ["roti", "dal"],
  ambiguous: false,
};

describe("scoreMealCase", () => {
  it("passes a perfect prediction", () => {
    const result = scoreMealCase(baseCase, {
      id: "x",
      calories: 500,
      proteinG: 30,
      items: [{ name: "2 rotis" }, { name: "dal" }],
      question: null,
    });

    expect(result).toMatchObject({
      passedKcal: true,
      passedProtein: true,
      passedItems: true,
      inventedItems: 0,
      itemsMatched: 2,
    });
  });

  it("fails kcal outside tolerance and counts invented items separately", () => {
    const result = scoreMealCase(baseCase, {
      id: "x",
      calories: 700,
      proteinG: 30,
      items: [{ name: "roti" }, { name: "dal" }, { name: "mystery sauce" }],
    });

    expect(result.passedKcal).toBe(false);
    expect(result.inventedItems).toBe(1);
    // Expected foods were still found — the invented item doesn't erase recall.
    expect(result.passedItems).toBe(true);
  });

  it("matches one compound prediction to several expected items", () => {
    const result = scoreMealCase(
      { ...baseCase, items: ["curd", "rice"] },
      { id: "x", calories: 500, proteinG: 30, items: [{ name: "curd rice" }] },
    );

    expect(result.itemsMatched).toBe(2);
    expect(result.inventedItems).toBe(0);
    expect(result.passedItems).toBe(true);
  });

  it("accepts a clarifying question for an ambiguous dish even when far off", () => {
    const result = scoreMealCase(
      { ...baseCase, ambiguous: true },
      {
        id: "x",
        calories: 900,
        proteinG: 30,
        items: [{ name: "roti" }, { name: "dal" }],
        question: "Was this a veg thali?",
      },
    );

    expect(result.passedKcal).toBe(true);
  });

  it("does not accept a question for an unambiguous dish", () => {
    const result = scoreMealCase(baseCase, {
      id: "x",
      calories: 700,
      proteinG: 30,
      items: [{ name: "roti" }, { name: "dal" }],
      question: "How much was it?",
    });

    expect(result.passedKcal).toBe(false);
  });
});

describe("summariseMealEval", () => {
  const perfect = (id: string) =>
    scoreMealCase(
      { ...baseCase, id },
      { id, calories: 500, proteinG: 30, items: [{ name: "roti" }, { name: "dal" }] },
    );

  it("fails the gates when too few cases land inside tolerance", () => {
    const bad = scoreMealCase(baseCase, {
      id: "x",
      calories: 750,
      proteinG: 30,
      items: [{ name: "roti" }, { name: "dal" }],
    });
    const summary = summariseMealEval([perfect("a"), bad, bad, bad]);

    expect(summary.gates.kcal).toBe(false);
    expect(summary.passed).toBe(false);
  });

  it("passes when every case meets the gates", () => {
    const summary = summariseMealEval([perfect("a"), perfect("b"), perfect("c")]);

    expect(summary.gates).toEqual({ kcal: true, protein: true, invented: true, items: true });
    expect(summary.passed).toBe(true);
    expect(summary.kcalWithinPct).toBe(100);
    expect(summary.inventedItemRate).toBe(0);
  });

  it("flags an invented rate above the gate", () => {
    const withInvented = scoreMealCase(baseCase, {
      id: "x",
      calories: 500,
      proteinG: 30,
      items: [{ name: "roti" }, { name: "dal" }, { name: "unknown curry" }],
    });
    const summary = summariseMealEval([withInvented]);

    expect(summary.inventedItemRate).toBeGreaterThan(
      MEAL_EVAL_GATES.maxInventedItemRate * 100,
    );
    expect(summary.gates.invented).toBe(false);
  });
});

describe("loadMealDataset", () => {
  it("parses and structurally validates the shipped golden set", () => {
    const dataset = loadMealDataset();

    expect(dataset.length).toBeGreaterThanOrEqual(12);
    for (const testCase of dataset) {
      expect(testCase.id).toBeTruthy();
      expect(testCase.description.length).toBeGreaterThan(0);
      expect(testCase.kcal).toBeGreaterThan(0);
      expect(testCase.proteinG).toBeGreaterThanOrEqual(0);
      expect(testCase.items.length).toBeGreaterThan(0);
      expect(typeof testCase.ambiguous).toBe("boolean");
    }
  });

  it("covers the Indian staples the audit named", () => {
    const ids = loadMealDataset()
      .map((testCase) => testCase.id)
      .join(" ");

    for (const staple of ["roti", "poha", "dosa", "biryani", "paneer", "soya"]) {
      expect(ids).toContain(staple);
    }
  });
});
