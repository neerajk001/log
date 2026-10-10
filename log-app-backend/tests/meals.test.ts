import { describe, expect, it, vi } from "vitest";
import { applyDailyDelta, serializeMeal } from "../src/services/meals";
import { createMealSchema } from "../src/validation/schemas";

describe("createMealSchema", () => {
  const valid = {
    date: "2026-10-10",
    title: "Breakfast",
    items: [{ name: "Roti", quantity: "2 medium", calories: 240, protein_g: 6 }],
    calories: 240,
    protein_g: 6,
    source: "ai",
  };

  it("accepts a valid meal", () => {
    expect(createMealSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty item list", () => {
    expect(createMealSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(createMealSchema.safeParse({ ...valid, source: "guess" }).success).toBe(false);
  });
});

describe("applyDailyDelta", () => {
  function client(existing: { calories: number | null; proteinG: number | null } | null) {
    const findUnique = vi.fn().mockResolvedValue(existing);
    const upsert = vi.fn().mockResolvedValue({ id: "log-1" });
    return { dailyLog: { findUnique, upsert } };
  }

  it("adds a meal's macros to the day's existing totals", async () => {
    const mock = client({ calories: 1200, proteinG: 80 });

    await applyDailyDelta("user-1", "2026-10-10", { calories: 500, protein_g: 30 }, mock as never);

    expect(mock.dailyLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { calories: 1700, proteinG: 110 } }),
    );
  });

  it("starts from zero when the day has no log yet", async () => {
    const mock = client(null);

    await applyDailyDelta("user-1", "2026-10-10", { calories: 500, protein_g: 30 }, mock as never);

    expect(mock.dailyLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ calories: 500, proteinG: 30 }),
      }),
    );
  });

  it("clamps at zero when subtracting more than was logged", async () => {
    const mock = client({ calories: 100, proteinG: 5 });

    await applyDailyDelta("user-1", "2026-10-10", { calories: -500, protein_g: -30 }, mock as never);

    expect(mock.dailyLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { calories: 0, proteinG: 0 } }),
    );
  });
});

describe("serializeMeal", () => {
  it("formats a row for the API", () => {
    expect(
      serializeMeal({
        id: "m1",
        date: new Date("2026-10-10"),
        title: "Breakfast",
        items: [{ name: "Roti", calories: 240, protein_g: 6 }],
        calories: 240,
        proteinG: 6,
        source: "ai",
      }),
    ).toEqual({
      id: "m1",
      date: "2026-10-10",
      title: "Breakfast",
      items: [{ name: "Roti", calories: 240, protein_g: 6 }],
      calories: 240,
      protein_g: 6,
      source: "ai",
    });
  });
});
