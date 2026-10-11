import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("../src/db/client", () => ({
  prisma: {
    coachDecision: {
      findMany: mocks.findMany,
      create: mocks.create,
      updateMany: mocks.updateMany,
      deleteMany: mocks.deleteMany,
    },
  },
}));

import {
  clearDecisions,
  decisionsContext,
  listDecisions,
  recordDecision,
} from "../src/services/coachDecisions";

beforeEach(() => {
  mocks.findMany.mockReset().mockResolvedValue([]);
  mocks.create.mockReset();
  mocks.updateMany.mockReset().mockResolvedValue({ count: 0 });
  mocks.deleteMany.mockReset().mockResolvedValue({ count: 0 });
});

describe("recordDecision", () => {
  beforeEach(() => {
    mocks.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "d1",
        kind: data.kind,
        summary: data.summary,
        topic: data.topic ?? null,
        reviewOn: (data.reviewOn as Date | null) ?? null,
        outcome: null,
        createdAt: new Date("2026-10-11T08:00:00Z"),
      }),
    );
  });

  it("trims the summary and defaults the review to 14 days", async () => {
    const row = await recordDecision(
      "user-1",
      { kind: "advice", summary: "  Add ~200 kcal/day  ", topic: "diet" },
      "2026-10-11",
    );

    expect(row.summary).toBe("Add ~200 kcal/day");
    expect(row.review_on).toBe("2026-10-25");
    expect(row.topic).toBe("diet");
    expect(mocks.create.mock.calls[0][0].data.topic).toBe("diet");
  });

  it("clamps the review window and supports no review at all", async () => {
    await recordDecision("user-1", { kind: "advice", summary: "x", reviewInDays: 999 }, "2026-10-11");
    expect(mocks.create.mock.calls[0][0].data.reviewOn.toISOString().slice(0, 10)).toBe("2026-12-06");

    await recordDecision("user-1", { kind: "advice", summary: "x", reviewInDays: null }, "2026-10-11");
    expect(mocks.create.mock.calls[1][0].data.reviewOn).toBeNull();
  });

  it("ignores an unknown topic", async () => {
    await recordDecision("user-1", { kind: "advice", summary: "x", topic: "space" }, "2026-10-11");
    expect(mocks.create.mock.calls[0][0].data.topic).toBeNull();
  });

  it("closes an earlier decision when resolving one", async () => {
    await recordDecision(
      "user-1",
      { kind: "advice", summary: "Deload finished", resolves: "d0", outcome: "felt fresh" },
      "2026-10-11",
    );

    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "d0", userId: "user-1" },
      data: { outcome: "felt fresh" },
    });
  });
});

describe("decisionsContext", () => {
  it("formats each decision, flags overdue reviews and keeps outcomes", async () => {
    mocks.findMany.mockResolvedValue([
      {
        summary: "Swap lateral raise",
        topic: "training",
        reviewOn: new Date("2026-09-30"),
        outcome: "shoulder fine",
        createdAt: new Date("2026-09-23"),
      },
      {
        summary: "Add ~200 kcal/day",
        topic: "diet",
        reviewOn: new Date("2026-10-02"),
        outcome: null,
        createdAt: new Date("2026-09-25"),
      },
    ]);

    const line = await decisionsContext("user-1", "2026-10-11");

    expect(line).toContain("DECISIONS (most recent first):");
    expect(line).toContain("2026-09-25 — Add ~200 kcal/day, diet, review was due 2026-10-02 — follow up");
    expect(line).toContain("2026-09-23 — Swap lateral raise, training, outcome: shoulder fine");
  });

  it("does not flag a review that is still ahead", async () => {
    mocks.findMany.mockResolvedValue([
      {
        summary: "Add ~200 kcal/day",
        topic: "diet",
        reviewOn: new Date("2026-10-25"),
        outcome: null,
        createdAt: new Date("2026-10-11"),
      },
    ]);

    const line = await decisionsContext("user-1", "2026-10-11");
    expect(line).toContain("review 2026-10-25");
    expect(line).not.toContain("follow up");
  });

  it("returns null when nothing is recorded", async () => {
    expect(await decisionsContext("user-1", "2026-10-11")).toBeNull();
  });

  it("never throws when the table is unavailable", async () => {
    mocks.findMany.mockRejectedValue(new Error("relation does not exist"));
    expect(await decisionsContext("user-1", "2026-10-11")).toBeNull();
  });
});

describe("listDecisions and clearDecisions", () => {
  it("serialises rows and clears the log", async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: "d1",
        kind: "verdict",
        summary: "Verdict: hold",
        topic: "diet",
        reviewOn: new Date("2026-10-12"),
        outcome: null,
        createdAt: new Date("2026-10-05T10:00:00Z"),
      },
    ]);

    const rows = await listDecisions("user-1", 5);

    expect(rows).toEqual([
      {
        id: "d1",
        kind: "verdict",
        summary: "Verdict: hold",
        topic: "diet",
        review_on: "2026-10-12",
        outcome: null,
        created_at: "2026-10-05T10:00:00.000Z",
      },
    ]);

    await clearDecisions("user-1");
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });
});
