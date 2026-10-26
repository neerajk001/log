import { describe, expect, it } from "vitest";
import { config } from "../src/config";
import {
  isOnTrial,
  isPro,
  isTrialActive,
  limitFor,
  periodEnd,
  periodStart,
  trialDaysLeft,
  type EntitlementUser,
} from "../src/services/entitlements";

const NOW = new Date("2026-10-24T10:00:00Z");
const DAY_MS = 86_400_000;

const free: EntitlementUser = { planTier: "free", trialEndsAt: null, proUntil: null };

describe("isPro", () => {
  it("is false for a Free athlete with no trial and no subscription", () => {
    expect(isPro(free, NOW)).toBe(false);
  });

  it("is true while the trial is running", () => {
    expect(isPro({ ...free, trialEndsAt: new Date("2026-11-07T10:00:00Z") }, NOW)).toBe(true);
  });

  it("is false once the trial has lapsed", () => {
    expect(isPro({ ...free, trialEndsAt: new Date("2026-10-23T10:00:00Z") }, NOW)).toBe(false);
  });

  it("is true for an open-ended subscription", () => {
    expect(isPro({ planTier: "pro", trialEndsAt: null, proUntil: null }, NOW)).toBe(true);
  });

  it("is true for a subscription that has not expired", () => {
    expect(
      isPro({ planTier: "pro", trialEndsAt: null, proUntil: new Date("2026-11-24T00:00:00Z") }, NOW),
    ).toBe(true);
  });

  it("is false for a subscription that has expired", () => {
    expect(
      isPro({ planTier: "pro", trialEndsAt: null, proUntil: new Date("2026-10-01T00:00:00Z") }, NOW),
    ).toBe(false);
  });
});

describe("isTrialActive / isOnTrial", () => {
  it("reports the trial only while it is running", () => {
    expect(isTrialActive({ ...free, trialEndsAt: new Date("2026-11-07T10:00:00Z") }, NOW)).toBe(true);
    expect(isTrialActive({ ...free, trialEndsAt: new Date("2026-10-01T10:00:00Z") }, NOW)).toBe(false);
  });

  it("does not call a paying subscriber a trial user", () => {
    const user: EntitlementUser = {
      planTier: "pro",
      trialEndsAt: new Date("2026-11-07T10:00:00Z"),
      proUntil: new Date("2026-11-24T00:00:00Z"),
    };
    expect(isTrialActive(user, NOW)).toBe(true);
    expect(isOnTrial(user, NOW)).toBe(false);
  });
});

describe("trialDaysLeft", () => {
  it("is null when there is no trial", () => {
    expect(trialDaysLeft(free, NOW)).toBeNull();
  });

  it("counts whole days remaining, rounded up", () => {
    expect(trialDaysLeft({ ...free, trialEndsAt: new Date(NOW.getTime() + 14 * DAY_MS) }, NOW)).toBe(14);
    expect(trialDaysLeft({ ...free, trialEndsAt: new Date(NOW.getTime() + 0.5 * DAY_MS) }, NOW)).toBe(1);
  });

  it("floors at zero once the trial has expired", () => {
    expect(trialDaysLeft({ ...free, trialEndsAt: new Date("2026-10-01T00:00:00Z") }, NOW)).toBe(0);
  });
});

describe("periodStart", () => {
  it("buckets the weekly chat quota to a Monday (UTC)", () => {
    // 2026-10-24 is a Saturday; the week starts Monday 2026-10-19.
    const start = periodStart("chat", NOW);
    expect(start.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    expect(start.getUTCDay()).toBe(1);
  });

  it("keeps a Monday as its own week start", () => {
    const monday = new Date("2026-10-19T23:59:59Z");
    expect(periodStart("chat", monday).toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("buckets monthly quotas to the 1st of the month", () => {
    expect(periodStart("meal_scan", NOW).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(periodStart("plan_generate", NOW).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("periodEnd", () => {
  it("advances a weekly window by seven days", () => {
    const start = periodStart("chat", NOW);
    expect(periodEnd("chat", start).toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });

  it("advances a monthly window into the next month (and year)", () => {
    expect(periodEnd("meal_scan", new Date("2026-10-01T00:00:00Z")).toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(periodEnd("meal_scan", new Date("2026-12-01T00:00:00Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

describe("limitFor", () => {
  it("returns the configured free allowance", () => {
    expect(limitFor("chat", false)).toBe(config.billing.freeLimits.chat);
    expect(limitFor("meal_scan", false)).toBe(config.billing.freeLimits.meal_scan);
    expect(limitFor("plan_generate", false)).toBe(config.billing.freeLimits.plan_generate);
    expect(limitFor("plan_parse", false)).toBe(config.billing.freeLimits.plan_parse);
  });

  it("locks photo check-ins on the free tier", () => {
    expect(limitFor("physique", false)).toBe(0);
  });

  it("is unlimited for Pro", () => {
    expect(limitFor("chat", true)).toBeNull();
    expect(limitFor("physique", true)).toBeNull();
  });
});
