import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import { liftLogSchema } from "../validation/schemas";
import type { z } from "zod";

export type LiftLogInput = z.infer<typeof liftLogSchema>;

type LiftLogRecord = {
  id: string;
  userId: string;
  date: Date;
  exerciseName: string;
  weightKg: Prisma.Decimal;
  reps: number;
  planDayId: string | null;
};

type LiftLogClient = Pick<PrismaClient, "liftLog" | "planDay">;

const liftLogSelect = {
  id: true,
  userId: true,
  date: true,
  exerciseName: true,
  weightKg: true,
  reps: true,
  planDayId: true,
} satisfies Prisma.LiftLogSelect;

export function serializeLiftLog(log: Omit<LiftLogRecord, "userId"> | LiftLogRecord) {
  return {
    id: log.id,
    date: log.date.toISOString().slice(0, 10),
    exercise_name: log.exerciseName,
    weight_kg: Number(log.weightKg),
    reps: log.reps,
    plan_day_id: log.planDayId,
  };
}

function sameLiftRequest(log: LiftLogRecord, userId: string, input: LiftLogInput): boolean {
  return (
    log.userId === userId &&
    log.date.toISOString().slice(0, 10) === input.date &&
    log.exerciseName === input.exercise_name &&
    log.weightKg.equals(new Prisma.Decimal(input.weight_kg).toDecimalPlaces(2)) &&
    log.reps === input.reps &&
    log.planDayId === (input.plan_day_id ?? null)
  );
}

function idempotencyConflict(): AppError {
  return new AppError(409, "IDEMPOTENCY_CONFLICT", "Lift request ID was already used");
}

async function requireOwnedPlanDay(
  client: LiftLogClient,
  userId: string,
  planDayId: string | null | undefined,
): Promise<void> {
  if (!planDayId) return;
  const planDay = await client.planDay.findFirst({
    where: { id: planDayId, plan: { userId } },
    select: { id: true },
  });
  if (!planDay) throw new AppError(404, "NOT_FOUND", "Plan day not found");
}

async function findExisting(
  client: LiftLogClient,
  id: string,
): Promise<LiftLogRecord | null> {
  return client.liftLog.findUnique({ where: { id }, select: liftLogSelect });
}

export async function createLiftLogIdempotent(
  userId: string,
  input: LiftLogInput,
  client: LiftLogClient = prisma,
): Promise<{ log: LiftLogRecord; created: boolean }> {
  if (input.id) {
    const existing = await findExisting(client, input.id);
    if (existing) {
      if (!sameLiftRequest(existing, userId, input)) throw idempotencyConflict();
      return { log: existing, created: false };
    }
  }

  await requireOwnedPlanDay(client, userId, input.plan_day_id);

  try {
    const log = await client.liftLog.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        userId,
        date: new Date(input.date),
        exerciseName: input.exercise_name,
        weightKg: input.weight_kg,
        reps: input.reps,
        planDayId: input.plan_day_id ?? null,
      },
      select: liftLogSelect,
    });
    return { log, created: true };
  } catch (err) {
    if (
      input.id &&
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await findExisting(client, input.id);
      if (existing && sameLiftRequest(existing, userId, input)) {
        return { log: existing, created: false };
      }
      throw idempotencyConflict();
    }
    throw err;
  }
}

/** Update the weight/reps of one owned set. Returns null when not found. */
export async function updateLiftLog(
  userId: string,
  id: string,
  input: { weight_kg: number; reps: number },
  client: LiftLogClient = prisma,
): Promise<LiftLogRecord | null> {
  const result = await client.liftLog.updateMany({
    where: { id, userId },
    data: { weightKg: input.weight_kg, reps: input.reps },
  });
  if (result.count === 0) return null;
  return findExisting(client, id);
}
