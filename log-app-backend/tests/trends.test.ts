import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findManyDaily: vi.fn(),
  groupByLift: vi.fn(),
  findManyLift: vi.fn(),
  findUniqueUser: vi.fn(),
}));

vi.mock("../src/db/client", () => ({
  prisma: {
    dailyLog: { findMany: mocks.findManyDaily },
    liftLog: { findMany: mocks.findManyLift, groupBy: mocks.groupByLift },
    user: { findUnique: mocks.findUniqueUser },
  },
}));

import { computeTrends } from "../src/services/trends";

const NOW = new Date("2026-10-11T12:00:00Z");

beforeEach(() => {
  mocks.findManyDaily.mockReset().mockResolvedValue([]);
  mocks.groupByLift.mockReset().mockResolvedValue([]);
  mocks.findManyLift.mockReset().mockResolvedValue([]);
  mocks.findUniqueUser.mockReset().mockResolvedValue(null);
});

describe("computeTrends weekly adherence", () => {
  it("divides by the days elapsed this week, like the verdict does", async () => {
    // Wednesday: Monday and Tuesday both hit their targets.
    mocks.findUniqueUser.mockResolvedValue({ proteinTargetG: 100, calorieTarget: 2000 });
    mocks.findManyDaily.mockResolvedValue([
      { date: new Date("2026-10-05"), weightKg: null, calories: 2100, proteinG: 120 },
      { date: new Date("2026-10-06"), weightKg: null, calories: 2100, proteinG: 120 },
    ]);

    const result = await computeTrends("user-1", "7d", {
      now: new Date("2026-10-07T00:00:00Z"),
    });

    // 2 of 3 elapsed days (67%), not 2 of 7 (29%) — the number the verdict screen
    // was disagreeing with.
    expect(result.adherence_pct).toBe(67);
    expect(result.calorie_adherence_pct).toBe(67);
  });
});

describe("computeTrends series bucketing", () => {
  it("uses one bucket per day for 7d", async () => {
    mocks.findManyDaily.mockResolvedValue([
      { date: new Date("2026-10-11"), weightKg: 81.5, calories: 1500, proteinG: 120 },
    ]);

    const result = await computeTrends("user-1", "7d", { now: NOW });

    expect(result.bucket).toBe("day");
    expect(result.series).toHaveLength(7);
    expect(result.series[0].start).toBe("2026-10-05");
    const today = result.series[result.series.length - 1];
    expect(today.start).toBe("2026-10-11");
    // A weight reading is valid the moment it's taken...
    expect(today.weight_kg).toBe(81.5);
    // ...but today's calories/protein are still in progress, so they're excluded
    // from averages until the day is done.
    expect(today.calories).toBeNull();
    expect(today.protein_g).toBeNull();
    // Empty buckets stay null so the client can skip them.
    expect(result.series[0].calories).toBeNull();
  });

  it("uses weekly buckets for 30d", async () => {
    const result = await computeTrends("user-1", "30d", { now: NOW });
    expect(result.bucket).toBe("week");
    expect(result.series).toHaveLength(5);
    // The newest bucket is the week containing "today".
    expect(result.series[4].start).toBe("2026-10-05");
  });

  it("uses monthly buckets for 1y", async () => {
    const result = await computeTrends("user-1", "1y", { now: NOW });

    expect(result.bucket).toBe("month");
    expect(result.series).toHaveLength(12);
    expect(result.series[0].start).toBe("2025-11-01");
    expect(result.series[11].start).toBe("2026-10-01");
  });

  it("keeps nutrition weekly for its own window, whatever the range is", async () => {
    mocks.findManyDaily.mockResolvedValue([
      { date: new Date("2026-10-06"), weightKg: null, calories: 1500, proteinG: 120 },
      { date: new Date("2026-10-08"), weightKg: null, calories: 1700, proteinG: 100 },
      // Today, still in progress — must not drag the week's average down.
      { date: new Date("2026-10-11"), weightKg: null, calories: 300, proteinG: 20 },
    ]);

    const short = await computeTrends("user-1", "7d", { now: NOW });
    expect(short.bucket).toBe("day");
    // Defaults to the latest week only.
    expect(short.nutrition).toHaveLength(1);
    expect(short.nutrition[0].start).toBe("2026-10-05");
    expect(short.nutrition[0].calories).toBe(1600);
    expect(short.nutrition[0].protein_g).toBe(110);

    const eightWeeks = await computeTrends("user-1", "7d", { nutritionWeeks: 8, now: NOW });
    expect(eightWeeks.nutrition).toHaveLength(8);
    expect(eightWeeks.nutrition[7].start).toBe("2026-10-05");

    const twoWeeks = await computeTrends("user-1", "7d", { nutritionWeeks: 2, now: NOW });
    expect(twoWeeks.nutrition).toHaveLength(2);
    expect(twoWeeks.nutrition[0].start).toBe("2026-09-28");
    expect(twoWeeks.nutrition[1].start).toBe("2026-10-05");
  });
});

describe("computeTrends month rollups", () => {
  it("summarises the last six months, newest first", async () => {
    mocks.findUniqueUser.mockResolvedValue({ proteinTargetG: 110, calorieTarget: null });
    mocks.findManyDaily.mockResolvedValue([
      { date: new Date("2026-10-11"), weightKg: 81, calories: 1600, proteinG: 120 },
      { date: new Date("2026-10-10"), weightKg: 81, calories: 1400, proteinG: 100 },
      { date: new Date("2026-09-15"), weightKg: 82, calories: 1700, proteinG: 130 },
    ]);
    mocks.groupByLift.mockResolvedValue([
      { date: new Date("2026-10-02"), _count: { _all: 12 } },
      { date: new Date("2026-10-05"), _count: { _all: 9 } },
      { date: new Date("2026-09-20"), _count: { _all: 7 } },
    ]);

    const result = await computeTrends("user-1", "30d", { now: NOW });

    expect(result.months).toHaveLength(6);
    const [october, september] = result.months;
    expect(october.month_start).toBe("2026-10-01");
    expect(october.workouts).toBe(2);
    expect(october.days_logged).toBe(2);
    // Today (2026-10-11) is still in progress, so it stays out of the averages:
    // 1400 from the 10th, not the 1500 mean of both days.
    expect(october.calories).toBe(1400);
    expect(october.protein_g).toBe(100);
    // 1 of 2 logged days hit the 110 g target; the month is 11 days old.
    expect(october.protein_adherence_pct).toBe(9);
    expect(october.calorie_adherence_pct).toBeNull();

    expect(september.month_start).toBe("2026-09-01");
    expect(september.workouts).toBe(1);
    // A finished month divides by its length, not the elapsed days.
    expect(september.protein_adherence_pct).toBe(3);

    // Months with nothing logged report no adherence rather than 0%.
    const august = result.months[2];
    expect(august.month_start).toBe("2026-08-01");
    expect(august.days_logged).toBe(0);
    expect(august.protein_adherence_pct).toBeNull();
    expect(august.calorie_adherence_pct).toBeNull();
    expect(august.calories).toBeNull();
  });
});

describe("computeTrends weekly adherence", () => {
  it("counts days this week that met the protein target", async () => {
    mocks.findUniqueUser.mockResolvedValue({ proteinTargetG: 110, calorieTarget: 2000 });
    mocks.findManyDaily.mockResolvedValue([
      { date: new Date("2026-10-06"), weightKg: null, calories: 1600, proteinG: 120 },
      { date: new Date("2026-10-07"), weightKg: null, calories: 2400, proteinG: 90 },
      { date: new Date("2026-10-08"), weightKg: null, calories: 2100, proteinG: 115 },
    ]);

    const result = await computeTrends("user-1", "30d", { now: NOW });

    expect(result.adherence_pct).toBe(29);
    expect(result.calorie_adherence_pct).toBe(29);
  });
});
