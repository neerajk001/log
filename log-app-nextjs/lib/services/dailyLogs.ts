import { prisma } from '@/lib/db/client';

export type DailyLogInput = {
  weight_kg?: number;
  calories?: number;
  protein_g?: number;
  sleep_hours?: number;
};

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export async function upsertDailyLog(
  userId: string,
  date: string,
  data: DailyLogInput,
) {
  const d = parseDate(date);
  return prisma.dailyLog.upsert({
    where: { userId_date: { userId, date: d } },
    update: {
      weightKg: data.weight_kg,
      calories: data.calories,
      proteinG: data.protein_g,
      sleepHours: data.sleep_hours,
    },
    create: {
      userId,
      date: d,
      weightKg: data.weight_kg,
      calories: data.calories,
      proteinG: data.protein_g,
      sleepHours: data.sleep_hours,
    },
  });
}

export async function getDailyLog(userId: string, date: string) {
  return prisma.dailyLog.findUnique({
    where: { userId_date: { userId, date: parseDate(date) } },
  });
}

export async function getDailyLogsInRange(
  userId: string,
  from?: string,
  to?: string,
) {
  return prisma.dailyLog.findMany({
    where: {
      userId,
      date: {
        gte: from ? parseDate(from) : undefined,
        lte: to ? parseDate(to) : undefined,
      },
    },
    orderBy: { date: 'asc' },
  });
}

/** Previous day's log, used to pre-fill placeholders on the Today screen. */
export async function getPreviousDailyLog(userId: string, date: string) {
  const d = parseDate(date);
  return prisma.dailyLog.findFirst({
    where: { userId, date: { lt: d } },
    orderBy: { date: 'desc' },
  });
}
