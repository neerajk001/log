import { describe, expect, it } from "vitest";
import {
  REASONING_MIN_REPLY_TOKENS,
  collectMissingRuntimeConfig,
  reasoningBudgetError,
} from "../src/config";

describe("collectMissingRuntimeConfig", () => {
  const complete = {
    database: { url: "postgresql://user:pass@host/db" },
    clerk: { secretKey: "sk_test_x" },
    ai: { apiKey: "provider-key" },
  };

  it("returns nothing when the required keys are present", () => {
    expect(collectMissingRuntimeConfig(complete)).toEqual([]);
  });

  it("names every missing variable", () => {
    expect(
      collectMissingRuntimeConfig({
        database: { url: "" },
        clerk: { secretKey: "" },
        ai: { apiKey: "" },
      }),
    ).toEqual([
      "DATABASE_URL",
      "CLERK_SECRET_KEY",
      "AI_API_KEY (or COMMANDCODE_API_KEY / OPENAI_API_KEY)",
    ]);
  });

  it("does not demand OPENAI_API_KEY separately — any AI provider key boots", () => {
    // A Command-Code-only deployment: ai.apiKey is set from AI_API_KEY.
    expect(collectMissingRuntimeConfig(complete)).toEqual([]);
  });
});

describe("reasoningBudgetError", () => {
  it("passes when thinking is disabled (the default)", () => {
    expect(reasoningBudgetError("disabled", 400)).toBeNull();
  });

  it("passes when a thinking model has a large enough reply budget", () => {
    expect(reasoningBudgetError("on", REASONING_MIN_REPLY_TOKENS)).toBeNull();
    expect(reasoningBudgetError("on", 2000)).toBeNull();
  });

  it("refuses thinking with a small reply budget", () => {
    const message = reasoningBudgetError("on", 400);
    expect(message).toContain("AI_REPLY_TOKENS");
    expect(message).toContain("AI_THINKING=on");
    expect(message).toContain(String(REASONING_MIN_REPLY_TOKENS));
  });
});
