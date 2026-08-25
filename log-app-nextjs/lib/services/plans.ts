import { prisma } from '@/lib/db/client';
import { ApiError } from '@/lib/error';
import { resolvePlanDay } from '@/lib/services/planRotation';

export type PlanDayExercise = { name: string; sets: number; reps: string };

export type CreatePlanInput = {
  name: string;
  source: 'manual' | 'ai_parsed';
  days: { day_name: string; exercises: PlanDayExercise[] }[];
};

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function createPlan(userId: string, input: CreatePlanInput) {
  return prisma.$transaction(async (tx) => {
    await tx.workoutPlan.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    return tx.workoutPlan.create({
      data: {
        userId,
        name: input.name,
        source: input.source,
        isActive: true,
        planDays: {
          create: input.days.map((d, i) => ({
            dayName: d.day_name,
            dayOrder: i + 1,
            exercises: d.exercises as unknown as object,
          })),
        },
      },
      include: { planDays: true },
    });
  });
}

export async function listPlans(userId: string) {
  return prisma.workoutPlan.findMany({
    where: { userId },
    include: { planDays: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updatePlan(userId: string, id: string, input: CreatePlanInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.workoutPlan.findFirst({ where: { id, userId } });
    if (!existing) throw new ApiError('NOT_FOUND', 'Plan not found', 404);

    await tx.planDay.deleteMany({ where: { planId: id } });

    return tx.workoutPlan.update({
      where: { id },
      data: {
        name: input.name,
        source: input.source,
        planDays: {
          create: input.days.map((d, i) => ({
            dayName: d.day_name,
            dayOrder: i + 1,
            exercises: d.exercises as unknown as object,
          })),
        },
      },
      include: { planDays: true },
    });
  });
}

export async function getActivePlan(userId: string) {
  return prisma.workoutPlan.findFirst({
    where: { userId, isActive: true },
    include: { planDays: true },
  });
}

export type PlanTodayResult = {
  plan_id: string;
  plan_name: string;
  day: {
    id: string;
    day_name: string;
    day_order: number;
    exercises: {
      name: string;
      sets: number;
      reps: string;
      logged: boolean;
      last_log: { weight_kg: number; reps: number } | null;
    }[];
  } | null;
};

export async function getPlanToday(
  userId: string,
  planId: string,
  targetDate: Date,
): Promise<PlanTodayResult | null> {
  const plan = await prisma.workoutPlan.findFirst({
    where: { id: planId, userId },
    include: { planDays: true },
  });
  if (!plan) return null;

  const day = resolvePlanDay(
    plan.createdAt,
    plan.planDays.map((d) => ({ id: d.id, dayName: d.dayName, dayOrder: d.dayOrder })),
    targetDate,
  );

  if (!day) {
    return { plan_id: plan.id, plan_name: plan.name, day: null };
  }

  const planDay = plan.planDays.find((d) => d.id === day.id)!;
  const exercises = (planDay.exercises as unknown as PlanDayExercise[]) ?? [];

  const todayStart = startOfDayUTC(targetDate);
  const logs = await prisma.liftLog.findMany({
    where: { userId, date: todayStart, exerciseName: { in: exercises.map((e) => e.name) } },
    orderBy: { createdAt: 'desc' },
  });

  const byExercise = new Map<string, { weight_kg: number; reps: number }>();
  const loggedSet = new Set<string>();
  for (const log of logs) {
    loggedSet.add(log.exerciseName);
    if (!byExercise.has(log.exerciseName)) {
      byExercise.set(log.exerciseName, { weight_kg: Number(log.weightKg), reps: log.reps });
    }
  }

  return {
    plan_id: plan.id,
    plan_name: plan.name,
    day: {
      id: planDay.id,
      day_name: planDay.dayName,
      day_order: planDay.dayOrder,
      exercises: exercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        logged: loggedSet.has(e.name),
        last_log: byExercise.get(e.name) ?? null,
      })),
    },
  };
}
