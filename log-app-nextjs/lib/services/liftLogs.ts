import { prisma } from '@/lib/db/client';

export type LiftLogInput = {
  date: string;
  exercise_name: string;
  weight_kg: number;
  reps: number;
  plan_day_id?: string | null;
};

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export async function createLiftLog(userId: string, data: LiftLogInput) {
  return prisma.liftLog.create({
    data: {
      userId,
      date: parseDate(data.date),
      exerciseName: data.exercise_name,
      weightKg: data.weight_kg,
      reps: data.reps,
      planDayId: data.plan_day_id ?? null,
    },
  });
}

export async function getLiftHistory(
  userId: string,
  exercise: string,
  weeks: number = 4,
) {
  const since = new Date();
  since.setDate(since.getDate() - weeks * 7);
  return prisma.liftLog.findMany({
    where: {
      userId,
      exerciseName: exercise,
      date: { gte: since },
    },
    orderBy: { date: 'desc' },
  });
}

/** All of a user's lift logs within an optional inclusive date range (any exercise). */
export async function getLiftHistoryRange(
  userId: string,
  from?: string,
  to?: string,
) {
  return prisma.liftLog.findMany({
    where: {
      userId,
      date: {
        gte: from ? parseDate(from) : undefined,
        lte: to ? parseDate(to) : undefined,
      },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
}
