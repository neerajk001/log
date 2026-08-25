export interface PlanDayLike {
  id: string;
  dayOrder: number;
}

function toUtcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function wholeDaysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Resolves which plan day applies on a given date.
 *
 * Rotation rule: `dayOrder = (whole days since the plan's start date) mod
 * (number of plan days) + 1`, where the start date is the calendar date the
 * plan was created/imported. `planDays` is expected to be sorted by
 * `dayOrder` ascending (1-based).
 */
export function resolvePlanDayForDate<T extends PlanDayLike>(
  startDate: Date,
  planDays: T[],
  date: Date,
): T | null {
  if (planDays.length === 0) return null;

  const daysSince = wholeDaysBetween(toUtcDateString(startDate), toUtcDateString(date));
  if (daysSince < 0) {
    return planDays[0];
  }

  const index = daysSince % planDays.length;
  return planDays[index];
}
