import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getLiftProgress } from "../src/services/liftProgress";

const userId = "11111111-1111-4111-8111-111111111111";

const windows = {
  from: "2026-10-01",
  to: "2026-10-07",
  prevFrom: "2026-09-24",
  prevTo: "2026-09-30",
};

function row(
  date: string,
  exerciseName: string,
  opts: {
    kg?: number | null;
    reps?: number;
    position?: number | null;
    increment?: number | null;
    unit?: string | null;
  } = {},
) {
  return {
    date: new Date(`${date}T00:00:00Z`),
    exerciseName,
    weightKg: opts.kg == null ? null : new Prisma.Decimal(opts.kg),
    reps: opts.reps ?? 8,
    platePosition: opts.position ?? null,
    plateIncrement: opts.increment == null ? null : new Prisma.Decimal(opts.increment),
    plateUnit: opts.unit ?? null,
  };
}

function client(rows: ReturnType<typeof row>[]) {
  return { liftLog: { findMany: vi.fn().mockResolvedValue(rows) } };
}

describe("getLiftProgress", () => {
  it("builds kg sessions and compares the current window with the previous one", async () => {
    const mock = client([
      row("2026-09-25", "Bench Press", { kg: 60, reps: 5 }),
      row("2026-10-01", "Bench Press", { kg: 60, reps: 8 }),
      row("2026-10-03", "Bench Press", { kg: 65, reps: 5 }),
    ]);

    const result = await getLiftProgress(userId, windows, mock as never);
    const bench = result.exercises.find((e) => e.name === "Bench Press")!;

    expect(bench.mode).toBe("kg");
    expect(bench.sessions).toBe(2);
    expect(bench.sets).toBe(2);
    expect(bench.volume).toBe(60 * 8 + 65 * 5);
    expect(bench.best_value).toBe(65);
    expect(bench.previous_best_value).toBe(60);
    expect(bench.change_value).toBe(5);
    expect(bench.change_pct).toBe(8.3);
    expect(bench.best_set).toMatchObject({ weight_kg: 65, reps: 5 });
    expect(bench.points.map((p) => p.date)).toEqual(["2026-10-01", "2026-10-03"]);
    expect(bench.points.map((p) => p.top_value)).toEqual([60, 65]);
  });

  it("tracks bodyweight sets by reps, with no volume", async () => {
    const mock = client([
      row("2026-09-25", "Hanging Leg Raise", { reps: 10 }),
      row("2026-10-02", "Hanging Leg Raise", { reps: 12 }),
      row("2026-10-04", "Hanging Leg Raise", { reps: 15 }),
    ]);

    const result = await getLiftProgress(userId, windows, mock as never);
    const lift = result.exercises.find((e) => e.name === "Hanging Leg Raise")!;

    expect(lift.mode).toBe("bw");
    expect(lift.best_value).toBe(15);
    expect(lift.previous_best_value).toBe(10);
    expect(lift.change_value).toBe(5);
    expect(lift.change_pct).toBeNull();
    expect(lift.volume).toBe(0);
    expect(lift.best_set).toMatchObject({ weight_kg: null, reps: 15 });
  });

  it("tracks plate positions and keeps the calibration snapshot", async () => {
    const mock = client([
      row("2026-09-26", "Leg Press", { position: 7, increment: 5, unit: "kg", reps: 10 }),
      row("2026-10-02", "Leg Press", { position: 8, increment: 5, unit: "kg", reps: 10 }),
      row("2026-10-04", "Leg Press", { position: 9, increment: 5, unit: "kg", reps: 8 }),
    ]);

    const result = await getLiftProgress(userId, windows, mock as never);
    const legPress = result.exercises.find((e) => e.name === "Leg Press")!;

    expect(legPress.mode).toBe("plate");
    expect(legPress.best_value).toBe(9);
    expect(legPress.previous_best_value).toBe(7);
    expect(legPress.change_value).toBe(2);
    expect(legPress.change_pct).toBeNull();
    expect(legPress.volume).toBe(0);
    expect(legPress.best_set).toMatchObject({
      weight_kg: null,
      plate_position: 9,
      plate_increment: 5,
      plate_unit: "kg",
      reps: 8,
    });
    expect(legPress.points.map((p) => p.top_value)).toEqual([8, 9]);
  });

  it("uses kg when an exercise mixes kg and plate sets", async () => {
    const mock = client([
      row("2026-10-02", "Leg Press", { kg: 100, reps: 8 }),
      row("2026-10-04", "Leg Press", { position: 9, increment: 5, unit: "kg", reps: 8 }),
    ]);

    const result = await getLiftProgress(userId, windows, mock as never);
    const legPress = result.exercises.find((e) => e.name === "Leg Press")!;

    expect(legPress.mode).toBe("kg");
    expect(legPress.best_value).toBe(100);
  });

  it("ignores exercises only seen in the previous window", async () => {
    const mock = client([row("2026-09-25", "Old Lift", { kg: 40 })]);

    const result = await getLiftProgress(userId, windows, mock as never);

    expect(result.exercises).toEqual([]);
    const where = mock.liftLog.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe(userId);
    expect(where.date.gte).toEqual(new Date("2026-09-24T00:00:00Z"));
    expect(where.date.lte).toEqual(new Date("2026-10-07T00:00:00Z"));
  });
});
