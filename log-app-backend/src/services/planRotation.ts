export interface PlanDayLike {
  id: string;
  dayOrder: number;
}

/** A plan day plus the exercise names prescribed for it. */
export interface PlanDayWithExercises extends PlanDayLike {
  exerciseNames: string[];
}

/** One set logged on a date, as far as trained-day inference is concerned. */
export interface LoggedSetLike {
  exerciseName: string;
  planDayId: string | null;
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
  const sorted = [...planDays].sort((a, b) => a.dayOrder - b.dayOrder);

  const daysSince = wholeDaysBetween(toUtcDateString(startDate), toUtcDateString(date));
  if (daysSince < 0) {
    return sorted[0];
  }

  const index = daysSince % sorted.length;
  return sorted[index];
}

function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The plan day the athlete actually trained on a date, inferred from the sets
 * logged that date.
 *
 * The rotation above is pure calendar maths, so a day the athlete swaps
 * mid-session — training Legs on a day the plan calls Push — would otherwise
 * keep showing Push. A set logged from a plan exercise carries its
 * `plan_day_id`, which is the strongest signal; free-typed quick logs fall back
 * to matching exercise names. Returns null when nothing logged points at a plan
 * day, so the caller keeps the rotated day.
 */
export function resolveTrainedPlanDay<T extends PlanDayWithExercises>(
  planDays: T[],
  loggedSets: LoggedSetLike[],
): T | null {
  if (planDays.length === 0 || loggedSets.length === 0) return null;
  const sorted = [...planDays].sort((a, b) => a.dayOrder - b.dayOrder);

  const attributed = new Map<string, number>();
  for (const set of loggedSets) {
    if (!set.planDayId) continue;
    attributed.set(set.planDayId, (attributed.get(set.planDayId) ?? 0) + 1);
  }

  let best: T | null = null;
  let bestScore = 0;

  // An explicitly attributed set is more trustworthy than a name that happens to
  // match, so name matching is only consulted when nothing carries a plan day.
  for (const day of sorted) {
    const score = attributed.get(day.id) ?? 0;
    if (score > bestScore) {
      best = day;
      bestScore = score;
    }
  }
  if (best) return best;

  for (const day of sorted) {
    const owned = new Set(day.exerciseNames.map(normalizeExerciseName));
    const score = loggedSets.filter((set) => owned.has(normalizeExerciseName(set.exerciseName))).length;
    if (score > bestScore) {
      best = day;
      bestScore = score;
    }
  }
  return best;
}
