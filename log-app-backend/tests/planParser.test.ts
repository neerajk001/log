import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parsePlanOutput,
  PlanParseError,
  validatePlanOutput,
} from "../src/services/planParser";

const validPlan = {
  days: [
    {
      day_name: "Push",
      exercises: [
        { name: "Barbell Bench Press", sets: 5, reps: "5" },
        { name: "Overhead Press", sets: 3, reps: "8-12" },
      ],
    },
    {
      day_name: "Pull",
      exercises: [{ name: "Deadlift", sets: 3, reps: "5" }],
    },
  ],
};

describe("validatePlanOutput", () => {
  it("accepts a well-formed plan", () => {
    const result = validatePlanOutput(validPlan);
    expect(result.days).toHaveLength(2);
    expect(result.days[0].exercises[0].name).toBe("Barbell Bench Press");
  });

  it("rejects an empty object (no days)", () => {
    expect(() => validatePlanOutput({})).toThrow(PlanParseError);
  });

  it("rejects a day with no exercises", () => {
    expect(() =>
      validatePlanOutput({ days: [{ day_name: "Push", exercises: [] }] }),
    ).toThrow(PlanParseError);
  });

  it("rejects an exercise with wrong field types", () => {
    expect(() =>
      validatePlanOutput({
        days: [
          { day_name: "Push", exercises: [{ name: 123, sets: "5", reps: 5 }] },
        ],
      }),
    ).toThrow(PlanParseError);
  });

  it("rejects an exercise with an empty name", () => {
    expect(() =>
      validatePlanOutput({
        days: [
          { day_name: "Push", exercises: [{ name: "", sets: 5, reps: "5" }] },
        ],
      }),
    ).toThrow(PlanParseError);
  });

  it("rejects null output", () => {
    expect(() => validatePlanOutput(null)).toThrow(PlanParseError);
  });
});

describe("parsePlanOutput", () => {
  it("parses plain JSON", () => {
    const result = parsePlanOutput(JSON.stringify(validPlan));
    expect(result.days).toHaveLength(2);
  });

  it("parses JSON wrapped in a markdown fence", () => {
    const fenced = "```json\n" + JSON.stringify(validPlan) + "\n```";
    expect(parsePlanOutput(fenced).days).toHaveLength(2);
  });

  it("rejects non-JSON text", () => {
    expect(() => parsePlanOutput("not json at all")).toThrow(PlanParseError);
  });

  it("rejects JSON of the wrong shape", () => {
    expect(() => parsePlanOutput(JSON.stringify({ foo: "bar" }))).toThrow(
      PlanParseError,
    );
  });
});

describe("OpenAI API errors", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reports nested API key errors instead of a generic service error", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "API key not valid. Please pass a valid API key.",
              status: "INVALID_ARGUMENT",
              details: [{ reason: "API_KEY_INVALID" }],
            },
          }),
          { status: 400 },
        ),
      ),
    );

    await expect(
      import("../src/services/planParser").then(({ parsePlanText }) =>
        parsePlanText("test plan"),
      ),
    ).rejects.toThrow("OpenAI rejected the API key");
  });
});
