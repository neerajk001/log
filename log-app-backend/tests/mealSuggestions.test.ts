import { describe, expect, it } from "vitest";
import {
  pickMealSuggestions,
  type MealHistoryEntry,
} from "../src/services/mealSuggestions";

const TODAY = "2026-10-24";

function meal(patch: Partial<MealHistoryEntry> = {}): MealHistoryEntry {
  return {
    id: "meal-1",
    date: "2026-10-20",
    title: "Chicken rice bowl",
    items: [{ name: "Chicken rice bowl", calories: 620, protein_g: 48 }],
    calories: 620,
    protein_g: 48,
    source: "ai",
    ...patch,
  };
}

describe("pickMealSuggestions", () => {
  it("returns the remaining macros next to the suggestions", () => {
    const result = pickMealSuggestions(
      {
        targets: { calories: 2200, protein_g: 160 },
        consumed: { calories: 1200, protein_g: 80 },
        history: [meal()],
      },
      TODAY,
    );

    expect(result.remaining).toEqual({ calories: 1000, protein_g: 80 });
    expect(result.reason).toBeNull();
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].remaining_after).toEqual({
      calories: 380,
      protein_g: 32,
    });
    expect(result.suggestions[0].fits).toBe(true);
  });

  it("only suggests meals that fit the remaining calories", () => {
    const result = pickMealSuggestions(
      {
        targets: { calories: 1800, protein_g: 150 },
        consumed: { calories: 1500, protein_g: 90 },
        history: [
          meal({ id: "big", title: "Big pasta", calories: 700, protein_g: 30 }),
          meal({ id: "small", title: "Greek yogurt", calories: 180, protein_g: 20 }),
        ],
      },
      TODAY,
    );

    expect(result.suggestions.map((s) => s.id)).toEqual(["small"]);
  });

  it("prefers protein-dense recent meals when several fit", () => {
    const result = pickMealSuggestions(
      {
        targets: { calories: 2200, protein_g: 160 },
        consumed: { calories: 800, protein_g: 60 },
        history: [
          meal({
            id: "old-dense",
            date: "2026-07-01",
            title: "Egg white omelette",
            calories: 300,
            protein_g: 40,
          }),
          meal({
            id: "new-dense",
            date: "2026-10-22",
            title: "Chicken salad",
            calories: 420,
            protein_g: 50,
          }),
          meal({
            id: "carby",
            date: "2026-10-23",
            title: "Toast",
            calories: 350,
            protein_g: 10,
          }),
        ],
      },
      TODAY,
    );

    expect(result.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(result.suggestions[0].id).toBe("new-dense");
  });

  it("keeps the newest version of a repeated meal title", () => {
    const result = pickMealSuggestions(
      {
        targets: { calories: 2500, protein_g: 180 },
        consumed: { calories: 500, protein_g: 30 },
        history: [
          meal({ id: "new", date: "2026-10-23", title: "Chicken rice bowl" }),
          meal({ id: "old", date: "2026-09-01", title: "chicken  RICE bowl" }),
        ],
      },
      TODAY,
    );

    expect(result.suggestions.map((s) => s.id)).toEqual(["new"]);
  });

  it("asks for targets when none are set", () => {
    const result = pickMealSuggestions(
      {
        targets: { calories: null, protein_g: null },
        consumed: { calories: 500, protein_g: 30 },
        history: [meal()],
      },
      TODAY,
    );

    expect(result.reason).toBe("no_targets");
    expect(result.suggestions).toHaveLength(0);
  });

  it("stops when the calorie budget is already spent", () => {
    const result = pickMealSuggestions(
      {
        targets: { calories: 2000, protein_g: 150 },
        consumed: { calories: 2000, protein_g: 120 },
        history: [meal()],
      },
      TODAY,
    );

    expect(result.reason).toBe("target_met");
    expect(result.suggestions).toHaveLength(0);
  });

  it("distinguishes no history from nothing fitting", () => {
    const none = pickMealSuggestions(
      {
        targets: { calories: 2200, protein_g: 160 },
        consumed: { calories: 800, protein_g: 60 },
        history: [],
      },
      TODAY,
    );
    expect(none.reason).toBe("no_history");

    const tooBig = pickMealSuggestions(
      {
        targets: { calories: 1800, protein_g: 160 },
        consumed: { calories: 1700, protein_g: 60 },
        history: [meal({ calories: 620, protein_g: 48 })],
      },
      TODAY,
    );
    expect(tooBig.reason).toBe("nothing_fits");
  });

  it("suggests at most three meals", () => {
    const result = pickMealSuggestions(
      {
        targets: { calories: 3000, protein_g: 200 },
        consumed: { calories: 500, protein_g: 20 },
        history: Array.from({ length: 6 }, (_, i) =>
          meal({ id: `m${i}`, title: `Meal ${i}`, calories: 400, protein_g: 30 + i }),
        ),
      },
      TODAY,
    );

    expect(result.suggestions).toHaveLength(3);
  });
});
