import { describe, expect, it } from "vitest";
import { resolvePlanDayForDate, type PlanDayLike } from "../src/services/planRotation";
import { matchPlanDayIds } from "../src/services/planDays";

function days(count: number): PlanDayLike[] {
  return Array.from({ length: count }, (_, i) => ({ id: `day-${i + 1}`, dayOrder: i + 1 }));
}

/** The caller passes the athlete's local date as UTC midnight. */
function localDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

describe("resolvePlanDayForDate", () => {
  it("starts on the first day and advances one per day", () => {
    const plan = days(3);

    expect(resolvePlanDayForDate(localDate("2026-10-01"), plan, localDate("2026-10-01"))?.id).toBe("day-1");
    expect(resolvePlanDayForDate(localDate("2026-10-01"), plan, localDate("2026-10-02"))?.id).toBe("day-2");
    expect(resolvePlanDayForDate(localDate("2026-10-01"), plan, localDate("2026-10-03"))?.id).toBe("day-3");
  });

  it("wraps around the plan's week", () => {
    const plan = days(4);

    expect(resolvePlanDayForDate(localDate("2026-10-01"), plan, localDate("2026-10-05"))?.id).toBe("day-1");
    expect(resolvePlanDayForDate(localDate("2026-10-01"), plan, localDate("2026-10-09"))?.id).toBe("day-1");
  });

  it("uses the date it is given, not the server's today", () => {
    const plan = days(2);
    const start = localDate("2026-10-01");

    // 00:30 IST on the 3rd is still the 2nd in UTC — the athlete's date decides.
    expect(resolvePlanDayForDate(start, plan, localDate("2026-10-03"))?.id).toBe("day-1");
    expect(resolvePlanDayForDate(start, plan, localDate("2026-10-04"))?.id).toBe("day-2");
  });

  it("falls back to the first day for a date before the plan existed", () => {
    expect(
      resolvePlanDayForDate(localDate("2026-10-05"), days(3), localDate("2026-10-01"))?.id,
    ).toBe("day-1");
  });

  it("returns null when the plan has no days", () => {
    expect(resolvePlanDayForDate(localDate("2026-10-01"), [], localDate("2026-10-02"))).toBeNull();
  });
});

/**
 * Plan updates match days by position so the lift logs pointing at them survive — an edit
 * that recreated every day used to null `lift_logs.plan_day_id` and cost history its
 * session names.
 */
describe("matchPlanDayIds", () => {
  it("keeps day i on day i, so a renamed day still owns its sets", () => {
    expect(matchPlanDayIds(["a", "b", "c"], 3)).toEqual({ keep: ["a", "b", "c"], remove: [] });
  });

  it("removes only the days the new plan doesn't have", () => {
    expect(matchPlanDayIds(["a", "b", "c", "d"], 2)).toEqual({
      keep: ["a", "b"],
      remove: ["c", "d"],
    });
  });

  it("keeps everything when the plan gains days", () => {
    expect(matchPlanDayIds(["a"], 4)).toEqual({ keep: ["a"], remove: [] });
  });

  it("handles an empty existing plan", () => {
    expect(matchPlanDayIds([], 3)).toEqual({ keep: [], remove: [] });
  });
});
