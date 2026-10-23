import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createLiftLogIdempotent,
  getLiftMetrics,
  getLiftSummary,
  serializeLiftLog,
  updateLiftLog,
  type LiftLogInput,
} from "../src/services/liftLogs";
import {
  liftLogSchema,
  liftLogUpdateSchema,
  planExerciseSchema,
} from "../src/validation/schemas";

const userId = "11111111-1111-4111-8111-111111111111";
const requestId = "33333333-3333-4333-8333-333333333333";

function plateInput(overrides: Partial<LiftLogInput> = {}): LiftLogInput {
  return {
    id: requestId,
    date: "2026-10-08",
    exercise_name: "Leg Press",
    weight_kg: null,
    reps: 10,
    plate_position: 8,
    plate_increment: 5,
    plate_unit: "kg",
    plan_day_id: null,
    ...overrides,
  };
}

function plateRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    userId,
    date: new Date("2026-10-08"),
    exerciseName: "Leg Press",
    weightKg: null,
    reps: 10,
    platePosition: 8,
    plateIncrement: new Prisma.Decimal(5),
    plateUnit: "kg",
    planDayId: null,
    ...overrides,
  };
}

function client(existing: ReturnType<typeof plateRecord> | null = null) {
  return {
    liftLog: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue(plateRecord()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    planDay: { findFirst: vi.fn().mockResolvedValue({ id: "plan-day" }) },
  };
}

describe("plan plate config", () => {
  it("accepts a calibrated plate exercise", () => {
    const parsed = planExerciseSchema.safeParse({
      name: "Leg Press",
      sets: 3,
      reps: "10",
      load_mode: "plate",
      plate_config: { unit: "kg", increment: 5, min_position: 1, max_position: 20 },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts plate mode without calibration (position only)", () => {
    expect(
      planExerciseSchema.safeParse({ name: "Leg Press", sets: 3, reps: "10", load_mode: "plate" })
        .success,
    ).toBe(true);
  });

  it("defaults calibration bounds when only the per-position load is given", () => {
    const parsed = planExerciseSchema.parse({
      name: "Leg Press",
      sets: 3,
      reps: "10",
      load_mode: "plate",
      plate_config: { unit: "lb", increment: 10 },
    });
    expect(parsed.plate_config).toMatchObject({
      unit: "lb",
      increment: 10,
      min_position: 1,
      max_position: 999,
    });
  });

  it("rejects calibration without plate mode or with an inverted range", () => {
    expect(
      planExerciseSchema.safeParse({
        name: "Leg Press",
        sets: 3,
        reps: "10",
        plate_config: { unit: "kg", increment: 5, min_position: 1, max_position: 20 },
      }).success,
    ).toBe(false);
    expect(
      planExerciseSchema.safeParse({
        name: "Leg Press",
        sets: 3,
        reps: "10",
        load_mode: "plate",
        plate_config: { unit: "kg", increment: 5, min_position: 20, max_position: 1 },
      }).success,
    ).toBe(false);
  });
});

describe("lift plate fields", () => {
  it("accepts a position with or without calibration", () => {
    expect(liftLogSchema.safeParse(plateInput()).success).toBe(true);
    expect(
      liftLogSchema.safeParse(
        plateInput({ plate_increment: undefined, plate_unit: undefined }),
      ).success,
    ).toBe(true);
  });

  it("rejects both kg and a position, or half a calibration", () => {
    expect(liftLogSchema.safeParse(plateInput({ weight_kg: 100 })).success).toBe(false);
    expect(
      liftLogSchema.safeParse(plateInput({ plate_unit: undefined })).success,
    ).toBe(false);
    expect(
      liftLogUpdateSchema.safeParse({ weight_kg: null, reps: 10, plate_increment: 5 }).success,
    ).toBe(false);
  });
});

describe("plate persistence", () => {
  it("stores the position and calibration snapshot", async () => {
    const mock = client();
    const { created } = await createLiftLogIdempotent(userId, plateInput(), mock as never);

    expect(created).toBe(true);
    expect(mock.liftLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          weightKg: null,
          platePosition: 8,
          plateIncrement: 5,
          plateUnit: "kg",
        }),
      }),
    );
  });

  it("replays an identical plate request and conflicts when the position changed", async () => {
    const existing = plateRecord();
    await expect(
      createLiftLogIdempotent(userId, plateInput(), client(existing) as never),
    ).resolves.toMatchObject({ created: false });

    await expect(
      createLiftLogIdempotent(
        userId,
        plateInput({ plate_position: 9 }),
        client(existing) as never,
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("serializes the snapshot as JSON numbers", () => {
    expect(serializeLiftLog(plateRecord())).toMatchObject({
      weight_kg: null,
      plate_position: 8,
      plate_increment: 5,
      plate_unit: "kg",
    });
  });

  it("keeps plate data when only reps change, and clears it when kg is set", async () => {
    const mock = client();
    mock.liftLog.findUnique.mockResolvedValue(plateRecord());

    await updateLiftLog(userId, requestId, { weight_kg: null, reps: 12 }, mock as never);
    expect(mock.liftLog.updateMany).toHaveBeenLastCalledWith({
      where: { id: requestId, userId },
      data: { weightKg: null, reps: 12 },
    });

    await updateLiftLog(userId, requestId, { weight_kg: 100, reps: 10 }, mock as never);
    expect(mock.liftLog.updateMany).toHaveBeenLastCalledWith({
      where: { id: requestId, userId },
      data: {
        weightKg: 100,
        reps: 10,
        platePosition: null,
        plateIncrement: null,
        plateUnit: null,
      },
    });
  });

  it("returns plate sets in the last-session payload", async () => {
    const row = plateRecord({ createdAt: new Date("2026-10-08T09:00:00Z") });
    const mock = {
      liftLog: {
        groupBy: vi.fn().mockResolvedValue([{ exerciseName: "Leg Press" }]),
        findMany: vi
          .fn()
          .mockResolvedValueOnce([plateRecord()])
          .mockResolvedValueOnce([row]),
      },
    };

    const summary = await getLiftSummary(
      userId,
      { days: 120, before: "2026-10-09" },
      mock as never,
    );

    expect(summary.lastSetsByExercise["Leg Press"]).toEqual({
      date: "2026-10-08",
      sets: [
        {
          weight_kg: null,
          reps: 10,
          plate_position: 8,
          plate_increment: 5,
          plate_unit: "kg",
        },
      ],
    });
  });
});

describe("plate metrics", () => {
  it("counts plate sets as work but keeps them out of kg volume and records", async () => {
    const windows = {
      from: "2026-10-01",
      to: "2026-10-07",
      prevFrom: "2026-09-24",
      prevTo: "2026-09-30",
    };
    const mock = {
      liftLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            date: new Date("2026-10-02T00:00:00Z"),
            exerciseName: "Leg Press",
            weightKg: null,
            reps: 10,
          },
        ]),
      },
    };

    const metrics = await getLiftMetrics(userId, windows, mock as never);
    const legPress = metrics.exercises.find((e) => e.name === "Leg Press")!;

    expect(legPress.sets).toBe(1);
    expect(legPress.volume).toBe(0);
    expect(legPress.bestKg).toBe(0);
    expect(metrics.days).toEqual([{ date: "2026-10-02", sets: 1 }]);
  });
});
