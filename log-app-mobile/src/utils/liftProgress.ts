import type {
  LiftProgressBestSet,
  LiftProgressExercise,
  LiftProgressMode,
  LiftProgressPoint,
} from "../api/types";
import { formatSetLoad } from "./bodyweight";
import { formatPlateSet } from "./plate";

export function progressModeLabel(mode: LiftProgressMode): string {
  return mode === "kg" ? "Weighted" : mode === "plate" ? "Machine stack" : "Bodyweight";
}

export function progressValueLabel(mode: LiftProgressMode): string {
  return mode === "kg" ? "Top set" : mode === "plate" ? "Top position" : "Best reps";
}

export function progressUnit(mode: LiftProgressMode): string {
  return mode === "kg" ? "kg" : mode === "plate" ? "pos" : "reps";
}

/** `60 kg × 8`, `Pos 8 · ~40 kg × 10`, or `BW × 12`. */
export function formatProgressSet(
  set: LiftProgressBestSet,
  mode: LiftProgressMode,
): string | null {
  if (set.reps <= 0 && set.weight_kg == null && set.plate_position == null) return null;
  if (mode === "plate" && set.plate_position != null) {
    return formatPlateSet(set, set.reps);
  }
  if (mode === "kg" && set.weight_kg != null) {
    return formatSetLoad(set.weight_kg, set.reps);
  }
  return formatSetLoad(null, set.reps);
}

export function formatProgressBest(exercise: LiftProgressExercise): string | null {
  return formatProgressSet(exercise.best_set, exercise.mode);
}

export function progressSparkValues(exercise: LiftProgressExercise): number[] {
  return exercise.points
    .map((point) => point.top_value)
    .filter((value): value is number => value != null);
}

export interface ProgressChange {
  text: string;
  tone: "positive" | "negative" | "neutral";
}

/** `+8.3%` for kg, `+2 pos` for stacks, `+3 reps` for bodyweight. */
export function progressChange(exercise: LiftProgressExercise): ProgressChange | null {
  if (exercise.change_value == null) return null;
  const value = exercise.change_value;
  const tone = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
  if (exercise.mode === "kg") {
    if (exercise.change_pct != null) {
      return {
        text: `${value > 0 ? "+" : ""}${exercise.change_pct}%`,
        tone,
      };
    }
    return { text: `${value > 0 ? "+" : ""}${value} kg`, tone };
  }
  if (exercise.mode === "plate") {
    return { text: `${value > 0 ? "+" : ""}${value} pos`, tone };
  }
  return { text: `${value > 0 ? "+" : ""}${value} reps`, tone };
}

/** Recent sessions, newest first, with the rows the detail screen shows. */
export function recentProgressPoints(
  exercise: LiftProgressExercise,
  limit = 8,
): LiftProgressPoint[] {
  return [...exercise.points].reverse().slice(0, limit);
}
