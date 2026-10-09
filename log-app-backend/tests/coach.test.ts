import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coachChatSchema, coachProfileSchema } from "../src/validation/schemas";

const mocks = vi.hoisted(() => ({
  findUniqueProfile: vi.fn(),
  findManyDaily: vi.fn(),
  findManyLift: vi.fn(),
  findManyVerdicts: vi.fn(),
  findFirstPlan: vi.fn(),
  findManyActivity: vi.fn(),
}));

vi.mock("../src/db/client", () => ({
  prisma: {
    coachProfile: { findUnique: mocks.findUniqueProfile },
    dailyLog: { findMany: mocks.findManyDaily },
    liftLog: { findMany: mocks.findManyLift },
    weeklyVerdict: { findMany: mocks.findManyVerdicts },
    workoutPlan: { findFirst: mocks.findFirstPlan },
    activityLog: { findMany: mocks.findManyActivity },
  },
}));

import {
  buildAthleteContext,
  executeCoachTool,
  parseOpenAIDelta,
  parseOpenAIEvent,
  routeChatModel,
} from "../src/services/coach";
import { config } from "../src/config";

beforeEach(() => {
  // Freeze "today" so the ISO-week lift trend is deterministic.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  mocks.findUniqueProfile.mockReset().mockResolvedValue(null);
  mocks.findManyDaily.mockReset().mockResolvedValue([]);
  mocks.findManyLift.mockReset().mockResolvedValue([]);
  mocks.findManyVerdicts.mockReset().mockResolvedValue([]);
  mocks.findFirstPlan.mockReset().mockResolvedValue(null);
  mocks.findManyActivity.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
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
      { date: new Date("2026-10-08"), exerciseName: "Barbell Bench Press", weightKg: 60, reps: 8 },
      { date: new Date("2026-10-08"), exerciseName: "Barbell Bench Press", weightKg: 65, reps: 6 },
      { date: new Date("2026-10-08"), exerciseName: "Deadlift", weightKg: 120, reps: 5 },
      { date: new Date("2026-10-01"), exerciseName: "Deadlift", weightKg: 115, reps: 5 },
    ]);
    mocks.findManyVerdicts.mockResolvedValue([
      {
        verdict: "hold",
        weekStartDate: new Date("2026-10-06"),
        weightTrendKgPerWeek: -0.4,
        strengthTrend: "up",
        adherencePct: 85,
        reasoning: ["Weight in target range", "Strength up"],
      },
      { verdict: "adjust_calories", weekStartDate: new Date("2026-09-29") },
    ]);
    mocks.findManyActivity.mockResolvedValue([
      { durationMin: 45, activityType: "run" },
      { durationMin: 30, activityType: "walk" },
    ]);
    mocks.findFirstPlan.mockResolvedValue({
      name: "My Plan",
      planDays: [{ dayName: "Push" }, { dayName: "Pull" }, { dayName: "Legs" }],
    });

    const context = await buildAthleteContext("user-1");

    expect(context).toContain("TODAY: 2026-10-09");
    expect(context).toContain("PROFILE:");
    expect(context).toContain("goal=lose fat");
    expect(context).toContain("WEIGHT (last 28d): 2 entries");
    expect(context).toContain("WEIGHT (recent days):");
    expect(context).toContain("NUTRITION (avg/day, last 28d):");
    expect(context).toContain("calories=2350");
    expect(context).toContain("LIFTS (last 28d):");
    expect(context).toContain("Barbell Bench Press: 65kg top");
    expect(context).toContain("LIFT TREND (this wk vs last wk");
    expect(context).toContain("Deadlift: 115->120kg");
    expect(context).toContain("ACTIVITY (last 28d): 2 sessions, 75 min total");
    expect(context).toContain("WEEKLY VERDICT");
    expect(context).toContain("hold");
    expect(context).toContain("VERDICT HISTORY (newest first):");
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

describe("parseOpenAIDelta", () => {
  it("extracts the text delta from an output_text.delta event", () => {
    const payload = JSON.stringify({ type: "response.output_text.delta", delta: "Hello" });
    expect(parseOpenAIDelta(payload)).toBe("Hello");
  });

  it("ignores non-delta, [DONE] and empty payloads", () => {
    expect(parseOpenAIDelta(JSON.stringify({ type: "response.completed" }))).toBeNull();
    expect(parseOpenAIDelta("[DONE]")).toBeNull();
    expect(parseOpenAIDelta("")).toBeNull();
  });

  it("ignores invalid JSON and non-string deltas", () => {
    expect(parseOpenAIDelta("{not json")).toBeNull();
    expect(
      parseOpenAIDelta(JSON.stringify({ type: "response.output_text.delta", delta: 5 })),
    ).toBeNull();
  });
});

describe("routeChatModel", () => {
  it("sends short, simple questions to the fast model", () => {
    expect(routeChatModel("how much protein did I eat?")).toBe(config.models.chatFast);
    expect(routeChatModel("thanks")).toBe(config.models.chatFast);
  });

  it("sends reasoning-heavy questions to the smart model", () => {
    expect(routeChatModel("should I change my calories this week?")).toBe(config.models.chatSmart);
    expect(routeChatModel("why has my bench stalled?")).toBe(config.models.chatSmart);
    expect(routeChatModel("give me this week's check-in")).toBe(config.models.chatSmart);
  });

  it("sends long messages to the smart model", () => {
    expect(routeChatModel("x".repeat(200))).toBe(config.models.chatSmart);
  });
});

describe("parseOpenAIEvent", () => {
  it("returns streamed text deltas", () => {
    expect(
      parseOpenAIEvent(JSON.stringify({ type: "response.output_text.delta", delta: "Hi" })),
    ).toEqual({ kind: "text", delta: "Hi" });
  });

  it("returns completed function calls", () => {
    expect(
      parseOpenAIEvent(
        JSON.stringify({
          type: "response.output_item.done",
          item: {
            type: "function_call",
            call_id: "call_1",
            name: "get_lift_history",
            arguments: '{"days":7}',
          },
        }),
      ),
    ).toEqual({
      kind: "function-call",
      callId: "call_1",
      name: "get_lift_history",
      args: '{"days":7}',
    });
  });

  it("ignores everything else", () => {
    expect(parseOpenAIEvent("[DONE]")).toEqual({ kind: "other" });
    expect(parseOpenAIEvent(JSON.stringify({ type: "response.completed" }))).toEqual({ kind: "other" });
  });
});

describe("executeCoachTool", () => {
  it("scopes lift history to the user and maps rows", async () => {
    mocks.findManyLift.mockResolvedValue([
      { date: new Date("2026-10-08"), exerciseName: "Bench", weightKg: 60, reps: 8 },
    ]);

    const result = await executeCoachTool(
      "user-1",
      "get_lift_history",
      JSON.stringify({ days: 7, exercise: "Bench" }),
    );

    expect(result).toEqual([{ date: "2026-10-08", exercise: "Bench", weight_kg: 60, reps: 8 }]);
    const where = mocks.findManyLift.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.userId).toBe("user-1");
    expect(where.exerciseName).toBe("Bench");
  });

  it("returns a null day when there is no active plan", async () => {
    mocks.findFirstPlan.mockResolvedValue(null);
    expect(await executeCoachTool("user-1", "get_plan_vs_actual", "{}")).toEqual({
      date: expect.any(String),
      day: null,
    });
  });

  it("never throws — unknown tools and bad args resolve", async () => {
    expect(await executeCoachTool("user-1", "nope", "{}")).toEqual({ error: "Unknown tool: nope" });
    mocks.findManyDaily.mockResolvedValue([]);
    expect(await executeCoachTool("user-1", "get_daily_logs", "{not json")).toEqual([]);
  });
});
