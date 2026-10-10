import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../src/middleware/errorHandler";
import {
  createLiftLogIdempotent,
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
