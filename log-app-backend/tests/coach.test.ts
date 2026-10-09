import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachChatSchema, coachProfileSchema } from "../src/validation/schemas";

const mocks = vi.hoisted(() => ({
  findUniqueProfile: vi.fn(),
  findManyDaily: vi.fn(),
  findManyLift: vi.fn(),
  findFirstVerdict: vi.fn(),
  findFirstPlan: vi.fn(),
}));

vi.mock("../src/db/client", () => ({
  prisma: {
    coachProfile: { findUnique: mocks.findUniqueProfile },
    dailyLog: { findMany: mocks.findManyDaily },
    liftLog: { findMany: mocks.findManyLift },
    weeklyVerdict: { findFirst: mocks.findFirstVerdict },
    workoutPlan: { findFirst: mocks.findFirstPlan },
  },
}));

import { buildAthleteContext } from "../src/services/coach";

beforeEach(() => {
  mocks.findUniqueProfile.mockReset().mockResolvedValue(null);
  mocks.findManyDaily.mockReset().mockResolvedValue([]);
  mocks.findManyLift.mockReset().mockResolvedValue([]);
  mocks.findFirstVerdict.mockReset().mockResolvedValue(null);
  mocks.findFirstPlan.mockReset().mockResolvedValue(null);
});

describe("buildAthleteContext", () => {
  it("says there is no data when nothing is logged", async () => {
    expect(await buildAthleteContext("user-1")).toBe("No logged data yet.");
  });

  it("summarises weight, nutrition, lifts, verdict and plan", async () => {
    mocks.findUniqueProfile.mockResolvedValue({
      goal: "lose fat",
      weightKg: 82,
      targetWeightKg: 75,
      heightCm: 180,
      experience: "intermediate",
      daysPerWeek: 4,
      equipment: "full gym",
      dietNotes: null,
      injuries: null,
      notes: null,
    });
    mocks.findManyDaily.mockResolvedValue([
      { date: new Date("2026-10-01"), weightKg: 82, calories: 2400, proteinG: 160, sleepHours: 7.5 },
      { date: new Date("2026-10-02"), weightKg: 81.5, calories: 2300, proteinG: 150, sleepHours: 7 },
    ]);
    mocks.findManyLift.mockResolvedValue([
      { exerciseName: "Barbell Bench Press", weightKg: 60, reps: 8 },
      { exerciseName: "Barbell Bench Press", weightKg: 65, reps: 6 },
      { exerciseName: "Deadlift", weightKg: 120, reps: 5 },
    ]);
    mocks.findFirstVerdict.mockResolvedValue({
      verdict: "hold",
      weekStartDate: new Date("2026-10-06"),
      weightTrendKgPerWeek: -0.4,
      strengthTrend: "up",
      adherencePct: 85,
      reasoning: ["Weight in target range", "Strength up"],
    });
    mocks.findFirstPlan.mockResolvedValue({
      name: "My Plan",
      planDays: [{ dayName: "Push" }, { dayName: "Pull" }, { dayName: "Legs" }],
    });

    const context = await buildAthleteContext("user-1");

    expect(context).toContain("PROFILE:");
    expect(context).toContain("goal=lose fat");
    expect(context).toContain("WEIGHT (last 28d): 2 entries");
    expect(context).toContain("NUTRITION (avg/day, last 28d):");
    expect(context).toContain("calories=2350");
    expect(context).toContain("LIFTS (last 28d):");
    expect(context).toContain("Barbell Bench Press: 65kg top");
    expect(context).toContain("WEEKLY VERDICT");
    expect(context).toContain("hold");
    expect(context).toContain("ACTIVE PLAN \"My Plan\": Push, Pull, Legs");
  });

  it("caps the exercise list at 12 by volume", async () => {
    mocks.findManyLift.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        exerciseName: `Exercise ${i}`,
        weightKg: i + 1,
        reps: 10,
      })),
    );

    const context = await buildAthleteContext("user-1");
    const liftLine = context.split("\n").find((l) => l.startsWith("LIFTS")) ?? "";
    expect(liftLine.split(";")).toHaveLength(12);
  });
});

describe("coachProfileSchema", () => {
  it("accepts an empty object (all questions optional)", () => {
    expect(coachProfileSchema.safeParse({}).success).toBe(true);
  });

  it("accepts valid answers", () => {
    const result = coachProfileSchema.safeParse({
      goal: "lose fat",
      weight_kg: 82,
      experience: "intermediate",
      days_per_week: 4,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown experience level", () => {
    expect(coachProfileSchema.safeParse({ experience: "pro" }).success).toBe(false);
  });

  it("rejects out-of-range days per week", () => {
    expect(coachProfileSchema.safeParse({ days_per_week: 9 }).success).toBe(false);
  });
});

describe("coachChatSchema", () => {
  it("requires a non-empty message", () => {
    expect(coachChatSchema.safeParse({ message: "" }).success).toBe(false);
    expect(coachChatSchema.safeParse({ message: "hi" }).success).toBe(true);
  });
});
