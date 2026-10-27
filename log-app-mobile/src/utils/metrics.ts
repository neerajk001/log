import type { ExerciseMetrics } from "../api/types";
import { addDays, startOfWeek, todayLocal } from "./date";
import type { PersonalRecord } from "./derive";

/**
 * The Insights screen's maths, over the server's per-exercise rollups instead of raw
 * sets.
 */

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

export function workoutsThisWeekFrom(dates: Iterable<string>, from: string = todayLocal()): number {
  const start = startOfWeek(from);
  return Array.from(dates).filter((d) => d >= start).length;
}
