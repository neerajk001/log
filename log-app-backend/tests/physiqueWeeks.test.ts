import { describe, expect, it } from "vitest";
import { physiqueWeekStart } from "../src/services/physiqueWeeks";

describe("physiqueWeekStart", () => {
  it("keeps a Monday as the week start", () => {
    expect(physiqueWeekStart("2026-10-19")).toBe("2026-10-19");
  });

  it("maps a Sunday back to the Monday that began its week", () => {
    expect(physiqueWeekStart("2026-10-25")).toBe("2026-10-19");
  });

  it("maps a mid-week day back to Monday", () => {
    expect(physiqueWeekStart("2026-10-22")).toBe("2026-10-19");
  });

  it("handles a year boundary", () => {
    expect(physiqueWeekStart("2027-01-01")).toBe("2026-12-28");
    expect(physiqueWeekStart("2026-12-31")).toBe("2026-12-28");
  });
});
