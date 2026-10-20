import type { PlanSetTarget } from "../api/types";

/**
 * A set is either loaded (`kg × reps`) or bodyweight (`BW × reps`). Bodyweight
 * exercises are detected from their name, and a previous session (or an explicit
 * plan target) can override that guess.
 */
export type LoadMode = "kg" | "bw";

/**
 * Exercises that are normally performed with no load. Deliberately conservative:
 * a false positive only changes the default input (one tap to switch back), but
 * it must never hide the weight field for a lift the athlete loads.
 */
const BODYWEIGHT_RULES: RegExp[] = [
  /plank/i,
  /hanging\s+(leg|knee)\s+raise/i,
  /\bleg\s+raise/i,
  /\bknee\s+raise/i,
  /\bcrunch/i,
  /sit[- ]?up/i,
  /push[- ]?up/i,
  /pull[- ]?up/i,
  /chin[- ]?up/i,
  /\bdips?\b/i,
  /inverted\s+row/i,
  /(air|pistol|bodyweight)\s+squat/i,
  /burpee/i,
  /mountain\s+climber/i,
  /hollow\s+(body\s+)?hold/i,
  /dead\s+bug/i,
  /bird\s+dog/i,
  /glute\s+bridge/i,
  /wall\s+sit/i,
  /handstand/i,
  /jump\s+rope|skipping/i,
];

export function isBodyweightName(name: string): boolean {
  return BODYWEIGHT_RULES.some((pattern) => pattern.test(name));
}

/**
 * Which mode the input rows should open in.
 *
 * 1. What was actually done last session wins (all of its sets unloaded → bodyweight).
 * 2. Otherwise a plan target weight means the athlete intends to load it.
 * 3. Otherwise the name heuristic decides.
 */
export function inferLoadMode(input: {
  name: string;
  lastSets?: { weight_kg: number | null }[] | null;
  lastLog?: { weight_kg: number | null } | null;
  plannedWeight?: number | null;
  setTargets?: PlanSetTarget[] | null;
}): LoadMode {
  const history =
    input.lastSets && input.lastSets.length > 0
      ? input.lastSets
      : input.lastLog
        ? [input.lastLog]
        : null;
  if (history) {
    return history.every((set) => set.weight_kg == null) ? "bw" : "kg";
  }

  const hasPlanWeight =
    (input.plannedWeight ?? 0) > 0 ||
    (input.setTargets ?? []).some((target) => (target.weight_kg ?? 0) > 0);
  if (hasPlanWeight) return "kg";

  return isBodyweightName(input.name) ? "bw" : "kg";
}

/** `BW × 12` / `60 kg × 8` — one line for a logged set. */
export function formatSetLoad(weight: number | null | undefined, reps: number): string {
  return weight == null ? `BW × ${reps}` : `${weight} kg × ${reps}`;
}
