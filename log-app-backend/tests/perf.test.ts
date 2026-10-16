import { describe, expect, it, vi, afterEach } from "vitest";
import { normalizeQueryText, redactPath, slowDbMs } from "../src/utils/perf";

describe("redactPath", () => {
  it("leaves plain paths untouched", () => {
    expect(redactPath("/api/me")).toBe("/api/me");
    expect(redactPath("/api/verdict/weekly")).toBe("/api/verdict/weekly");
  });

  it("replaces UUID segments so logs can't carry row identifiers", () => {
    expect(redactPath("/api/plans/33333333-3333-4333-8333-333333333333/today")).toBe(
      "/api/plans/:id/today",
    );
  });

  it("drops query strings (dates and filters stay out of aggregated logs)", () => {
    expect(redactPath("/api/logs/daily?from=2026-10-01&to=2026-10-07")).toBe("/api/logs/daily");
  });
});

describe("normalizeQueryText", () => {
  it("collapses whitespace and truncates to one short line", () => {
    expect(normalizeQueryText("SELECT  *\n  FROM  users   WHERE id = $1", 24)).toBe(
      "SELECT * FROM users WHER",
    );
  });
});

describe("slowDbMs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to 200ms", () => {
    vi.stubEnv("DB_SLOW_MS", "");
    expect(slowDbMs()).toBe(200);
  });

  it("honours a valid override and ignores garbage", () => {
    vi.stubEnv("DB_SLOW_MS", "500");
    expect(slowDbMs()).toBe(500);
    vi.stubEnv("DB_SLOW_MS", "soon");
    expect(slowDbMs()).toBe(200);
  });
});
