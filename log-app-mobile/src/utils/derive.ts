import type { LiftLog } from "../api/types";
import { addDays, startOfWeek, todayLocal } from "./date";

/** Total tonnage for a single logged set. Bodyweight sets carry no load. */
export function volumeOf(log: LiftLog): number {
  return log.weight_kg == null ? 0 : Number(log.weight_kg) * Number(log.reps);
}

export function totalVolume(logs: LiftLog[]): number {
  return logs.reduce((sum, l) => sum + volumeOf(l), 0);
}

export function uniqueWorkoutDates(logs: LiftLog[]): string[] {
  return Array.from(new Set(logs.map((l) => l.date))).sort((a, b) => (a < b ? 1 : -1));
}

export interface VolumeBar {
  iso: string;
  label: string;
  value: number;
}

export interface PersonalRecord {
  exercise: string;
  weight_kg: number;
  reps: number;
  /** Improvement over the previous best (kg). Null when it's the first record. */
  delta: number | null;
  /** True when the record was set within the last 7 days. */
  isNew: boolean;
}

const MUSCLE_RULES: { pattern: RegExp; muscle: string }[] = [
  { pattern: /tricep|pushdown|skull|dip/i, muscle: "Triceps" },
  { pattern: /bicep|curl/i, muscle: "Biceps" },
  { pattern: /calf|calves/i, muscle: "Calves" },
  { pattern: /hamstring|romanian|rdl|leg curl|good morning/i, muscle: "Hamstrings" },
  { pattern: /glute|hip thrust|kickback/i, muscle: "Glutes" },
  { pattern: /quad|squat|lunge|leg press|leg extension|step[- ]?up/i, muscle: "Quads" },
  { pattern: /shoulder|overhead|lateral raise|delt|arnold|upright row/i, muscle: "Shoulders" },
  { pattern: /chest|bench|fly|flye|pec|push[- ]?up|dip/i, muscle: "Chest" },
  { pattern: /lat|pulldown|pull[- ]?down|pull[- ]?up|chin|row|deadlift|back|shrug/i, muscle: "Back" },
  { pattern: /ab|core|crunch|plank|sit[- ]?up|leg raise/i, muscle: "Core" },
];

/** Best-effort muscle classification from an exercise name (mirrors the
 *  day-name inference the Next.js app already uses). */
export function muscleGroupFor(exerciseName: string): string {
  for (const { pattern, muscle } of MUSCLE_RULES) {
    if (pattern.test(exerciseName)) return muscle;
  }
  return "Other";
}

export function exerciseTypeFor(exerciseName: string): "Compound" | "Isolation" {
  if (/press|squat|deadlift|row|pull[- ]?up|chin|dip|pulldown|clean|snatch|lunge|thrust/i.test(exerciseName)) {
    return "Compound";
  }
  return "Isolation";
}

/** The set of muscle groups implied by a day's exercises (falls back to the
 *  day name when there are no exercises yet). */
export function muscleGroupsForDay(dayName: string, exerciseNames: string[]): string[] {
  const fromExercises = exerciseNames.map(muscleGroupFor).filter((m) => m !== "Other");
  const source = fromExercises.length > 0 ? fromExercises : [muscleGroupFor(dayName)];
  const seen: string[] = [];
  for (const m of source) {
    if (m !== "Other" && !seen.includes(m)) seen.push(m);
  }
  return seen;
}

/**
 * Average % change in top-set weight vs the previous week (ISO weeks). The
 * range-based Strength tile uses `strengthChangePctFrom` over the server's
 * rollups instead; History uses this week-over-week version.
 */
export function strengthChangePct(logs: LiftLog[], from: string = todayLocal()): number | null {
  const thisStart = startOfWeek(from);
  const lastStart = addDays(thisStart, -7);

  const top = (start: string, end: string) => {
    const map = new Map<string, number>();
    for (const l of logs) {
      if (l.date < start || l.date >= end) continue;
      if (l.weight_kg == null) continue;
      const w = Number(l.weight_kg);
      map.set(l.exercise_name, Math.max(map.get(l.exercise_name) ?? 0, w));
    }
    return map;
  };

  const thisWeek = top(thisStart, addDays(thisStart, 7));
  const lastWeek = top(lastStart, thisStart);

  const deltas: number[] = [];
  for (const [exercise, w] of thisWeek) {
    const prev = lastWeek.get(exercise);
    if (prev && prev > 0) deltas.push(((w - prev) / prev) * 100);
  }
  if (deltas.length === 0) return null;
  return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
}

export interface DayGroup {
  date: string;
  logs: LiftLog[];
}

/** Lift logs grouped by date, newest first. */
export function groupByDate(logs: LiftLog[]): DayGroup[] {
  const map = new Map<string, LiftLog[]>();
  for (const l of logs) {
    const arr = map.get(l.date) ?? [];
    arr.push(l);
    map.set(l.date, arr);
  }
  return Array.from(map.entries())
    .map(([date, items]) => ({ date, logs: items }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function formatVolume(kg: number): string {
  return `${Math.round(kg).toLocaleString("en-US")} kg`;
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** "1h 05m" / "45m" from minutes. */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
