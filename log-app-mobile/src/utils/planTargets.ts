import type { PlanSetTarget } from "../api/types";
import { parsePositiveInt, parsePositiveNumber } from "./parse";

/**
 * Plan target weights: the editor holds one string per set (a "pyramid"), and
 * these helpers turn those into the wire shape (`weight_kg` default +
 * `set_targets`) and produce the little "Plan · 60 kg × 8" hint shown under a
 * lift row.
 */

const MAX_WEIGHT = 9999;

/** How many per-set weight fields the plan editor shows for one exercise. */
export const MAX_EDITOR_SET_FIELDS = 10;

/** Sets the editor should show for an exercise's `sets` string (1..MAX). */
export function editorSetCount(setsValue: string): number {
  const parsed = parsePositiveInt(setsValue, 99) ?? 1;
  return Math.max(1, Math.min(MAX_EDITOR_SET_FIELDS, parsed));
}

/** 1-based index of the first non-blank weight that isn't a valid number, or null. */
export function firstInvalidSetWeight(values: string[]): number | null {
  for (let i = 0; i < values.length; i++) {
    if (values[i].trim() !== "" && parsePositiveNumber(values[i], MAX_WEIGHT) == null) return i + 1;
  }
  return null;
}

/**
 * The per-set target array for the payload: one entry per set so positions stay
 * aligned (a blank set is `{ weight_kg: null }` = "use the default"). Trailing
 * blanks are dropped, and an all-blank list becomes undefined so untouched
 * plans stay clean.
 */
export function setTargetsFromWeights(values: string[]): PlanSetTarget[] | undefined {
  const parsed = values.map((v) =>
    v.trim() === "" ? null : parsePositiveNumber(v, MAX_WEIGHT),
  );
  const lastFilled = parsed.reduce<number>(
    (last, entry, index) => (entry != null ? index : last),
    -1,
  );
  if (lastFilled < 0) return undefined;
  return parsed
    .slice(0, lastFilled + 1)
    .map((weight) => ({ weight_kg: weight }));
}

/** The wire shape for one edited exercise: the default weight + per-set targets. */
export function exerciseTargetsPayload(setWeights: string[]): {
  weight_kg?: number;
  set_targets?: PlanSetTarget[];
} {
  return {
    weight_kg: defaultWeightFrom(setWeights),
    set_targets: setTargetsFromWeights(setWeights),
  };
}

/**
 * Editor weights for a stored exercise: its per-set targets when present,
 * otherwise the single default weight on set 1 (the hint below a lift row falls
 * back to the default for the later sets).
 */
export function editorWeightsFromExercise(exercise: {
  sets?: number | string;
  weight_kg?: number | null;
  set_targets?: PlanSetTarget[] | null;
}): string[] {
  const count = editorSetCount(String(exercise.sets ?? ""));
  const targets = exercise.set_targets ?? [];
  return Array.from({ length: count }, (_, index) => {
    const perSet = targets[index]?.weight_kg ?? null;
    const weight = perSet ?? (index === 0 ? exercise.weight_kg ?? null : null);
    return weight != null ? String(weight) : "";
  });
}

/** The single default `weight_kg` for the exercise: its first filled set. */
export function defaultWeightFrom(values: string[]): number | undefined {
  for (const value of values) {
    const parsed = value.trim() === "" ? null : parsePositiveNumber(value, MAX_WEIGHT);
    if (parsed != null) return parsed;
  }
  return undefined;
}

/**
 * The weight part of a collapsed exercise row's prescription: a pyramid reads
 * `60/62.5/65 kg`, a long one `60 → 65 kg`, and a plain target stays `60 kg`.
 * Returns null when the plan prescribes no weight at all.
 */
export function formatTargetWeight(exercise: {
  sets?: number;
  weight_kg?: number | null;
  set_targets?: PlanSetTarget[] | null;
}): string | null {
  const perSet = (exercise.set_targets ?? [])
    .slice(0, exercise.sets ?? exercise.set_targets?.length ?? 0)
    .map((target) => target?.weight_kg ?? null)
    .filter((weight): weight is number => weight != null);
  const unique = [...new Set(perSet)];
  if (unique.length === 0) {
    return exercise.weight_kg != null ? `${exercise.weight_kg} kg` : null;
  }
  if (unique.length === 1) return `${unique[0]} kg`;
  if (unique.length <= 4) return `${unique.join("/")} kg`;
  return `${unique[0]} → ${unique[unique.length - 1]} kg`;
}

/** `60 kg × 8` when every set matched, `BW × 8/8/10` for bodyweight — one line, no ellipsis. */
export function formatSetList(sets: { weight_kg: number | null; reps: number }[]): string | null {
  if (sets.length === 0) return null;
  const weights = [...new Set(sets.map((set) => set.weight_kg).filter((w): w is number => w != null))];
  const reps = [...new Set(sets.map((set) => set.reps))];
  const weightText =
    weights.length === 0
      ? "BW"
      : weights.length === 1
        ? `${weights[0]} kg`
        : `${weights.join("/")} kg`;
  if (reps.length === 1) return `${weightText} × ${reps[0]}`;
  return `${weightText} × ${sets.map((set) => set.reps).join("/")}`;
}

/**
 * The prescription line for one set (0-based index), e.g. "Plan · 60 kg × 8".
 * The per-set target wins; otherwise the exercise's default weight and rep
 * scheme. Null when the set is beyond the prescription or has nothing to show.
 */
export function planHintFor(
  index: number,
  exercise: {
    sets: number;
    reps: string;
    weight_kg?: number | null;
    set_targets?: PlanSetTarget[] | null;
  },
): string | null {
  if (index < 0 || index + 1 > exercise.sets) return null;
  const target = exercise.set_targets?.[index];
  const weight = target?.weight_kg ?? exercise.weight_kg ?? null;
  const reps = target?.reps ?? exercise.reps ?? null;
  if (weight == null && (!reps || reps.trim() === "")) return null;
  const parts = [
    weight != null ? `${weight} kg` : null,
    reps && reps.trim() !== "" ? reps : null,
  ].filter(Boolean);
  return `Plan · ${parts.join(" × ")}`;
}
