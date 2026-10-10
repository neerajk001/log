import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db/client";
import type { z } from "zod";
import type { createMealSchema } from "../validation/schemas";

export interface MealItem {
  name: string;
  quantity?: string;
  calories: number;
  protein_g: number;
}

export type MealInput = z.infer<typeof createMealSchema>;
export type MealUpdateInput = Omit<MealInput, "date">;

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

/**
 * Adds `delta` to the day's calories/protein on `daily_logs`, clamped at 0 and
 * preserving weight/sleep. This keeps the weekly verdict and adherence (which
 * read `daily_logs.protein_g`) in sync with logged meals.
 */
export async function applyDailyDelta(
  userId: string,
  date: string,
  delta: { calories: number; protein_g: number },
  client: DailyLogClient = prisma,
): Promise<void> {
  const day = new Date(date);
  const existing = await client.dailyLog.findUnique({
    where: { userId_date: { userId, date: day } },
    select: { calories: true, proteinG: true },
  });
  const calories = Math.max(0, (existing?.calories ?? 0) + delta.calories);
  const proteinG = Math.max(0, (existing?.proteinG ?? 0) + delta.protein_g);

  await client.dailyLog.upsert({
    where: { userId_date: { userId, date: day } },
    create: { userId, date: day, calories, proteinG },
    update: { calories, proteinG },
    select: { id: true },
  });
}

export async function listMeals(userId: string, date: string): Promise<MealRecord[]> {
  return prisma.mealLog.findMany({
    where: { userId, date: new Date(date) },
    orderBy: { createdAt: "asc" },
    select: mealSelect,
  });
}

export async function createMeal(userId: string, input: MealInput): Promise<MealRecord> {
  return prisma.$transaction(async (tx) => {
    const meal = await tx.mealLog.create({
      data: {
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
    return meal;
  });
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
    const meal = await tx.mealLog.update({
      where: { id },
      data: {
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
      date,
      {
        calories: input.calories - existing.calories,
        protein_g: input.protein_g - existing.proteinG,
      },
      tx,
    );
    return meal;
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
    await tx.mealLog.delete({ where: { id } });
    await applyDailyDelta(
      userId,
      date,
      { calories: -existing.calories, protein_g: -existing.proteinG },
      tx,
    );
  });
  return true;
}
