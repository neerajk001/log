import { describe, it, expect } from "vitest";
import {
  computeVerdict,
  computeStrengthTrend,
  linearRegressionSlopePerDay,
  verdictIsUnchanged,
  type VerdictOutput,
  type VerdictInput,
} from "../src/services/verdictEngine";

const previousNone = null;

/**
 * `GET /api/verdict/weekly` recomputes on every read; this is what decides whether
 * the recomputation is worth a database write.
 */
describe("verdictIsUnchanged", () => {
  const computed: VerdictOutput = {
    verdict: "hold",
    reasoning: ["Weight steady", "Protein on target"],
    weightTrendKgPerWeek: -0.4444,
    strengthTrend: "flat",
    adherencePct: 80,
  };
  // Decimal(4,2) in the database, so the stored trend comes back rounded.
  const stored = {
    verdict: "hold",
    weightTrendKgPerWeek: "-0.44",
    strengthTrend: "flat",
    adherencePct: 80,
    reasoning: ["Weight steady", "Protein on target"],
  };

  it("treats a rounded stored trend as unchanged", () => {
    expect(verdictIsUnchanged(stored, computed)).toBe(true);
  });

  it("reports a change when the call moves", () => {
    expect(verdictIsUnchanged(stored, { ...computed, verdict: "adjust_calories" })).toBe(false);
  });

  it("reports a change when a signal or the reasoning moves", () => {
    expect(verdictIsUnchanged(stored, { ...computed, weightTrendKgPerWeek: -0.71 })).toBe(false);
    expect(verdictIsUnchanged(stored, { ...computed, adherencePct: 60 })).toBe(false);
    expect(verdictIsUnchanged(stored, { ...computed, strengthTrend: "up" })).toBe(false);
    expect(verdictIsUnchanged(stored, { ...computed, reasoning: ["Weight steady"] })).toBe(false);
  });

  it("matches when neither side has a weight trend", () => {
    const noWeight = { ...computed, weightTrendKgPerWeek: null };
    expect(
      verdictIsUnchanged({ ...stored, weightTrendKgPerWeek: null }, noWeight),
    ).toBe(true);
    // A stored trend (or a new one) is a change.
    expect(verdictIsUnchanged(stored, noWeight)).toBe(false);
    expect(verdictIsUnchanged({ ...stored, weightTrendKgPerWeek: null }, computed)).toBe(false);
  });
});

function buildWeightSeries(start: number, slopePerDay: number, days = 7): number[] {
  return Array.from({ length: days }, (_, i) => +(start + slopePerDay * i).toFixed(2));
}

describe("no weigh-ins (allowNoWeight)", () => {
  const input: VerdictInput = {
    weightSeriesKg: [],
    perExercise: [
      { name: "Squat", thisWeekKg: 100, lastWeekKg: 95 },
      { name: "Bench", thisWeekKg: 80, lastWeekKg: 75 },
    ],
    adherencePct: 100,
    previousVerdict: previousNone,
    allowNoWeight: true,
  };

  it("judges on strength and adherence instead of asking for weight data", () => {
    const result = computeVerdict(input);

    expect(result.verdict).toBe("hold");
    expect(result.weightTrendKgPerWeek).toBeNull();
    expect(result.strengthTrend).toBe("up");
    expect(result.reasoning.join(" ")).not.toContain("Log two weigh-ins");
    expect(result.reasoning.join(" ")).toContain("Strength is up this week");
  });

  it("still flags two weeks of declining strength without weight data", () => {
    const result = computeVerdict({
      ...input,
      perExercise: [
        { name: "Squat", thisWeekKg: 90, lastWeekKg: 100 },
        { name: "Bench", thisWeekKg: 70, lastWeekKg: 80 },
      ],
      previousVerdict: { strengthTrend: "down", weightTrendKgPerWeek: null },
    });

    expect(result.verdict).toBe("check_recovery");
  });

  it("asks for weigh-ins when the athlete does track them", () => {
    const result = computeVerdict({
      weightSeriesKg: [],
      perExercise: [],
      adherencePct: null,
      previousVerdict: previousNone,
    });

    expect(result.reasoning[0]).toContain("Log two weigh-ins a few days apart");
  });
});

describe("sparse weigh-ins (once a week)", () => {
  it("reads a weekly rate from weigh-ins a week apart", () => {
    const result = computeVerdict({
      weightSeriesKg: [
        { day: 0, kg: 70 },
        { day: 7, kg: 69.6 },
        { day: 14, kg: 69.2 },
      ],
      perExercise: [],
      adherencePct: 90,
      previousVerdict: previousNone,
    });

    expect(result.verdict).toBe("hold");
    expect(result.weightTrendKgPerWeek).toBeCloseTo(-0.4, 1);
    const text = result.reasoning.join(" ");
    expect(text).toContain("in the 0.3–0.8 target range");
    // Says out loud how thin the reading is.
    expect(text).toContain("from 3 weigh-ins over 14 days");
  });

  it("accepts the bare minimum: two weigh-ins a week apart", () => {
    const result = computeVerdict({
      weightSeriesKg: [
        { day: 0, kg: 70 },
        { day: 7, kg: 69.5 },
      ],
      perExercise: [],
      adherencePct: null,
      previousVerdict: previousNone,
    });

    expect(result.weightTrendKgPerWeek).toBeCloseTo(-0.5, 1);
    expect(result.reasoning.join(" ")).toContain("from 2 weigh-ins over 7 days");
  });

  it("still refuses to read a trend from two weigh-ins days apart", () => {
    const result = computeVerdict({
      weightSeriesKg: [
        { day: 0, kg: 70 },
        { day: 2, kg: 69.9 },
      ],
      perExercise: [],
      adherencePct: null,
      previousVerdict: previousNone,
    });

    expect(result.weightTrendKgPerWeek).toBeNull();
    expect(result.reasoning[0]).toContain("Log two weigh-ins");
  });

  it("keeps the daily read free of the sparse qualifier", () => {
    const result = computeVerdict({
      weightSeriesKg: buildWeightSeries(70, -0.4 / 7, 7),
      perExercise: [],
      adherencePct: 100,
      previousVerdict: previousNone,
    });

    const text = result.reasoning.join(" ");
    expect(text).toContain("in the 0.3–0.8 target range");
    expect(text).not.toContain("weigh-ins over");
  });
});

describe("linearRegressionSlopePerDay", () => {
  it("returns null for fewer than 2 points", () => {
    expect(linearRegressionSlopePerDay([])).toBeNull();
    expect(linearRegressionSlopePerDay([70])).toBeNull();
  });

  it("returns the slope for a perfect linear series", () => {
    const series = [70, 70.1, 70.2, 70.3, 70.4, 70.5, 70.6];
    expect(linearRegressionSlopePerDay(series)).toBeCloseTo(0.1, 5);
  });

  it("returns ~0 for a flat series", () => {
    const series = [70, 70, 70, 70, 70, 70, 70];
    expect(linearRegressionSlopePerDay(series)).toBeCloseTo(0, 6);
  });
});

describe("computeStrengthTrend", () => {
  it("returns 'up' when two or more exercises rise > 2.5%", () => {
    expect(
      computeStrengthTrend([
        { name: "Bench", thisWeekKg: 62.5, lastWeekKg: 60 },
        { name: "Squat", thisWeekKg: 100, lastWeekKg: 97 },
        { name: "Curl", thisWeekKg: 15, lastWeekKg: 14.9 },
      ]),
    ).toBe("up");
  });

  it("returns 'down' when two or more exercises drop > 2.5%", () => {
    expect(
      computeStrengthTrend([
        { name: "Bench", thisWeekKg: 58, lastWeekKg: 60 },
        { name: "Squat", thisWeekKg: 92, lastWeekKg: 97 },
      ]),
    ).toBe("down");
  });

  it("returns 'flat' when changes are within ±2.5%", () => {
    expect(
      computeStrengthTrend([
        { name: "Bench", thisWeekKg: 60, lastWeekKg: 60 },
        { name: "Squat", thisWeekKg: 100, lastWeekKg: 100.5 },
      ]),
    ).toBe("flat");
  });

  it("returns null with no usable exercises", () => {
    expect(computeStrengthTrend([])).toBeNull();
    expect(
      computeStrengthTrend([{ name: "Bench", thisWeekKg: null, lastWeekKg: null }]),
    ).toBeNull();
  });
});

describe("computeVerdict — insufficient data", () => {
  it("returns hold and says what's missing when the weigh-ins are too close together", () => {
    const out = computeVerdict({
      weightSeriesKg: [70, 69.9, 69.8],
      perExercise: [],
      adherencePct: null,
      previousVerdict: previousNone,
    });
    expect(out.verdict).toBe("hold");
    expect(out.weightTrendKgPerWeek).toBeNull();
    expect(out.strengthTrend).toBeNull();
    expect(out.reasoning[0]).toMatch(/two weigh-ins/i);
  });
});

describe("computeVerdict — rule 1: check_recovery on two consecutive strength-down weeks", () => {
  const input: VerdictInput = {
    weightSeriesKg: buildWeightSeries(70, -0.05),
    perExercise: [
      { name: "Bench", thisWeekKg: 58, lastWeekKg: 60 },
      { name: "Squat", thisWeekKg: 92, lastWeekKg: 97 },
    ],
    adherencePct: 90,
    previousVerdict: { strengthTrend: "down", weightTrendKgPerWeek: -0.3 },
  };

  it("returns check_recovery", () => {
    const out = computeVerdict(input);
    expect(out.verdict).toBe("check_recovery");
    expect(out.reasoning.some((r) => /two weeks/i.test(r))).toBe(true);
  });

  it("does not trigger check_recovery on a single week of strength down", () => {
    const out = computeVerdict({
      ...input,
      previousVerdict: { strengthTrend: "up", weightTrendKgPerWeek: -0.3 },
    });
    expect(out.verdict).not.toBe("check_recovery");
  });
});

describe("computeVerdict — rule 2: adjust_calories on aggressive deficit + non-up strength", () => {
  it("triggers when weight drops > 0.8 kg/wk and strength is flat", () => {
    const out = computeVerdict({
      weightSeriesKg: buildWeightSeries(70, -0.2),
      perExercise: [
        { name: "Bench", thisWeekKg: 60, lastWeekKg: 60.5 },
        { name: "Squat", thisWeekKg: 100, lastWeekKg: 101 },
      ],
      adherencePct: 80,
      previousVerdict: previousNone,
    });
    expect(out.verdict).toBe("adjust_calories");
    expect(out.weightTrendKgPerWeek).not.toBeNull();
    expect(out.weightTrendKgPerWeek!).toBeLessThan(-0.8);
  });

  it("does NOT trigger when strength is up (rule precedence)", () => {
    const out = computeVerdict({
      weightSeriesKg: buildWeightSeries(70, -0.2),
      perExercise: [
        { name: "Bench", thisWeekKg: 62, lastWeekKg: 60 },
        { name: "Squat", thisWeekKg: 102, lastWeekKg: 100 },
        { name: "Deadlift", thisWeekKg: 120, lastWeekKg: 117 },
      ],
      adherencePct: 80,
      previousVerdict: previousNone,
    });
    expect(out.strengthTrend).toBe("up");
    expect(out.verdict).not.toBe("adjust_calories");
  });

  it("boundary: weight trend exactly -0.8 does not trigger rule 2", () => {
    const slope = -0.8 / 7;
    const series = Array.from({ length: 7 }, (_, i) => 70 + slope * i);
    const out = computeVerdict({
      weightSeriesKg: series,
      perExercise: [
        { name: "Bench", thisWeekKg: 60, lastWeekKg: 60.5 },
        { name: "Squat", thisWeekKg: 100, lastWeekKg: 101 },
      ],
      adherencePct: 80,
      previousVerdict: previousNone,
    });
    expect(out.weightTrendKgPerWeek!).toBeGreaterThanOrEqual(-0.8 - 1e-9);
    expect(out.verdict).not.toBe("adjust_calories");
  });
});

describe("computeVerdict — rule 3: adjust_calories on 2-week stall with high adherence", () => {
  const stalledSeries = buildWeightSeries(70, 0);

  it("triggers with 2 stalled weeks and adherence >= 80", () => {
    const out = computeVerdict({
      weightSeriesKg: stalledSeries,
      perExercise: [{ name: "Bench", thisWeekKg: 60, lastWeekKg: 60 }],
      adherencePct: 86,
      previousVerdict: { strengthTrend: "flat", weightTrendKgPerWeek: -0.05 },
    });
    expect(out.verdict).toBe("adjust_calories");
    expect(out.reasoning.some((r) => /stalled/i.test(r))).toBe(true);
  });

  it("does NOT trigger when adherence < 80", () => {
    const out = computeVerdict({
      weightSeriesKg: stalledSeries,
      perExercise: [{ name: "Bench", thisWeekKg: 60, lastWeekKg: 60 }],
      adherencePct: 60,
      previousVerdict: { strengthTrend: "flat", weightTrendKgPerWeek: -0.05 },
    });
    expect(out.verdict).not.toBe("adjust_calories");
  });

  it("does NOT trigger on a single stalled week", () => {
    const out = computeVerdict({
      weightSeriesKg: stalledSeries,
      perExercise: [{ name: "Bench", thisWeekKg: 60, lastWeekKg: 60 }],
      adherencePct: 90,
      previousVerdict: previousNone,
    });
    expect(out.verdict).not.toBe("adjust_calories");
  });

  it("boundary: adherence exactly 80 triggers rule 3", () => {
    const out = computeVerdict({
      weightSeriesKg: stalledSeries,
      perExercise: [{ name: "Bench", thisWeekKg: 60, lastWeekKg: 60 }],
      adherencePct: 80,
      previousVerdict: { strengthTrend: "flat", weightTrendKgPerWeek: -0.05 },
    });
    expect(out.verdict).toBe("adjust_calories");
  });
});

describe("computeVerdict — rule 4: hold on the happy path", () => {
  it("returns hold when weight is trending -0.4 kg/wk and strength is up", () => {
    const out = computeVerdict({
      weightSeriesKg: buildWeightSeries(70, -0.4 / 7),
      perExercise: [
        { name: "Bench", thisWeekKg: 62, lastWeekKg: 60 },
        { name: "Squat", thisWeekKg: 102, lastWeekKg: 100 },
        { name: "Deadlift", thisWeekKg: 122, lastWeekKg: 119 },
      ],
      adherencePct: 86,
      previousVerdict: previousNone,
    });
    expect(out.verdict).toBe("hold");
    expect(out.weightTrendKgPerWeek).not.toBeNull();
    expect(out.weightTrendKgPerWeek!).toBeGreaterThan(-0.8);
    expect(out.weightTrendKgPerWeek!).toBeLessThanOrEqual(-0.3);
    expect(out.strengthTrend).toBe("up");
    expect(out.reasoning.length).toBeGreaterThanOrEqual(2);
  });
});

describe("computeVerdict — strength trend boundary at 2.5%", () => {
  it("exactly 2.5% rise is 'flat' (does not cross threshold)", () => {
    const last = 100;
    const now = last * 1.025;
    const out = computeStrengthTrend([
      { name: "Bench", thisWeekKg: now, lastWeekKg: last },
      { name: "Squat", thisWeekKg: now, lastWeekKg: last },
    ]);
    expect(out).toBe("flat");
  });
});