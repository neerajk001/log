import type { PlanDay } from '@prisma/client';

export type ResolvedDay = {
  id: string;
  dayName: string;
  dayOrder: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDayUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Pure day-rotation resolver (no I/O).
 *
 *   dayOrder = (whole days since the plan start date) mod (number of plan days) + 1
 *
 * Before the plan start date, the first day (day_order = 1) applies.
 * `planDays` must be ordered by `dayOrder` (1-based). Returns the resolved
 * day, or null if the plan has no days.
 */
export function resolvePlanDay(
  planCreatedAt: Date,
  planDays: Pick<PlanDay, 'id' | 'dayName' | 'dayOrder'>[],
  targetDate: Date,
): ResolvedDay | null {
  if (planDays.length === 0) return null;

  const ordered = [...planDays].sort((a, b) => a.dayOrder - b.dayOrder);
  const first = ordered[0];

  const diffDays = Math.floor(
    (startOfDayUTC(targetDate) - startOfDayUTC(planCreatedAt)) / MS_PER_DAY,
  );

  if (diffDays < 0) {
    return { id: first.id, dayName: first.dayName, dayOrder: first.dayOrder };
  }

  const idx = diffDays % ordered.length;
  const day = ordered[idx];
  return { id: day.id, dayName: day.dayName, dayOrder: day.dayOrder };
}
