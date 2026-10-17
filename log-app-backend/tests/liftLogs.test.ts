import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/middleware/errorHandler";
import {
  createLiftLogIdempotent,
  getLiftMetrics,
  getLiftSummary,
  serializeLiftLog,
  updateLiftLog,
  type LiftLogInput,
} from "../src/services/liftLogs";
import { liftLogSchema, liftLogUpdateSchema } from "../src/validation/schemas";

const userId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";

function input(overrides: Partial<LiftLogInput> = {}): LiftLogInput {
  return {
    id: requestId,
    date: "2026-10-08",
    exercise_name: "Barbell Press",
    weight_kg: 60,
    reps: 8,
    plan_day_id: null,
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: requestId,
    userId,
    date: new Date("2026-10-08"),
    exerciseName: "Barbell Press",
    weightKg: new Prisma.Decimal(60),
    reps: 8,
    planDayId: null,
    ...overrides,
  };
}

function client(options: {
  existing?: ReturnType<typeof record> | null;
  created?: ReturnType<typeof record>;
  createError?: unknown;
} = {}) {
  const findUnique = vi.fn().mockResolvedValue(options.existing ?? null);
  const create = options.createError
    ? vi.fn().mockRejectedValue(options.createError)
    : vi.fn().mockResolvedValue(options.created ?? record());
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const findFirst = vi.fn().mockResolvedValue({ id: "plan-day" });
  return {
    liftLog: { findUnique, create, updateMany },
    planDay: { findFirst },
  };
}

function expectConflict(error: unknown): boolean {
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_CONFLICT" });
  return true;
}

/**
 * The Insights screen derives its tiles and lists from this, instead of downloading
 * up to 5,000 raw sets (a 1Y range asks for two years of them).
 */
describe("getLiftMetrics", () => {
  const row = (date: string, exerciseName: string, weightKg: number, reps: number) => ({
    date: new Date(`${date}T00:00:00Z`),
    exerciseName,
    weightKg: new Prisma.Decimal(weightKg),
    reps,
  });

  function metricsClient(rows: unknown[]) {
    return { liftLog: { findMany: vi.fn().mockResolvedValue(rows) } };
  }

  const windows = { from: "2026-10-01", to: "2026-10-07", prevFrom: "2026-09-24", prevTo: "2026-09-30" };

  it("rolls up the current period and compares it with the previous one", async () => {
    const mock = metricsClient([
      row("2026-09-25", "Bench Press", 75, 6),
      row("2026-10-02", "Bench Press", 80, 5),
      row("2026-10-02", "Squat", 100, 5),
      row("2026-10-04", "Bench Press", 82.5, 4),
    ]);

    const metrics = await getLiftMetrics(userId, windows, mock as never);

    expect(metrics.days).toEqual([
      { date: "2026-10-02", sets: 2 },
      { date: "2026-10-04", sets: 1 },
    ]);

    const bench = metrics.exercises.find((e) => e.name === "Bench Press")!;
    expect(bench.sets).toBe(2);
    expect(bench.volume).toBe(80 * 5 + 82.5 * 4);
    expect(bench.bestKg).toBe(82.5);
    expect(bench.bestReps).toBe(4);
    expect(bench.bestDate).toBe("2026-10-04");
    // The best *before* this one, for the PR delta: 80, not the older 75.
    expect(bench.prevBestKg).toBe(80);
    expect(bench.currentTopKg).toBe(82.5);
    expect(bench.previousTopKg).toBe(75);

    const squat = metrics.exercises.find((e) => e.name === "Squat")!;
    expect(squat.sets).toBe(1);
    expect(squat.previousTopKg).toBe(0);
  });

  it("ignores sets outside both windows", async () => {
    const mock = metricsClient([
      row("2026-08-01", "Bench Press", 200, 1),
      row("2026-10-02", "Bench Press", 80, 5),
    ]);

    const metrics = await getLiftMetrics(userId, windows, mock as never);

    expect(metrics.days).toEqual([{ date: "2026-10-02", sets: 1 }]);
    expect(metrics.exercises).toHaveLength(1);
    // The far-out row must not leak into the record's history either.
    expect(metrics.exercises[0].bestKg).toBe(80);
    expect(metrics.exercises[0].prevBestKg).toBe(0);
  });
});

/**
 * The Lift screen's "recent exercises" + "Last:" cue used to be built in the client
 * from every set of the last four months.
 */
describe("getLiftSummary", () => {
  function summaryClient(
    options: { names?: { exerciseName: string }[]; last?: unknown[]; sets?: unknown[] } = {},
  ) {
    const groupBy = vi.fn().mockResolvedValue(options.names ?? []);
    // 1st findMany = the "last:" cue rows, 2nd = every set of that session.
    const findMany = vi
      .fn()
      .mockResolvedValueOnce(options.last ?? [])
      .mockResolvedValueOnce(options.sets ?? []);
    return { liftLog: { groupBy, findMany } };
  }

  it("returns the newest-used names and each one's last session", async () => {
    const mock = summaryClient({
      names: [{ exerciseName: "Bench Press" }, { exerciseName: "Squat" }],
      last: [record({ id: "last-1", exerciseName: "Bench Press" })],
    });

    const summary = await getLiftSummary(userId, { days: 120, before: "2026-10-08" }, mock as never);

    expect(summary.names).toEqual(["Bench Press", "Squat"]);
    expect(summary.lastByExercise).toEqual([
      record({ id: "last-1", exerciseName: "Bench Press" }),
    ]);

    const groupArgs = mock.liftLog.groupBy.mock.calls[0][0];
    expect(groupArgs.take).toBe(12);
    expect(groupArgs.orderBy).toEqual({ _max: { createdAt: "desc" } });
    // The window ends on the athlete's date and is inclusive of it.
    expect(groupArgs.where.date.gte).toEqual(new Date("2026-06-10T00:00:00Z"));
    expect(groupArgs.where.date.lte).toEqual(new Date("2026-10-08T00:00:00Z"));

    // "Last" means strictly before that date, one row per exercise, heaviest first.
    const lastArgs = mock.liftLog.findMany.mock.calls[0][0];
    expect(lastArgs.where.date).toEqual({ lt: new Date("2026-10-08T00:00:00Z") });
    expect(lastArgs.distinct).toEqual(["exerciseName"]);
    expect(lastArgs.orderBy).toEqual([{ date: "desc" }, { weightKg: "desc" }]);
  });

  it("returns each exercise's previous session sets in logged order", async () => {
    const bench = (date: string, kg: number, reps: number, createdAt: string) =>
      record({
        id: `${date}-${kg}-${reps}`,
        exerciseName: "Bench Press",
        date: new Date(date),
        weightKg: new Prisma.Decimal(kg),
        reps,
        createdAt: new Date(createdAt),
      });
    const mock = summaryClient({
      names: [{ exerciseName: "Bench Press" }],
      last: [record({ id: "last", exerciseName: "Bench Press" })],
      sets: [
        bench("2026-10-05", 70, 5, "2026-10-05T10:00:00Z"), // older session - excluded
        bench("2026-10-06", 60, 8, "2026-10-06T09:00:00Z"),
        bench("2026-10-06", 62.5, 8, "2026-10-06T09:05:00Z"),
        bench("2026-10-06", 65, 6, "2026-10-06T09:10:00Z"),
      ],
    });

    const summary = await getLiftSummary(userId, { days: 120, before: "2026-10-08" }, mock as never);

    expect(summary.lastSetsByExercise["Bench Press"]).toEqual({
      date: "2026-10-06",
      sets: [
        { weight_kg: 60, reps: 8 },
        { weight_kg: 62.5, reps: 8 },
        { weight_kg: 65, reps: 6 },
      ],
    });

    // Bounded to the same window as the "last" cue and ordered oldest-first.
    const setsArgs = mock.liftLog.findMany.mock.calls[1][0];
    expect(setsArgs.where.date).toEqual({
      gte: new Date("2026-06-10T00:00:00Z"),
      lt: new Date("2026-10-08T00:00:00Z"),
    });
    expect(setsArgs.orderBy).toEqual([{ date: "asc" }, { createdAt: "asc" }]);
  });

  it("caps a session's set list so the payload stays bounded", async () => {
    const sets = Array.from({ length: 25 }, (_, i) =>
      record({
        id: `set-${i}`,
        exerciseName: "Squat",
        date: new Date("2026-10-06"),
        weightKg: new Prisma.Decimal(100),
        reps: 5,
        createdAt: new Date(`2026-10-06T09:${String(i).padStart(2, "0")}:00Z`),
      }),
    );
    const mock = summaryClient({
      names: [{ exerciseName: "Squat" }],
      last: [record({ id: "last", exerciseName: "Squat" })],
      sets,
    });

    const summary = await getLiftSummary(userId, { days: 120, before: "2026-10-08" }, mock as never);

    expect(summary.lastSetsByExercise["Squat"].sets).toHaveLength(20);
  });

  it("skips the last-session query when nothing was logged in the window", async () => {
    const mock = summaryClient({ names: [] });

    const summary = await getLiftSummary(userId, { days: 120, before: "2026-10-08" }, mock as never);

    expect(summary).toEqual({ names: [], lastByExercise: [], lastSetsByExercise: {} });
    expect(mock.liftLog.findMany).not.toHaveBeenCalled();
  });

  it("clamps an absurd window", async () => {
    const mock = summaryClient();

    await getLiftSummary(userId, { days: 99999, before: "2026-10-08" }, mock as never);

    const groupArgs = mock.liftLog.groupBy.mock.calls[0][0];
    expect(groupArgs.where.date.gte).toEqual(new Date("2024-10-08T00:00:00Z"));
  });
});

describe("liftLogSchema", () => {
  it("accepts omitted and valid client request IDs", () => {
    expect(liftLogSchema.safeParse(input({ id: undefined })).success).toBe(true);
    expect(liftLogSchema.safeParse(input()).success).toBe(true);
  });

  it("rejects malformed client request IDs", () => {
    expect(liftLogSchema.safeParse(input({ id: "not-a-uuid" })).success).toBe(false);
  });
});

describe("createLiftLogIdempotent", () => {
  it("creates a new row with the client request ID", async () => {
    const mock = client();
    const result = await createLiftLogIdempotent(userId, input(), mock as never);

    expect(result.created).toBe(true);
    expect(mock.liftLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: requestId, userId }) }),
    );
  });

  it("returns an exact same-user replay without creating", async () => {
    const mock = client({ existing: record() });
    const result = await createLiftLogIdempotent(userId, input(), mock as never);

    expect(result).toEqual({ log: record(), created: false });
    expect(mock.liftLog.create).not.toHaveBeenCalled();
  });

  it("allows identical sets when request IDs differ", async () => {
    const firstId = "44444444-4444-4444-8444-444444444444";
    const secondId = "55555555-5555-4555-8555-555555555555";
    const mock = client();
    mock.liftLog.create
      .mockResolvedValueOnce(record({ id: firstId }))
      .mockResolvedValueOnce(record({ id: secondId }));

    await createLiftLogIdempotent(userId, input({ id: firstId }), mock as never);
    await createLiftLogIdempotent(userId, input({ id: secondId }), mock as never);

    expect(mock.liftLog.create).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["another owner", { userId: otherUserId }, {}],
    ["different weight", {}, { weight_kg: 61 }],
    ["different reps", {}, { reps: 9 }],
    ["different exercise", {}, { exercise_name: "Incline Press" }],
    ["different date", {}, { date: "2026-10-09" }],
  ])("rejects the same ID with %s", async (_label, recordPatch, inputPatch) => {
    const mock = client({ existing: record(recordPatch) });
    await expect(
      createLiftLogIdempotent(userId, input(inputPatch), mock as never),
    ).rejects.toSatisfy(expectConflict);
  });

  it("recovers an exact replay after a concurrent unique collision", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.0.0",
    });
    const mock = client({ createError: duplicate });
    mock.liftLog.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(record());

    const result = await createLiftLogIdempotent(userId, input(), mock as never);

    expect(result.created).toBe(false);
    expect(result.log.id).toBe(requestId);
  });

  it("keeps plan-day validation scoped to the authenticated user", async () => {
    const mock = client();
    mock.planDay.findFirst.mockResolvedValue(null);

    await expect(
      createLiftLogIdempotent(
        userId,
        input({ plan_day_id: "66666666-6666-4666-8666-666666666666" }),
        mock as never,
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });
});

describe("serializeLiftLog", () => {
  it("returns JSON numeric weights", () => {
    expect(serializeLiftLog(record())).toEqual({
      id: requestId,
      date: "2026-10-08",
      exercise_name: "Barbell Press",
      weight_kg: 60,
      reps: 8,
      plan_day_id: null,
    });
  });
});

describe("liftLogUpdateSchema", () => {
  it("accepts a positive weight and reps", () => {
    expect(liftLogUpdateSchema.safeParse({ weight_kg: 62.5, reps: 8 }).success).toBe(true);
  });

  it("rejects non-positive or missing values", () => {
    expect(liftLogUpdateSchema.safeParse({ weight_kg: 0, reps: 8 }).success).toBe(false);
    expect(liftLogUpdateSchema.safeParse({ weight_kg: 60 }).success).toBe(false);
  });
});

describe("updateLiftLog", () => {
  it("updates an owned set and returns the fresh row", async () => {
    const mock = client();
    mock.liftLog.updateMany.mockResolvedValue({ count: 1 });
    mock.liftLog.findUnique.mockResolvedValue(record({ weightKg: new Prisma.Decimal(62.5) }));

    const result = await updateLiftLog(
      userId,
      requestId,
      { weight_kg: 62.5, reps: 8 },
      mock as never,
    );

    expect(mock.liftLog.updateMany).toHaveBeenCalledWith({
      where: { id: requestId, userId },
      data: { weightKg: 62.5, reps: 8 },
    });
    expect(result?.weightKg.toString()).toBe("62.5");
  });

  it("returns null when the set isn't the caller's", async () => {
    const mock = client();
    mock.liftLog.updateMany.mockResolvedValue({ count: 0 });

    expect(
      await updateLiftLog(userId, requestId, { weight_kg: 62.5, reps: 8 }, mock as never),
    ).toBeNull();
  });
});
