import { prisma } from '@/lib/db/client';

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export type CreateActivityInput = {
  date: string;
  activity_type: 'run' | 'cycle' | 'walk' | 'swim' | 'other';
  name: string;
  duration_min: number;
  distance_km?: number | null;
  calories_burned?: number | null;
  notes?: string | null;
};

export async function createActivityLog(userId: string, input: CreateActivityInput) {
  return prisma.activityLog.create({
    data: {
      userId,
      date: parseDate(input.date),
      activityType: input.activity_type,
      name: input.name,
      durationMin: input.duration_min,
      distanceKm: input.distance_km ?? null,
      caloriesBurned: input.calories_burned ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function getActivityLogs(userId: string, from: string, to: string) {
  return prisma.activityLog.findMany({
    where: { userId, date: { gte: parseDate(from), lte: parseDate(to) } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function deleteActivityLog(userId: string, id: string) {
  return prisma.activityLog.deleteMany({ where: { userId, id } });
}
