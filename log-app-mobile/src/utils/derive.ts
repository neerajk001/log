import type { LiftLog } from "../api/types";
import { addDays, currentWeekDays, dayNumber, startOfWeek, todayLocal, weekdayShort } from "./date";

/** Total tonnage for a single logged set. */
export function volumeOf(log: LiftLog): number {
  return Number(log.weight_kg) * Number(log.reps);
}

export function totalVolume(logs: LiftLog[]): number {
  return logs.reduce((sum, l) => sum + volumeOf(l), 0);
}

export function uniqueWorkoutDates(logs: LiftLog[]): string[] {
  return Array.from(new Set(logs.map((l) => l.date))).sort((a, b) => (a < b ? 1 : -1));
}

export interface TopExercise {
  exercise: string;
  volume: number;
  sets: number;
}

export function topExercises(logs: LiftLog[], limit = 5): TopExercise[] {
  const map = new Map<string, TopExercise>();
  for (const l of logs) {
    const cur = map.get(l.exercise_name) ?? { exercise: l.exercise_name, volume: 0, sets: 0 };
    cur.volume += volumeOf(l);
    cur.sets += 1;
    map.set(l.exercise_name, cur);
  }
  return Array.from(map.values())
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit);
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

export function personalRecords(logs: LiftLog[]): PersonalRecord[] {
  const byExercise = new Map<string, LiftLog[]>();
  for (const l of logs) {
    const arr = byExercise.get(l.exercise_name) ?? [];
    arr.push(l);
    byExercise.set(l.exercise_name, arr);
  }

  const cutoff = addDays(todayLocal(), -7);
  const records: PersonalRecord[] = [];

  for (const [exercise, sets] of byExercise) {
    const sorted = [...sets].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let best: LiftLog | null = null;
    let prevBest = 0;
    for (const s of sorted) {
      const w = Number(s.weight_kg);
      if (!best || w > Number(best.weight_kg)) {
        prevBest = best ? Number(best.weight_kg) : 0;
        best = s;
      }
    }
    if (!best) continue;
    records.push({
      exercise,
      weight_kg: Number(best.weight_kg),
      reps: best.reps,
      delta: prevBest > 0 ? Number(best.weight_kg) - prevBest : null,
      isNew: best.date >= cutoff,
    });
  }

  return records.sort((a, b) => b.weight_kg - a.weight_kg).slice(0, 6);
}

export interface MuscleSlice {
  muscle: string;
  sets: number;
  pct: number;
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

export function muscleBreakdown(logs: LiftLog[]): MuscleSlice[] {
  const counts = new Map<string, number>();
  for (const l of logs) {
    const m = muscleGroupFor(l.exercise_name);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0) || 1;
  return Array.from(counts.entries())
    .map(([muscle, sets]) => ({ muscle, sets, pct: Math.round((sets / total) * 100) }))
    .sort((a, b) => b.sets - a.sets);
}

export function workoutsThisWeek(logs: LiftLog[], from: string = todayLocal()): number {
  const start = startOfWeek(from);
  return uniqueWorkoutDates(logs).filter((d) => d >= start).length;
}

/** Consecutive days (ending today or yesterday) that have at least one lift. */
export function workoutStreak(logs: LiftLog[], from: string = todayLocal()): number {
  const dates = new Set(logs.map((l) => l.date));
  let streak = 0;
  let cursor = dates.has(from) ? from : addDays(from, -1);
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** 7 booleans (Mon..Sun) — whether each day of the current week has a lift. */
export function currentWeekDots(logs: LiftLog[], from: string = todayLocal()): boolean[] {
  const dates = new Set(logs.map((l) => l.date));
  return currentWeekDays(from).map((d) => dates.has(d));
}

export interface VolumeBar {
  iso: string;
  label: string;
  value: number;
}

/** Daily volume for the last `days` days (oldest first). */
export function dailyVolumeSeries(logs: LiftLog[], days = 7, from: string = todayLocal()): VolumeBar[] {
  const totals = new Map<string, number>();
  for (const l of logs) totals.set(l.date, (totals.get(l.date) ?? 0) + volumeOf(l));
  const out: VolumeBar[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const iso = addDays(from, -i);
    out.push({ iso, label: weekdayShort(iso), value: totals.get(iso) ?? 0 });
  }
  return out;
}

/** Weekly volume totals for the last `weeks` weeks (oldest first). Used for
 *  long ranges where daily bars would be unreadable. Label is the week-start
 *  day-of-month. */
export function weeklyVolumeSeries(logs: LiftLog[], weeks = 13, from: string = todayLocal()): VolumeBar[] {
  const totals = new Map<string, number>();
  for (const l of logs) totals.set(l.date, (totals.get(l.date) ?? 0) + volumeOf(l));
  const out: VolumeBar[] = [];
  const start = addDays(from, -(weeks * 7 - 1));
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(start, w * 7);
    let sum = 0;
    for (let d = 0; d < 7; d++) sum += totals.get(addDays(weekStart, d)) ?? 0;
    out.push({ iso: weekStart, label: String(dayNumber(weekStart)), value: sum });
  }
  return out;
}

/** Average % change in top-set weight vs the previous week. */
export function strengthChangePct(logs: LiftLog[], from: string = todayLocal()): number | null {
  const thisStart = startOfWeek(from);
  const lastStart = addDays(thisStart, -7);

  const top = (start: string, end: string) => {
    const map = new Map<string, number>();
    for (const l of logs) {
      if (l.date < start || l.date >= end) continue;
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
