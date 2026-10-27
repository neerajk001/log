import { describe, expect, it } from "vitest";
import {
  computeBodyAnalysis,
  type BodyAnalysisInput,
  type BodyAnalysisLog,
} from "../src/services/bodyAnalysis";

const TO = "2026-10-24";
const DAY_MS = 86_400_000;

function isoDaysBefore(to: string, days: number): string {
  return new Date(new Date(`${to}T00:00:00Z`).getTime() - days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function buildLogs(
  count = 30,
  weight: (index: number) => number = (index) => 80 - (2 * index) / (count - 1),
): BodyAnalysisLog[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      new Date(`${isoDaysBefore(TO, count - 1)}T00:00:00Z`).getTime() + index * DAY_MS,
    )
      .toISOString()
      .slice(0, 10);
    const weekend = [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
    return {
      date,
      weight_kg: Number(weight(index).toFixed(2)),
      calories: weekend ? 2200 : 1750,
      protein_g: weekend ? 120 : 160,
    };
  });
}

function input(patch: Partial<BodyAnalysisInput> = {}): BodyAnalysisInput {
  return {
    from: isoDaysBefore(TO, 29),
    to: TO,
    days: 30,
    logs: buildLogs(),
    calorieTarget: 1800,
    proteinTarget: 150,
    targetWeightKg: 75,
    ...patch,
  };
}

describe("computeBodyAnalysis", () => {
  it("computes the weight trend, goal ETA and data quality", () => {
    const result = computeBodyAnalysis(input(), "30d");

    expect(result.weight.latest_kg).toBe(78);
    expect(result.weight.start_kg).toBe(80);
    expect(result.weight.change_kg).toBe(-2);
    expect(result.weight.rate_kg_per_week).toBe(-0.48);
    expect(result.weight.plateau).toBe(false);
    expect(result.weight.weigh_ins).toBe(30);
    expect(result.weight.points).toHaveLength(30);
    expect(result.weight.goal?.direction).toBe("losing");
    expect(result.weight.goal?.weeks_to_target).toBe(6);
    expect(result.data_quality.days_with_calories).toBe(29);
    expect(result.data_quality.sufficient).toBe(true);
  });

  it("computes calorie and protein averages, hit rates and weekend patterns", () => {
    const result = computeBodyAnalysis(input(), "30d");

    expect(result.calories.average).toBeGreaterThan(1750);
    expect(result.calories.average).toBeLessThan(2200);
    expect(result.calories.hit_rate_pct).toBeGreaterThan(50);
    expect(result.calories.weekend_avg).toBe(2200);
    expect(result.calories.weekday_avg).toBe(1750);
    expect(result.protein.average).toBeGreaterThan(120);
    expect(result.protein.hit_rate_pct).toBeGreaterThan(50);
    expect(result.protein.weekend_avg).toBe(120);
    expect(result.protein.weekday_avg).toBe(160);
    expect(result.protein.grams_per_kg).toBeGreaterThan(1.8);
    expect(result.protein.grams_per_kg).toBeLessThan(2);
    expect(result.insights.some((line) => line.includes("Weekends run"))).toBe(true);
  });

  it("estimates maintenance from intake and observed weight change", () => {
    const result = computeBodyAnalysis(input(), "30d");

    expect(result.implied_maintenance).not.toBeNull();
    expect(result.implied_maintenance?.span_days).toBe(29);
    expect(result.implied_maintenance?.low).toBeLessThan(
      result.implied_maintenance?.kcal as number,
    );
    expect(result.implied_maintenance?.high).toBeGreaterThan(
      result.implied_maintenance?.kcal as number,
    );
    expect(result.implied_maintenance?.kcal).toBeGreaterThan(2200);
  });

  it("flags a plateau when weight is flat", () => {
    const result = computeBodyAnalysis(
      input({ logs: buildLogs(30, () => 80) }),
      "30d",
    );

    expect(result.weight.rate_kg_per_week).toBe(0);
    expect(result.weight.plateau).toBe(true);
    expect(result.insights[0]).toContain("flat");
  });

  it("marks thin data as directional instead of inventing a trend", () => {
    const result = computeBodyAnalysis(
      input({ logs: buildLogs(3) }),
      "30d",
    );

    expect(result.data_quality.sufficient).toBe(false);
    expect(result.weight.rate_kg_per_week).toBeNull();
    expect(result.implied_maintenance).toBeNull();
    expect(result.insights.some((line) => line.includes("directional"))).toBe(true);
  });

  it("has no goal when the athlete hasn't set a target weight", () => {
    const result = computeBodyAnalysis(input({ targetWeightKg: null }), "30d");

    expect(result.weight.goal).toBeNull();
  });
});
