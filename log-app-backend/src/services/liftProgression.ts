/**
 * Deterministic next-session targets: double progression over the athlete's
 * previous session. Pure and I/O-free so the rules are unit-testable.
 *
 * - Hit the top of the rep range on every working set -> add 2.5 kg (or one
 *   stack position, or one rep for bodyweight).
 * - Missed it -> repeat the load and aim for one more rep per set.
 * - No plan rep range -> assume 8-12, a sensible default for logged exercises.
 */

const DEFAULT_RANGE = { low: 8, high: 12 };
const KG_INCREMENT = 2.5;
/** A progression is only recommended after at least this many working sets. */
const MIN_PROGRESS_SETS = 2;

export interface ProgressionSetInput {
  weight_kg: number | null;
  reps: number;
  plate_position?: number | null;
}

export interface ProgressionPrescription {
  sets: number;
  reps: string;
  weight_kg?: number | null;
  set_targets?: { weight_kg?: number | null; reps?: string | null }[] | null;
  load_mode?: "weight" | "plate";
  plate_config?: { min_position?: number | null; max_position?: number | null } | null;
}

export interface ProgressionSetOutput {
  weight_kg: number | null;
  reps: number;
  plate_position?: number | null;
}

export interface ProgressionTarget {
  mode: "kg" | "plate" | "bw";
  from_date: string;
  /** One target per previous working set, in the same order. */
  sets: ProgressionSetOutput[];
  /** Display-ready, e.g. "62.5 kg × 8". */
  headline: string;
  reason: string;
  /** True when load/position actually increased. */
  added_load: boolean;
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

/** First rep range in a scheme: "8-12" -> {8,12}, "5" -> {5,5}. */
export function parseRepRange(scheme: string | null | undefined): { low: number; high: number } | null {
  if (!scheme) return null;
  const range = scheme.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a > 0 && b >= a) return { low: a, high: b };
  }
  const single = scheme.match(/\d+/);
  if (single) {
    const n = Number(single[0]);
    if (n > 0) return { low: n, high: n };
  }
  return null;
}

function targetRange(prescription: ProgressionPrescription | null) {
  return parseRepRange(prescription?.reps) ?? DEFAULT_RANGE;
}

function modeOf(
  sets: ProgressionSetInput[],
  prescription: ProgressionPrescription | null,
): "kg" | "plate" | "bw" {
  if (prescription?.load_mode === "plate") return "plate";
  if (sets.every((set) => set.plate_position != null)) return "plate";
  if (sets.every((set) => set.weight_kg == null)) return "bw";
  return "kg";
}

function headlineFor(mode: "kg" | "plate" | "bw", sets: ProgressionSetOutput[]): string {
  const reps = sets.length > 0 ? Math.min(...sets.map((set) => set.reps)) : 0;
  if (mode === "bw") return `BW × ${reps}`;
  if (mode === "plate") {
    const positions = sets
      .map((set) => set.plate_position)
      .filter((p): p is number => p != null);
    if (positions.length === 0) return `${reps} reps`;
    const min = Math.min(...positions);
    const max = Math.max(...positions);
    return `${min === max ? `Pos ${min}` : `Pos ${min}–${max}`} × ${reps}`;
  }
  const weights = sets
    .map((set) => set.weight_kg)
    .filter((w): w is number => w != null);
  if (weights.length === 0) return `${reps} reps`;
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  return `${min === max ? `${fmt(min)} kg` : `${fmt(min)}–${fmt(max)} kg`} × ${reps}`;
}

/**
 * Returns the next session's target, or null when there is no previous session.
 * `lastDate` is the athlete's local date of that session.
 */
export function computeProgression(
  lastSets: ProgressionSetInput[],
  lastDate: string,
  prescription: ProgressionPrescription | null,
): ProgressionTarget | null {
  const working = lastSets.filter((set) => set.reps > 0);
  if (working.length === 0) return null;

  const mode = modeOf(working, prescription);
  const { low, high } = targetRange(prescription);
  const requiredSets = Math.min(
    MIN_PROGRESS_SETS,
    Math.max(1, prescription?.sets ?? MIN_PROGRESS_SETS),
  );
  const allAtTop =
    working.length >= requiredSets && working.every((set) => set.reps >= high);

  if (mode === "bw") {
    const sets = working.map((set) => ({
      weight_kg: null,
      reps: set.reps + 1,
      ...(set.plate_position != null ? { plate_position: set.plate_position } : {}),
    }));
    return {
      mode,
      from_date: lastDate,
      sets,
      headline: headlineFor(mode, sets),
      reason: "Bodyweight: add a rep on every set.",
      added_load: false,
    };
  }

  if (mode === "plate") {
    const positions = working.map((set) => set.plate_position ?? 1);
    const minPosition = prescription?.plate_config?.min_position ?? 1;
    const maxPosition = prescription?.plate_config?.max_position ?? 999;
    const atTopOfStack = positions.every((position) => position >= maxPosition);
    const addPosition = allAtTop && !atTopOfStack;
    // At the top of the stack the only progression left is more reps.
    const addRepBeyondTop = allAtTop && atTopOfStack;
    const sets = working.map((set, i) => {
      const position = Math.max(
        minPosition,
        Math.min(maxPosition, positions[i] + (addPosition ? 1 : 0)),
      );
      // Never recommend fewer reps than the athlete already did.
      const reps = addPosition
        ? low
        : addRepBeyondTop || set.reps < high
          ? set.reps + 1
          : set.reps;
      return {
        weight_kg: null,
        plate_position: position,
        reps,
      };
    });
    const reason = addPosition
      ? `You hit ${high} reps on all ${working.length} sets — move up one stack position.`
      : addRepBeyondTop
        ? "You're at the top of the stack — add a rep instead."
        : `Just off the top of the range — add a rep at this position.`;
    return {
      mode,
      from_date: lastDate,
      sets,
      headline: headlineFor(mode, sets),
      reason,
      added_load: addPosition,
    };
  }

  // kg
  const weights = working.map((set) => set.weight_kg ?? 0);
  const workingWeight = Math.max(...weights);
  const sets = working.map((set) => {
    const base = set.weight_kg;
    return {
      // A mixed exercise (some weighted, some bodyweight sets) never invents a
      // load for the bodyweight ones.
      weight_kg:
        allAtTop && base != null ? Math.round((base + KG_INCREMENT) * 100) / 100 : base,
      // After adding load, aim at the bottom of the range again; otherwise climb
      // one rep without exceeding the top (and never suggest fewer reps).
      reps: allAtTop ? low : set.reps >= high ? set.reps : set.reps + 1,
    };
  });
  const reason = allAtTop
    ? `You hit ${high} reps on all ${working.length} sets — add ${fmt(KG_INCREMENT)} kg.`
    : `You didn't reach ${high} on every set — own the reps at ${fmt(workingWeight)} kg first.`;

  return {
    mode,
    from_date: lastDate,
    sets,
    headline: headlineFor(mode, sets),
    reason,
    added_load: allAtTop,
  };
}
