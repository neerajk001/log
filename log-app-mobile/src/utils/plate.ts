import type { LiftSetLoad, PlateConfig, PlateUnit } from "../api/types";
import { formatSetLoad } from "./bodyweight";

/** How the plan wants an exercise loaded. Absent means free weights. */
export function isPlateMode(exercise: {
  load_mode?: "weight" | "plate" | null;
}): boolean {
  return exercise.load_mode === "plate";
}

/** Estimated load for a stack position; null when the plan has no calibration. */
export function estimatedPlateLoad(
  position: number | null | undefined,
  config: Pick<PlateConfig, "increment"> | null | undefined,
): number | null {
  if (position == null || !config || config.increment <= 0) return null;
  return Math.round(position * config.increment * 100) / 100;
}

/** `Pos 8` or `Pos 8 · ~40 kg`, without reps. */
export function formatPlateLoad(
  position: number,
  config?: Pick<PlateConfig, "increment" | "unit"> | null,
): string {
  const estimate = estimatedPlateLoad(position, config ?? null);
  return estimate == null ? `Pos ${position}` : `Pos ${position} · ~${estimate} ${config!.unit}`;
}

/** `Pos 8 · ~40 kg × 10` — one line for a logged plate set. */
export function formatPlateSet(
  set: {
    plate_position?: number | null;
    plate_increment?: number | null;
    plate_unit?: PlateUnit | null;
  },
  reps: number,
): string {
  if (set.plate_position == null) return formatSetLoad(null, reps);
  const config =
    set.plate_increment != null && set.plate_unit
      ? { increment: set.plate_increment, unit: set.plate_unit }
      : null;
  return `${formatPlateLoad(set.plate_position, config)} × ${reps}`;
}

/** Format any logged set: kg, bodyweight, or machine position. */
export function formatLiftSet(set: LiftSetLoad): string {
  if (set.plate_position != null) {
    const config =
      set.plate_increment != null && set.plate_unit
        ? { increment: set.plate_increment, unit: set.plate_unit }
        : null;
    return `${formatPlateLoad(set.plate_position, config)} × ${set.reps}`;
  }
  return formatSetLoad(set.weight_kg, set.reps);
}

/** Compact load description for plan rows. */
export function formatPlanLoad(exercise: {
  load_mode?: "weight" | "plate" | null;
  plate_config?: PlateConfig | null;
  weight_kg?: number | null;
}): string | null {
  if (isPlateMode(exercise)) {
    const config = exercise.plate_config;
    if (!config) return "Plate stack";
    return `${config.increment}${config.unit}/position`;
  }
  return exercise.weight_kg != null ? `${exercise.weight_kg} kg` : null;
}

export interface PlateEditorValues {
  loadMode: "weight" | "plate";
  plateUnit: PlateUnit;
  plateIncrement: string;
  /** Retained for older plans; no longer shown in the editor. */
  plateMin: string;
  plateMax: string;
}

/**
 * Validates the optional "load per stack position" field. Blank is valid
 * (log positions only); a filled one must be a positive number.
 */
export function plateConfigError(values: PlateEditorValues): string | null {
  if (values.loadMode !== "plate") return null;
  const increment = values.plateIncrement.trim();
  if (!increment) return null;
  const incrementValue = Number(increment);
  if (!Number.isFinite(incrementValue) || incrementValue <= 0) {
    return "Load per stack position must be a positive number.";
  }
  return null;
}

/**
 * Server payload for the optional calibration. Only the unit and load per
 * position are user-facing; bounds default to 1–999 (or keep an older plan's
 * saved bounds when they are still valid).
 */
export function plateConfigFromEditor(values: PlateEditorValues): PlateConfig | null {
  if (values.loadMode !== "plate" || plateConfigError(values) != null) return null;
  const increment = values.plateIncrement.trim();
  if (!increment) return null;
  const rawMin = Number(values.plateMin);
  const rawMax = Number(values.plateMax);
  const min =
    values.plateMin.trim() !== "" && Number.isInteger(rawMin) && rawMin >= 1
      ? Math.min(999, rawMin)
      : 1;
  const max =
    values.plateMax.trim() !== "" &&
    Number.isInteger(rawMax) &&
    rawMax >= min
      ? Math.min(999, rawMax)
      : 999;
  return {
    unit: values.plateUnit,
    increment: Number(increment),
    min_position: min,
    max_position: Math.max(min, max),
  };
}

/**
 * Wire fields for an edited exercise. Free-weight mode returns nothing so the
 * caller can send its kg targets; plate mode returns the mode + calibration
 * (calibration omitted when the athlete logs positions only).
 */
export function platePlanFields(values: PlateEditorValues): {
  load_mode?: "plate";
  plate_config?: PlateConfig;
} {
  if (values.loadMode !== "plate") return {};
  const config = plateConfigFromEditor(values);
  return config ? { load_mode: "plate", plate_config: config } : { load_mode: "plate" };
}

/** Clamp a stack position to an explicit range. */
export function clampPositionToRange(position: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(position)));
}

/** Clamp a typed stack position to the plan's valid range. */
export function clampPlatePosition(
  position: number,
  config: PlateConfig | null | undefined,
): number {
  return clampPositionToRange(
    position,
    config?.min_position ?? 1,
    config?.max_position ?? 999,
  );
}
