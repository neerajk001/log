import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachChatSchema,
  coachProfileSchema,
  onboardingSchema,
  planExerciseSchema,
  updateMeSchema,
} from "../src/validation/schemas";

const mocks = vi.hoisted(() => ({
  findUniqueProfile: vi.fn(),
  findManyDaily: vi.fn(),
  findManyLift: vi.fn(),
  findManyVerdicts: vi.fn(),
  findFirstPlan: vi.fn(),
  findManyPlans: vi.fn(),
  findManyActivity: vi.fn(),
  findFirstDaily: vi.fn(),
  findFirstLift: vi.fn(),
  findManyMeals: vi.fn(),
  findFirstMeal: vi.fn(),
  findManyCoachMessages: vi.fn(),
  findFirstSession: vi.fn(),
  createSession: vi.fn(),
  findUniqueMemory: vi.fn(),
  upsertMemory: vi.fn(),
}));

vi.mock("../src/db/client", () => ({
  prisma: {
    coachProfile: { findUnique: mocks.findUniqueProfile },
    dailyLog: { findMany: mocks.findManyDaily, findFirst: mocks.findFirstDaily },
    liftLog: { findMany: mocks.findManyLift, findFirst: mocks.findFirstLift },
    weeklyVerdict: { findMany: mocks.findManyVerdicts },
    workoutPlan: { findFirst: mocks.findFirstPlan, findMany: mocks.findManyPlans },
    mealLog: { findMany: mocks.findManyMeals, findFirst: mocks.findFirstMeal },
    activityLog: { findMany: mocks.findManyActivity },
    coachMessage: { findMany: mocks.findManyCoachMessages, create: vi.fn().mockResolvedValue({}) },
    coachSession: {
      findFirst: mocks.findFirstSession,
      create: mocks.createSession,
      update: vi.fn().mockResolvedValue({}),
    },
    coachMemory: { findUnique: mocks.findUniqueMemory, upsert: mocks.upsertMemory },
  },
}));

import {
  AGENTS,
  buildAthleteContext,
  executeCoachTool,
  maybeUpdateMemory,
  parseOpenAIDelta,
  parseOpenAIEvent,
  routeAgent,
  routeChatModel,
  runCoachChatStream,
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
  mocks.findManyPlans.mockReset().mockResolvedValue([]);
  mocks.findFirstLift.mockReset().mockResolvedValue(null);
  mocks.findManyMeals.mockReset().mockResolvedValue([]);
  mocks.findFirstMeal.mockReset().mockResolvedValue(null);
  mocks.findManyActivity.mockReset().mockResolvedValue([]);
  mocks.findFirstDaily.mockReset().mockResolvedValue(null);
  mocks.findManyCoachMessages.mockReset().mockResolvedValue([]);
  mocks.findFirstSession.mockReset().mockResolvedValue(null);
  mocks.createSession.mockReset().mockResolvedValue({ id: "sess-1" });
  mocks.findUniqueMemory.mockReset().mockResolvedValue(null);
  mocks.upsertMemory.mockReset().mockResolvedValue({});
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

describe("planExerciseSchema", () => {
  it("accepts an optional target weight", () => {
    expect(
      planExerciseSchema.safeParse({ name: "Squat", sets: 3, reps: "5", weight_kg: 100 }).success,
    ).toBe(true);
    expect(planExerciseSchema.safeParse({ name: "Squat", sets: 3, reps: "5" }).success).toBe(true);
  });

  it("rejects a non-positive weight", () => {
    expect(
      planExerciseSchema.safeParse({ name: "Squat", sets: 3, reps: "5", weight_kg: 0 }).success,
    ).toBe(false);
  });
});

describe("updateMeSchema", () => {
  it("accepts rest days as weekday numbers", () => {
    expect(updateMeSchema.safeParse({ rest_days: [0] }).success).toBe(true);
    expect(updateMeSchema.safeParse({ rest_days: [0, 6] }).success).toBe(true);
    expect(updateMeSchema.safeParse({ rest_days: null }).success).toBe(true);
    expect(updateMeSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an out-of-range weekday", () => {
    expect(updateMeSchema.safeParse({ rest_days: [7] }).success).toBe(false);
    expect(updateMeSchema.safeParse({ rest_days: [-1] }).success).toBe(false);
  });
});

describe("onboardingSchema", () => {
  it("accepts a full payload", () => {
    expect(
      onboardingSchema.safeParse({
        goal: "Build muscle",
        sex: "male",
        age: 22,
        height_cm: 160,
        weight_kg: 65,
        target_weight_kg: 60,
        experience: "beginner",
        days_per_week: 5,
        rest_days: [0, 6],
        meal_tracking_enabled: true,
        ai_coach_enabled: true,
      }).success,
    ).toBe(true);
  });

  it("accepts a partial payload", () => {
    expect(onboardingSchema.safeParse({ goal: "Stay fit" }).success).toBe(true);
    expect(onboardingSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a bad sex or age", () => {
    expect(onboardingSchema.safeParse({ sex: "unspecified" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ age: 9 }).success).toBe(false);
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
    expect(routeChatModel("show me my last workout")).toBe(config.models.chatFast);
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

describe("routeAgent", () => {
  it("routes food messages to the meal agent", () => {
    expect(routeAgent("I ate 2 rotis and dal")).toBe("meal");
    expect(routeAgent("breakfast was oats and eggs")).toBe("meal");
  });

  it("routes plan/lift messages to the training agent", () => {
    expect(routeAgent("swap squat for leg press")).toBe("training");
    expect(routeAgent("why is my bench stalling?")).toBe("training");
  });

  it("defaults to general", () => {
    expect(routeAgent("how am I doing overall?")).toBe("general");
  });

  it("lets an explicit pick override the router", () => {
    expect(routeAgent("I ate 2 rotis", "training")).toBe("training");
    expect(routeAgent("swap squat for leg press", "meal")).toBe("meal");
  });
});

describe("agents", () => {
  const toolNames = (id: "general" | "meal" | "training") =>
    (AGENTS[id].tools as { name: string }[]).map((t) => t.name);

  it("general exposes every tool", () => {
    expect(toolNames("general").length).toBeGreaterThan(toolNames("meal").length);
  });

  it("meal exposes only the meal + day-log tools", () => {
    expect(toolNames("meal").sort()).toEqual([
      "delete_meal",
      "get_day_logs",
      "get_meals",
      "log_meal",
      "lookup_food",
      "update_meal",
    ]);
  });

  it("training exposes plan/lift tools and no meal tool", () => {
    expect(toolNames("training")).toContain("update_plan");
    expect(toolNames("training")).toContain("update_logged_set");
    expect(toolNames("training")).not.toContain("log_meal");
  });
});

describe("lookup_food", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalises Open Food Facts results and drops entries without nutriments", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          products: [
            {
              product_name: "CORN FLAKES",
              brands: "Kelloggs",
              serving_size: "30g",
              nutriments: { "energy-kcal_100g": 376.666666666667, proteins_100g: 7 },
            },
            { product_name: "No nutriments", nutriments: {} },
          ],
        }),
      }),
    );

    const result = await executeCoachTool(
      "user-1",
      "lookup_food",
      JSON.stringify({ query: "kellogg corn flakes test" }),
    );

    expect(result).toEqual({
      source: "open_food_facts",
      results: [
        {
          name: "CORN FLAKES",
          brand: "Kelloggs",
          serving_size: "30g",
          kcal_per_100g: 376.7,
          protein_per_100g: 7,
        },
      ],
    });
  });

  it("returns an empty result + a note when nothing matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ products: [] }) }),
    );

    const result = (await executeCoachTool(
      "user-1",
      "lookup_food",
      JSON.stringify({ query: "zzz-nothing-xyz" }),
    )) as { results: unknown[]; note?: string };

    expect(result.results).toEqual([]);
    expect(result.note).toBeTruthy();
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

  it("returns the completed response id and token usage", () => {
    expect(
      parseOpenAIEvent(
        JSON.stringify({
          type: "response.completed",
          response: {
            id: "resp_1",
            usage: { input_tokens: 1200, output_tokens: 80, total_tokens: 1280 },
          },
        }),
      ),
    ).toEqual({
      kind: "completed",
      responseId: "resp_1",
      usage: { inputTokens: 1200, outputTokens: 80, totalTokens: 1280 },
    });
  });

  it("ignores everything else", () => {
    expect(parseOpenAIEvent("[DONE]")).toEqual({ kind: "other" });
    expect(parseOpenAIEvent(JSON.stringify({ type: "response.created" }))).toEqual({ kind: "other" });
  });

  it("flags an incomplete (truncated) response", () => {
    expect(
      parseOpenAIEvent(JSON.stringify({ type: "response.incomplete", response: { id: "resp_2" } })),
    ).toEqual({ kind: "incomplete", responseId: "resp_2", usage: null });
  });
});

describe("executeCoachTool", () => {
  it("scopes lift history to the user and maps rows", async () => {
    mocks.findManyLift.mockResolvedValue([
      { id: "set-1", date: new Date("2026-10-08"), exerciseName: "Bench", weightKg: 60, reps: 8 },
    ]);

    const result = await executeCoachTool(
      "user-1",
      "get_lift_history",
      JSON.stringify({ days: 7, exercise: "Bench" }),
    );

    expect(result).toEqual([
      { id: "set-1", date: "2026-10-08", exercise: "Bench", weight_kg: 60, reps: 8 },
    ]);
    const where = mocks.findManyLift.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.userId).toBe("user-1");
    expect(where.exerciseName).toBe("Bench");
  });

  it("returns a null day when there is no active plan", async () => {
    mocks.findFirstPlan.mockResolvedValue(null);
    expect(await executeCoachTool("user-1", "get_plan_vs_actual", "{}")).toMatchObject({
      date: expect.any(String),
      day: null,
    });
  });

  it("surfaces the day's actual logs for 'what did I log'", async () => {
    mocks.findManyLift.mockResolvedValue([
      { exerciseName: "Romanian Deadlift", weightKg: 10, reps: 10 },
      { exerciseName: "Romanian Deadlift", weightKg: 15, reps: 8 },
      { exerciseName: "Cable Crunch", weightKg: 12, reps: 10 },
    ]);
    mocks.findFirstDaily.mockResolvedValue({ weightKg: 64.5, calories: 1700, proteinG: 57, sleepHours: 7 });
    mocks.findManyActivity.mockResolvedValue([]);

    const result = (await executeCoachTool("user-1", "get_day_logs", "{}", "2026-10-09")) as {
      date: string;
      lifts: unknown[];
      daily: unknown;
    };

    expect(result.date).toBe("2026-10-09");
    expect(result.lifts).toEqual([
      { exercise: "Romanian Deadlift", sets: 2, top_set: { weight_kg: 15, reps: 8 } },
      { exercise: "Cable Crunch", sets: 1, top_set: { weight_kg: 12, reps: 10 } },
    ]);
    expect(result.daily).toEqual({
      weight_kg: 64.5,
      calories: 1700,
      protein_g: 57,
      sleep_hours: 7,
    });
    expect((mocks.findManyLift.mock.calls[0][0] as { where: { userId: string } }).where.userId).toBe(
      "user-1",
    );
  });

  it("does not hide off-plan work from the plan comparison", async () => {
    mocks.findFirstPlan.mockResolvedValue({
      createdAt: new Date("2026-09-01"),
      planDays: [
        {
          id: "d1",
          dayName: "LEGS (STRENGTH)",
          dayOrder: 1,
          exercises: [{ name: "Cable Crunch", sets: 3, reps: "15" }],
        },
      ],
    });
    mocks.findManyLift.mockResolvedValue([
      { exerciseName: "Cable Crunch", weightKg: 12, reps: 10 },
      { exerciseName: "Romanian Deadlift", weightKg: 15, reps: 8 },
    ]);

    const result = (await executeCoachTool("user-1", "get_plan_vs_actual", "{}", "2026-10-09")) as {
      prescribed: { name: string; logged_sets: number }[];
      also_logged_off_plan: string[];
    };

    expect(result.prescribed[0]).toMatchObject({ name: "Cable Crunch", logged_sets: 1 });
    expect(result.also_logged_off_plan).toContain("Romanian Deadlift");
  });

  it("never throws — unknown tools and bad args resolve", async () => {
    expect(await executeCoachTool("user-1", "nope", "{}")).toEqual({ error: "Unknown tool: nope" });
    mocks.findManyDaily.mockResolvedValue([]);
    expect(await executeCoachTool("user-1", "get_daily_logs", "{not json")).toEqual([]);
  });
});

describe("coach proposals", () => {
  const plan = (overrides: Record<string, unknown> = {}) => ({
    id: "p1",
    name: "PPL",
    source: "ai_parsed",
    isActive: true,
    planDays: [
      {
        id: "d1",
        dayName: "Push",
        dayOrder: 1,
        exercises: [{ name: "Bench", sets: 3, reps: "8" }],
      },
    ],
    ...overrides,
  });

  it("lists the user's plans with days and exercises", async () => {
    mocks.findManyPlans.mockResolvedValue([plan()]);

    const result = await executeCoachTool("user-1", "get_plans", "{}");

    expect(result).toEqual([
      {
        id: "p1",
        name: "PPL",
        is_active: true,
        days: [{ day_name: "Push", exercises: [{ name: "Bench", sets: 3, reps: "8" }] }],
      },
    ]);
  });

  it("proposes a plan update resolved by name", async () => {
    mocks.findManyPlans.mockResolvedValue([plan()]);

    const result = await executeCoachTool(
      "user-1",
      "update_plan",
      JSON.stringify({
        plan: "ppl",
        days: [{ day_name: "Push", exercises: [{ name: "Bench", sets: 3, reps: "5" }] }],
        summary: "Bench to 3x5",
      }),
    );

    expect(result).toMatchObject({
      __proposal: {
        kind: "plan_update",
        plan_id: "p1",
        plan_name: "PPL",
        name: "PPL",
        source: "ai_parsed",
        summary: "Bench to 3x5",
        days: [{ day_name: "Push", exercises: [{ name: "Bench", sets: 3, reps: "5" }] }],
      },
    });
  });

  it("patches a single named day and keeps the rest", async () => {
    mocks.findManyPlans.mockResolvedValue([
      plan({
        planDays: [
          { id: "d1", dayName: "Upper", dayOrder: 1, exercises: [{ name: "Bench", sets: 3, reps: "8" }] },
          { id: "d2", dayName: "Lower", dayOrder: 2, exercises: [{ name: "Squat", sets: 3, reps: "5" }] },
        ],
      }),
    ]);

    const result = (await executeCoachTool(
      "user-1",
      "update_plan",
      JSON.stringify({
        plan: "PPL",
        day_name: "Lower",
        exercises: [{ name: "Leg Press", sets: 3, reps: "10" }],
        summary: "Swap squat for leg press",
      }),
    )) as { __proposal: { days: { day_name: string; exercises: { name: string }[] }[] } };

    expect(result.__proposal.days).toEqual([
      { day_name: "Upper", exercises: [{ name: "Bench", sets: 3, reps: "8" }] },
      { day_name: "Lower", exercises: [{ name: "Leg Press", sets: 3, reps: "10" }] },
    ]);
  });

  it("rejects a plan update with invalid days", async () => {
    mocks.findManyPlans.mockResolvedValue([plan()]);

    const result = await executeCoachTool(
      "user-1",
      "update_plan",
      JSON.stringify({ days: [] }),
    );

    expect(result).toHaveProperty("error");
  });

  it("proposes activating and deleting a plan", async () => {
    mocks.findManyPlans.mockResolvedValue([plan({ isActive: false })]);

    expect(
      await executeCoachTool("user-1", "activate_plan", JSON.stringify({ plan: "PPL" })),
    ).toEqual({ __proposal: { kind: "plan_activate", plan_id: "p1", plan_name: "PPL" } });
    expect(
      await executeCoachTool("user-1", "delete_plan", JSON.stringify({ plan: "PPL" })),
    ).toEqual({ __proposal: { kind: "plan_delete", plan_id: "p1", plan_name: "PPL" } });
  });

  it("errors when no plan matches the reference", async () => {
    mocks.findManyPlans.mockResolvedValue([plan()]);

    const result = await executeCoachTool(
      "user-1",
      "activate_plan",
      JSON.stringify({ plan: "nope" }),
    );

    expect(result).toHaveProperty("error");
  });

  it("proposes a logged-set correction with the current values", async () => {
    mocks.findFirstLift.mockResolvedValue({
      id: "s1",
      date: new Date("2026-10-08"),
      exerciseName: "Bench",
      weightKg: 60,
      reps: 8,
    });

    const result = await executeCoachTool(
      "user-1",
      "update_logged_set",
      JSON.stringify({ set_id: "s1", weight_kg: 62.5, reps: 8 }),
    );

    expect(result).toEqual({
      __proposal: {
        kind: "set_update",
        set_id: "s1",
        date: "2026-10-08",
        exercise: "Bench",
        from: { weight_kg: 60, reps: 8 },
        to: { weight_kg: 62.5, reps: 8 },
      },
    });
  });

  it("errors when the target set is not the caller's", async () => {
    mocks.findFirstLift.mockResolvedValue(null);

    const result = await executeCoachTool(
      "user-1",
      "delete_logged_set",
      JSON.stringify({ set_id: "nope" }),
    );

    expect(result).toHaveProperty("error");
  });

  it("proposes a meal with summed totals", async () => {
    const result = await executeCoachTool(
      "user-1",
      "log_meal",
      JSON.stringify({
        title: "Breakfast",
        items: [
          { name: "Roti", quantity: "2 medium", calories: 240, protein_g: 6 },
          { name: "Curd", quantity: "1 bowl", calories: 120, protein_g: 8 },
        ],
      }),
      "2026-10-10",
    );

    expect(result).toEqual({
      __proposal: {
        kind: "meal_log",
        date: "2026-10-10",
        title: "Breakfast",
        items: [
          { name: "Roti", quantity: "2 medium", calories: 240, protein_g: 6 },
          { name: "Curd", quantity: "1 bowl", calories: 120, protein_g: 8 },
        ],
        calories: 360,
        protein_g: 14,
      },
    });
  });

  it("lists the day's meals and totals", async () => {
    mocks.findManyMeals.mockResolvedValue([
      { id: "m1", title: "Breakfast", items: [], calories: 360, proteinG: 14 },
      { id: "m2", title: "Lunch", items: [], calories: 600, proteinG: 40 },
    ]);

    const result = (await executeCoachTool("user-1", "get_meals", "{}", "2026-10-10")) as {
      meals: unknown[];
      totals: { calories: number; protein_g: number };
    };

    expect(result.meals).toHaveLength(2);
    expect(result.totals).toEqual({ calories: 960, protein_g: 54 });
  });

  it("errors when the meal to delete isn't the caller's", async () => {
    mocks.findFirstMeal.mockResolvedValue(null);
    expect(await executeCoachTool("user-1", "delete_meal", JSON.stringify({ meal_id: "x" }))).toHaveProperty(
      "error",
    );
  });
});

describe("long-term memory", () => {
  it("includes the memory summary in the context when present", async () => {
    mocks.findUniqueMemory.mockResolvedValue({
      summary: "Prefers 4-day upper/lower; cranky right shoulder.",
    });

    const context = await buildAthleteContext("user-1");

    expect(context).toContain("LONG-TERM MEMORY");
    expect(context).toContain("cranky right shoulder");
  });

  it("skips refresh while the stored memory is fresh", async () => {
    mocks.findUniqueMemory.mockResolvedValue({ summary: "x", updatedAt: new Date() });

    await maybeUpdateMemory("user-1");

    expect(mocks.findManyCoachMessages).not.toHaveBeenCalled();
    expect(mocks.upsertMemory).not.toHaveBeenCalled();
  });

  it("does nothing when there are no messages", async () => {
    mocks.findUniqueMemory.mockResolvedValue(null);
    mocks.findManyCoachMessages.mockResolvedValue([]);

    await maybeUpdateMemory("user-1");

    expect(mocks.upsertMemory).not.toHaveBeenCalled();
  });
});

describe("runCoachChatStream sessions", () => {
  it("rejects a session id that does not belong to the caller", async () => {
    mocks.findFirstSession.mockResolvedValue(null);

    await expect(
      runCoachChatStream("user-1", "11111111-1111-4111-8111-111111111111", "hi", "2026-10-09", {
        onDelta: () => {},
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });
});

describe("local date handling", () => {
  it("uses the caller's local date in the context, not the server's", async () => {
    // The DB/server is on UTC; the athlete is a day ahead.
    mocks.findUniqueProfile.mockResolvedValue({
      goal: "lose fat",
      weightKg: null,
      targetWeightKg: null,
      heightCm: null,
      experience: null,
      daysPerWeek: null,
      equipment: null,
      dietNotes: null,
      injuries: null,
      notes: null,
    });

    const context = await buildAthleteContext("user-1", "2026-10-10");

    expect(context).toContain("TODAY: 2026-10-10");
  });

  it("defaults the plan-vs-actual date to the caller's local date", async () => {
    mocks.findFirstPlan.mockResolvedValue(null);
    expect(await executeCoachTool("user-1", "get_plan_vs_actual", "{}", "2026-10-10")).toMatchObject({
      date: "2026-10-10",
      day: null,
    });
  });
});
