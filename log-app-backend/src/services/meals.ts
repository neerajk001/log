import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import type { z } from "zod";
import type { createMealSchema } from "../validation/schemas";

export interface MealItem {
  name: string;
  quantity?: string;
  calories: number;
  protein_g: number;
}

export type MealInput = z.infer<typeof createMealSchema>;
export type MealUpdateInput = Omit<MealInput, "date" | "id">;

interface MealRecord {
  id: string;
  date: Date;
  title: string;
  items: Prisma.JsonValue;
  calories: number;
  proteinG: number;
  source: string;
}

type DailyLogClient = Pick<PrismaClient, "dailyLog">;

const mealSelect = {
  id: true,
  date: true,
  title: true,
  items: true,
  calories: true,
  proteinG: true,
  source: true,
} satisfies Prisma.MealLogSelect;

/** Lookup shape for idempotency checks — needs the owner to compare. */
const mealLookupSelect = {
  ...mealSelect,
  userId: true,
} satisfies Prisma.MealLogSelect;

export function serializeMeal(meal: MealRecord) {
  return {
    id: meal.id,
    date: meal.date.toISOString().slice(0, 10),
    title: meal.title,
    items: meal.items as unknown as MealItem[],
    calories: meal.calories,
    protein_g: meal.proteinG,
    source: meal.source,
  };
}

function sameMealRequest(
  existing: MealRecord & { userId: string },
  userId: string,
  input: MealInput,
): boolean {
  return (
    existing.userId === userId &&
    existing.date.toISOString().slice(0, 10) === input.date &&
    existing.title === input.title &&
    existing.calories === input.calories &&
    existing.proteinG === input.protein_g &&
    existing.source === input.source &&
    JSON.stringify(existing.items) === JSON.stringify(input.items)
  );
}

function idempotencyConflict(): AppError {
  return new AppError(409, "IDEMPOTENCY_CONFLICT", "Meal request ID was already used");
}

/**
 * Adds `delta` to the day's calories/protein on `daily_logs`, clamped at 0 and
 * preserving weight/sleep. This keeps the weekly verdict and adherence (which
 * read `daily_logs.protein_g`) in sync with logged meals.
 *
 * The write is a single atomic increment — not find-then-write — so two meals
 * logged at the same time (two devices, two fast requests) can't read the same
 * starting total and overwrite each other's delta, which would leave meal rows
 * the day's totals never count.
 */
export async function applyDailyDelta(
  userId: string,
  date: string,
  delta: { calories: number; protein_g: number },
  client: DailyLogClient = prisma,
): Promise<void> {
  const day = new Date(date);

  await client.dailyLog.upsert({
    where: { userId_date: { userId, date: day } },
    create: {
      userId,
      date: day,
      calories: Math.max(0, delta.calories),
      proteinG: Math.max(0, delta.protein_g),
    },
    update: {
      calories: { increment: delta.calories },
      proteinG: { increment: delta.protein_g },
    },
    select: { id: true },
  });

  // Clamp at zero (e.g. a meal removed after the athlete typed a lower day
  // total). Conditional, per-field atomic statements — a concurrent positive
  // increment can never be lost the way it could with a read-modify-write.
  if (delta.calories < 0) {
    await client.dailyLog.updateMany({
      where: { userId, date: day, calories: { lt: 0 } },
      data: { calories: 0 },
    });
  }
  if (delta.protein_g < 0) {
    await client.dailyLog.updateMany({
      where: { userId, date: day, proteinG: { lt: 0 } },
      data: { proteinG: 0 },
    });
  }
}

export async function listMeals(userId: string, date: string): Promise<MealRecord[]> {
  return prisma.mealLog.findMany({
    where: { userId, date: new Date(date) },
    orderBy: { createdAt: "asc" },
    select: mealSelect,
  });
}

/**
 * Creates a meal and rolls its macros into the day's totals in one transaction.
 * With a client-supplied `id`, retrying the same request replays the existing
 * row instead of duplicating it (the response can be lost after the write
 * succeeded), and reusing the id for a changed payload is a 409 — the same
 * contract as lift logging. The day-total increment is atomic, so concurrent
 * meal writes can't overwrite each other's delta.
 */
export async function createMealIdempotent(
  userId: string,
  input: MealInput,
): Promise<{ meal: MealRecord; created: boolean }> {
  if (input.id) {
    const existing = await prisma.mealLog.findUnique({
      where: { id: input.id },
      select: mealLookupSelect,
    });
    if (existing) {
      if (!sameMealRequest(existing, userId, input)) throw idempotencyConflict();
      return { meal: existing, created: false };
    }
  }

  try {
    const meal = await prisma.$transaction(async (tx) => {
      const created = await tx.mealLog.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          userId,
          date: new Date(input.date),
          title: input.title,
          items: input.items as unknown as Prisma.InputJsonValue,
          calories: input.calories,
          proteinG: input.protein_g,
          source: input.source,
        },
        select: mealSelect,
      });
      await applyDailyDelta(
        userId,
        input.date,
        { calories: input.calories, protein_g: input.protein_g },
        tx,
      );
      return created;
    });
    return { meal, created: true };
  } catch (err) {
    // Concurrent replay: two requests with the same id raced past the pre-check;
    // the loser resolves to the winner's row when the payload matches.
    if (
      input.id &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.mealLog.findUnique({
        where: { id: input.id },
        select: mealLookupSelect,
      });
      if (existing && sameMealRequest(existing, userId, input)) {
        return { meal: existing, created: false };
      }
      throw idempotencyConflict();
    }
    throw err;
  }
}

export async function updateMeal(
  userId: string,
  id: string,
  input: MealUpdateInput,
): Promise<MealRecord | null> {
  const existing = await prisma.mealLog.findFirst({
    where: { id, userId },
    select: mealSelect,
  });
  if (!existing) return null;

  const date = existing.date.toISOString().slice(0, 10);
  return prisma.$transaction(async (tx) => {
    // Compare-and-swap on the totals that anchor the ledger delta: if another
    // device changed this meal between the read and the write, the stale delta
    // would corrupt the day. Refuse instead of guessing.
    const swapped = await tx.mealLog.updateMany({
      where: { id, userId, calories: existing.calories, proteinG: existing.proteinG },
      data: {
        title: input.title,
        items: input.items as unknown as Prisma.InputJsonValue,
        calories: input.calories,
        proteinG: input.protein_g,
        source: input.source,
      },
    });
    if (swapped.count === 0) {
      throw new AppError(
        409,
        "MEAL_CHANGED",
        "That meal changed while you were editing it. Reopen it and try again.",
      );
    }
    await applyDailyDelta(
      userId,
      date,
      {
        calories: input.calories - existing.calories,
        protein_g: input.protein_g - existing.proteinG,
      },
      tx,
    );
    return tx.mealLog.findFirstOrThrow({ where: { id }, select: mealSelect });
  });
}

/** Deletes an owned meal and removes its contribution from the day's totals. */
export async function deleteMeal(userId: string, id: string): Promise<boolean> {
  const existing = await prisma.mealLog.findFirst({
    where: { id, userId },
    select: mealSelect,
  });
  if (!existing) return false;

  const date = existing.date.toISOString().slice(0, 10);
  await prisma.$transaction(async (tx) => {
    // Same compare-and-swap as updateMeal: only subtract the totals we read.
    const removed = await tx.mealLog.deleteMany({
      where: { id, userId, calories: existing.calories, proteinG: existing.proteinG },
    });
    if (removed.count === 0) {
      throw new AppError(
        409,
        "MEAL_CHANGED",
        "That meal changed before it could be removed. Reopen it and try again.",
      );
    }
    await applyDailyDelta(
      userId,
      date,
      { calories: -existing.calories, protein_g: -existing.proteinG },
      tx,
    );
  });
  return true;
}
