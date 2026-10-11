import { describe, expect, it } from "vitest";
import { resolvePlanDayForDate, type PlanDayLike } from "../src/services/planRotation";

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
