/**
 * Pre-fills the lift rows for an exercise.
 *
 * Each row is seeded from the matching set of the athlete's *previous session*
 * (set 1 → last session's set 1, and so on), not from a single "last" value —
 * a pyramid like 60/62.5/65/65 comes back exactly as it was performed. Rows
 * beyond that session repeat its final set; with no history at all the plan
 * target is used, so a fresh exercise still has something to tap through.
 *
 * Rows for sets already logged today are skipped, so the seeds line up with the
 * sets still to do.
 */
export interface LiftSeed {
  weight: string;
  reps: string;
  /** Machine stack position; empty for kg/bodyweight rows. */
  position: string;
}

export interface LiftSeedInput {
  /** Rows to seed (prescription minus what's already logged today). */
  count: number;
  /** Sets already logged today for this exercise. */
  loggedSetCount: number;
  /** The previous session's sets, in order. */
  lastSets?: {
    weight_kg: number | null;
    reps: number;
    plate_position?: number | null;
  }[] | null;
  /** The plan's per-set targets, in order. */
  setTargets?: { weight_kg?: number | null; reps?: string | null }[] | null;
  /** The plan's single target weight (fallback). */
  plannedWeight?: number | null;
  /** The plan's rep scheme, e.g. "8-12" (its first number is used). */
  plannedReps?: string | null;
  /** The previous session's top set, when no per-set history exists. */
  lastLog?: { weight_kg: number | null; reps: number; plate_position?: number | null } | null;
  /** Bodyweight mode: seed reps only, never a load. */
  bodyweight?: boolean;
  /** Plate-stack mode: seed the previous position (or the configured minimum). */
  plate?: boolean;
  /** First valid stack position when there is no history. */
  minPlatePosition?: number;
}

/** First integer in a rep scheme, e.g. "8-12" → 8. */
function firstInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function buildSetSeeds({
  count,
  loggedSetCount,
  lastSets,
  setTargets,
  plannedWeight,
  plannedReps,
  lastLog,
  bodyweight = false,
  plate = false,
  minPlatePosition = 1,
}: LiftSeedInput): LiftSeed[] {
  const seeds: LiftSeed[] = [];
  for (let row = 0; row < count; row++) {
    const index = loggedSetCount + row; // 0-based set number
    // History first (what they actually did); repeat the final set beyond it.
    const history = lastSets?.[index] ?? lastSets?.[lastSets.length - 1] ?? lastLog ?? null;
    const target = setTargets?.[index] ?? null;
    // Bodyweight and plate exercises never pre-fill a kg load.
    const weight =
      bodyweight || plate
        ? null
        : history?.weight_kg ?? target?.weight_kg ?? plannedWeight ?? null;
    const position = plate
      ? history?.plate_position ?? minPlatePosition
      : null;
    const reps =
      history?.reps ?? firstInt(target?.reps) ?? firstInt(plannedReps) ?? lastLog?.reps ?? null;
    seeds.push({
      weight: weight != null ? String(weight) : "",
      reps: reps != null ? String(reps) : "",
      position: position != null ? String(position) : "",
    });
  }
  return seeds;
}
