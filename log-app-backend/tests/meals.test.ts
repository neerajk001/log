import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => {
  const tx = {
    mealLog: {
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
    dailyLog: { upsert: vi.fn(), updateMany: vi.fn() },
  };
  return {
    tx,
    findUniqueMeal: vi.fn(),
    findFirstMeal: vi.fn(),
    transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };
});

vi.mock("../src/db/client", () => ({
  prisma: {
    mealLog: {
      findUnique: mocks.findUniqueMeal,
      findFirst: mocks.findFirstMeal,
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    dailyLog: {
      findUnique: vi.fn(),
      upsert: mocks.tx.dailyLog.upsert,
      updateMany: mocks.tx.dailyLog.updateMany,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  applyDailyDelta,
  createMealIdempotent,
  deleteMeal,
  serializeMeal,
  updateMeal,
} from "../src/services/meals";
import { createMealSchema } from "../src/validation/schemas";

const userId = "user-1";
const requestId = "11111111-1111-4111-8111-111111111111";

type MealInputShape = Parameters<typeof createMealIdempotent>[1];
type MealRecordShape = Awaited<ReturnType<typeof createMealIdempotent>>["meal"];

function input(patch: Partial<MealInputShape> = {}): MealInputShape {
  return {
    id: requestId,
    date: "2026-10-10",
    title: "Breakfast",
    items: [{ name: "Roti", quantity: "2 medium", calories: 240, protein_g: 6 }],
    calories: 240,
    protein_g: 6,
    source: "ai",
    ...patch,
  };
}

function record(patch: Record<string, unknown> = {}): MealRecordShape & { userId: string } {
  return {
    id: requestId,
    userId,
    date: new Date("2026-10-10T00:00:00Z"),
    title: "Breakfast",
    items: [{ name: "Roti", quantity: "2 medium", calories: 240, protein_g: 6 }],
    calories: 240,
    proteinG: 6,
    source: "ai",
    ...patch,
  } as MealRecordShape & { userId: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(mocks.tx));
  mocks.tx.mealLog.create.mockResolvedValue(record());
  mocks.tx.mealLog.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.mealLog.deleteMany.mockResolvedValue({ count: 1 });
  mocks.tx.mealLog.findFirstOrThrow.mockResolvedValue(record());
  mocks.tx.dailyLog.upsert.mockResolvedValue({ id: "log-1" });
  mocks.tx.dailyLog.updateMany.mockResolvedValue({ count: 0 });
});

describe("createMealSchema", () => {
  const valid = {
    date: "2026-10-10",
    title: "Breakfast",
    items: [{ name: "Roti", quantity: "2 medium", calories: 240, protein_g: 6 }],
    calories: 240,
    protein_g: 6,
    source: "ai",
  };

  it("accepts a valid meal", () => {
    expect(createMealSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an optional client request id", () => {
    expect(createMealSchema.safeParse({ ...valid, id: requestId }).success).toBe(true);
    expect(createMealSchema.safeParse({ ...valid, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects an empty item list", () => {
    expect(createMealSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
  });

  it("rejects an unknown source", () => {
    expect(createMealSchema.safeParse({ ...valid, source: "guess" }).success).toBe(false);
  });
});

describe("applyDailyDelta", () => {
  function client() {
    const upsert = vi.fn().mockResolvedValue({ id: "log-1" });
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    return { dailyLog: { upsert, updateMany } };
  }

  it("increments the day's totals atomically instead of read-modify-writing", async () => {
    const mock = client();

    await applyDailyDelta(userId, "2026-10-10", { calories: 500, protein_g: 30 }, mock as never);

    expect(mock.dailyLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_date: { userId, date: new Date("2026-10-10") } },
        update: { calories: { increment: 500 }, proteinG: { increment: 30 } },
      }),
    );
    // A positive delta can never push the total below zero — no clamp needed.
    expect(mock.dailyLog.updateMany).not.toHaveBeenCalled();
  });

  it("starts from zero when the day has no log yet", async () => {
    const mock = client();

    await applyDailyDelta(userId, "2026-10-10", { calories: 500, protein_g: 30 }, mock as never);

    expect(mock.dailyLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ calories: 500, proteinG: 30 }),
      }),
    );
  });

  it("clamps a negative delta at zero after the atomic increment", async () => {
    const mock = client();

    await applyDailyDelta(userId, "2026-10-10", { calories: -500, protein_g: -30 }, mock as never);

    expect(mock.dailyLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { calories: { increment: -500 }, proteinG: { increment: -30 } },
      }),
    );
    expect(mock.dailyLog.updateMany).toHaveBeenCalledWith({
      where: { userId, date: new Date("2026-10-10"), calories: { lt: 0 } },
      data: { calories: 0 },
    });
    expect(mock.dailyLog.updateMany).toHaveBeenCalledWith({
      where: { userId, date: new Date("2026-10-10"), proteinG: { lt: 0 } },
      data: { proteinG: 0 },
    });
  });
});

describe("createMealIdempotent", () => {
  it("creates the meal and increments the day in one transaction", async () => {
    mocks.findUniqueMeal.mockResolvedValue(null);

    const result = await createMealIdempotent(userId, input());

    expect(result.created).toBe(true);
    expect(mocks.tx.mealLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: requestId, userId, calories: 240 }),
      }),
    );
    expect(mocks.tx.dailyLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { calories: { increment: 240 }, proteinG: { increment: 6 } },
      }),
    );
  });

  it("replays an exact same-user retry without creating a second row", async () => {
    mocks.findUniqueMeal.mockResolvedValue(record());

    const result = await createMealIdempotent(userId, input());

    expect(result.created).toBe(false);
    expect(result.meal.id).toBe(requestId);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.tx.mealLog.create).not.toHaveBeenCalled();
  });

  it("replays when the stored jsonb reordered the item keys", async () => {
    // PostgreSQL jsonb does not preserve key order, so the stored items come
    // back shuffled; a plain JSON.stringify comparison would 409 a real retry.
    mocks.findUniqueMeal.mockResolvedValue(
      record({ items: [{ protein_g: 6, quantity: "2 medium", calories: 240, name: "Roti" }] }),
    );

    const result = await createMealIdempotent(userId, input());

    expect(result.created).toBe(false);
    expect(result.meal.id).toBe(requestId);
  });

  it.each([
    ["another owner", { userId: "user-2" }, {}],
    ["different calories", {}, { calories: 300 }],
    ["different title", {}, { title: "Lunch" }],
    ["different items", {}, { items: [{ name: "Rice", calories: 200, protein_g: 4 }] }],
    ["different date", {}, { date: "2026-10-09" }],
  ])("rejects the same id with %s", async (_label, recordPatch, inputPatch) => {
    mocks.findUniqueMeal.mockResolvedValue(record(recordPatch));
    await expect(
      createMealIdempotent(userId, input(inputPatch as Partial<MealInputShape>)),
    ).rejects.toMatchObject({ statusCode: 409, code: "IDEMPOTENCY_CONFLICT" });
  });

  it("recovers an exact replay after a concurrent unique collision", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.0.0",
    });
    mocks.tx.mealLog.create.mockRejectedValueOnce(duplicate);
    mocks.findUniqueMeal.mockResolvedValueOnce(null).mockResolvedValueOnce(record());

    const result = await createMealIdempotent(userId, input());

    expect(result.created).toBe(false);
    expect(result.meal.id).toBe(requestId);
  });

  it("rejects a concurrent collision with a changed payload", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6.0.0",
    });
    mocks.tx.mealLog.create.mockRejectedValueOnce(duplicate);
    mocks.findUniqueMeal.mockResolvedValueOnce(null).mockResolvedValueOnce(record({ calories: 999 }));

    await expect(createMealIdempotent(userId, input())).rejects.toMatchObject({
      statusCode: 409,
      code: "IDEMPOTENCY_CONFLICT",
    });
  });
});

describe("updateMeal", () => {
  const edit = {
    title: "Breakfast",
    items: [{ name: "Roti", calories: 300, protein_g: 20 }],
    calories: 300,
    protein_g: 20,
    source: "ai" as const,
  };

  it("compare-and-swaps the owned row and applies only the delta", async () => {
    mocks.findFirstMeal.mockResolvedValue(record());
    mocks.tx.mealLog.findFirstOrThrow.mockResolvedValue(record({ calories: 300, proteinG: 20 }));

    const updated = await updateMeal(userId, requestId, edit);

    expect(updated?.calories).toBe(300);
    expect(mocks.tx.mealLog.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: requestId, userId, calories: 240, proteinG: 6 },
      }),
    );
    // 300 − 240 = +60 kcal; 20 − 6 = +14 g protein.
    expect(mocks.tx.dailyLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { calories: { increment: 60 }, proteinG: { increment: 14 } },
      }),
    );
  });

  it("refuses a stale edit instead of corrupting the day's totals", async () => {
    mocks.findFirstMeal.mockResolvedValue(record());
    mocks.tx.mealLog.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateMeal(userId, requestId, edit)).rejects.toMatchObject({
      statusCode: 409,
      code: "MEAL_CHANGED",
    });
    expect(mocks.tx.dailyLog.upsert).not.toHaveBeenCalled();
  });

  it("returns null for a meal the caller does not own", async () => {
    mocks.findFirstMeal.mockResolvedValue(null);
    expect(await updateMeal(userId, requestId, edit)).toBeNull();
  });
});

describe("deleteMeal", () => {
  it("removes the row and subtracts exactly its totals", async () => {
    mocks.findFirstMeal.mockResolvedValue(record());

    const ok = await deleteMeal(userId, requestId);

    expect(ok).toBe(true);
    expect(mocks.tx.mealLog.deleteMany).toHaveBeenCalledWith({
      where: { id: requestId, userId, calories: 240, proteinG: 6 },
    });
    expect(mocks.tx.dailyLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { calories: { increment: -240 }, proteinG: { increment: -6 } },
      }),
    );
    // The negative delta is clamped after the atomic subtraction.
    expect(mocks.tx.dailyLog.updateMany).toHaveBeenCalledWith({
      where: { userId, date: new Date("2026-10-10"), calories: { lt: 0 } },
      data: { calories: 0 },
    });
  });

  it("refuses a stale delete", async () => {
    mocks.findFirstMeal.mockResolvedValue(record());
    mocks.tx.mealLog.deleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteMeal(userId, requestId)).rejects.toMatchObject({
      statusCode: 409,
      code: "MEAL_CHANGED",
    });
    expect(mocks.tx.dailyLog.upsert).not.toHaveBeenCalled();
  });

  it("returns false for a meal the caller does not own", async () => {
    mocks.findFirstMeal.mockResolvedValue(null);
    expect(await deleteMeal(userId, requestId)).toBe(false);
  });
});

describe("serializeMeal", () => {
  it("formats a row for the API", () => {
    expect(
      serializeMeal({
        id: "m1",
        date: new Date("2026-10-10"),
        title: "Breakfast",
        items: [{ name: "Roti", calories: 240, protein_g: 6 }],
        calories: 240,
        proteinG: 6,
        source: "ai",
      }),
    ).toEqual({
      id: "m1",
      date: "2026-10-10",
      title: "Breakfast",
      items: [{ name: "Roti", calories: 240, protein_g: 6 }],
      calories: 240,
      protein_g: 6,
      source: "ai",
    });
  });
});
