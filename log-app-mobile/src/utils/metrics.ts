import type { ExerciseMetrics } from "../api/types";
import { addDays, currentWeekDays, dayNumber, parseIso, startOfWeek, todayLocal, weekdayShort } from "./date";
import {
  muscleGroupFor,
  type MuscleSlice,
  type PersonalRecord,
  type TopExercise,
  type VolumeBar,
  type WeekDayInfo,
} from "./derive";

/**
 * The Insights screen's maths, over the server's per-exercise rollups instead of raw
 * sets. The muscle names still come from the same table the rest of the app uses, so
 * the rules live in one place — only the row fetching moved server-side.
 */

export function muscleBreakdownFrom(exercises: ExerciseMetrics[]): MuscleSlice[] {
  const counts = new Map<string, number>();
  for (const e of exercises) {
    const muscle = muscleGroupFor(e.name);
    counts.set(muscle, (counts.get(muscle) ?? 0) + e.sets);
  }
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;
  return Array.from(counts.entries())
    .map(([muscle, sets]) => ({ muscle, sets, pct: Math.round((sets / total) * 100) }))
    .sort((a, b) => b.sets - a.sets);
}

export function topExercisesFrom(exercises: ExerciseMetrics[], limit = 5): TopExercise[] {
  return [...exercises]
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit)
    .map((e) => ({ exercise: e.name, volume: e.volume, sets: e.sets }));
}

export function personalRecordsFrom(
  exercises: ExerciseMetrics[],
  from: string = todayLocal(),
): PersonalRecord[] {
  const cutoff = addDays(from, -7);
  return exercises
    .filter((e) => e.best_kg > 0)
    .map((e) => ({
      exercise: e.name,
      weight_kg: e.best_kg,
      reps: e.best_reps,
      delta: e.prev_best_kg > 0 ? e.best_kg - e.prev_best_kg : null,
      isNew: e.best_date >= cutoff,
    }))
    .sort((a, b) => b.weight_kg - a.weight_kg)
    .slice(0, 6);
}

/** Average % change in top-set weight over the range, vs the window before it. */
export function strengthChangePctFrom(exercises: ExerciseMetrics[]): number | null {
  const deltas: number[] = [];
  for (const e of exercises) {
    if (e.current_top_kg > 0 && e.previous_top_kg > 0) {
      deltas.push(((e.current_top_kg - e.previous_top_kg) / e.previous_top_kg) * 100);
    }
  }
  if (deltas.length === 0) return null;
  return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
}

export function workoutStreakFromDates(
  trainedDates: Iterable<string>,
  from: string = todayLocal(),
  restDays: number[] = [],
): number {
  const trained = new Set(trainedDates);
  const rest = new Set(restDays);

  let streak = 0;
  // Today isn't over — an untrained today never breaks the streak.
  let cursor = trained.has(from) ? from : addDays(from, -1);

  for (;;) {
    if (trained.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
      continue;
    }
    if (rest.has(parseIso(cursor).getUTCDay())) {
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }
  return streak;
}

export function currentWeekInfoFromDates(
  trainedDates: Iterable<string>,
  restDays: number[] = [],
  from: string = todayLocal(),
): WeekDayInfo[] {
  const trained = new Set(trainedDates);
  const rest = new Set(restDays);
  return currentWeekDays(from).map((iso) => ({
    iso,
    trained: trained.has(iso),
    rest: rest.has(parseIso(iso).getUTCDay()),
  }));
}

export function workoutsThisWeekFrom(dates: Iterable<string>, from: string = todayLocal()): number {
  const start = startOfWeek(from);
  return Array.from(dates).filter((d) => d >= start).length;
}

/** Sets per day (oldest first) from the server's per-day counts. */
export function dailySetSeries(
  counts: Map<string, number>,
  days = 7,
  from: string = todayLocal(),
): VolumeBar[] {
  const out: VolumeBar[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = addDays(from, -i);
    out.push({ iso, label: weekdayShort(iso), value: counts.get(iso) ?? 0 });
  }
  return out;
}

/** Sets per week (oldest first) — for ranges where daily bars would be unreadable. */
export function weeklySetSeries(
  counts: Map<string, number>,
  weeks = 13,
  from: string = todayLocal(),
): VolumeBar[] {
  const out: VolumeBar[] = [];
  const start = addDays(from, -(weeks * 7 - 1));
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(start, w * 7);
    let sum = 0;
    for (let d = 0; d < 7; d++) sum += counts.get(addDays(weekStart, d)) ?? 0;
    out.push({ iso: weekStart, label: String(dayNumber(weekStart)), value: sum });
  }
  return out;
}
