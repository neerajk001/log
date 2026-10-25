import { describe, expect, it } from "vitest";
import {
  computeProgression,
  parseRepRange,
  type ProgressionPrescription,
} from "../src/services/liftProgression";

const DATE = "2026-10-20";

function prescription(patch: Partial<ProgressionPrescription> = {}): ProgressionPrescription {
  return { sets: 3, reps: "8-12", ...patch };
}

describe("parseRepRange", () => {
  it("reads ranges and single-rep schemes", () => {
    expect(parseRepRange("8-12")).toEqual({ low: 8, high: 12 });
    expect(parseRepRange("8 – 10")).toEqual({ low: 8, high: 10 });
    expect(parseRepRange("5")).toEqual({ low: 5, high: 5 });
  });

  it("returns null for text without a usable number", () => {
    expect(parseRepRange("AMRAP")).toBeNull();
    expect(parseRepRange(null)).toBeNull();
  });
});

describe("computeProgression — kg", () => {
  it("adds 2.5 kg when every working set hit the top of the range", () => {
    const target = computeProgression(
      [
        { weight_kg: 60, reps: 12 },
        { weight_kg: 60, reps: 12 },
        { weight_kg: 60, reps: 12 },
      ],
      DATE,
      prescription(),
    );

    expect(target).not.toBeNull();
    expect(target?.mode).toBe("kg");
    expect(target?.added_load).toBe(true);
    expect(target?.sets).toEqual([
      { weight_kg: 62.5, reps: 8 },
      { weight_kg: 62.5, reps: 8 },
      { weight_kg: 62.5, reps: 8 },
    ]);
    expect(target?.headline).toBe("62.5 kg × 8");
    expect(target?.reason).toContain("add 2.5 kg");
  });

  it("keeps the load and aims one more rep when the top was missed", () => {
    const target = computeProgression(
      [
        { weight_kg: 60, reps: 10 },
        { weight_kg: 60, reps: 9 },
        { weight_kg: 60, reps: 8 },
      ],
      DATE,
      prescription(),
    );

    expect(target?.added_load).toBe(false);
    expect(target?.sets).toEqual([
      { weight_kg: 60, reps: 11 },
      { weight_kg: 60, reps: 10 },
      { weight_kg: 60, reps: 9 },
    ]);
    expect(target?.headline).toBe("60 kg × 9");
  });

  it("adds a single 2.5 kg step for a 5-rep scheme", () => {
    const target = computeProgression(
      [
        { weight_kg: 80, reps: 5 },
        { weight_kg: 80, reps: 5 },
      ],
      DATE,
      prescription({ reps: "5" }),
    );

    expect(target?.sets[0]).toEqual({ weight_kg: 82.5, reps: 5 });
    expect(target?.added_load).toBe(true);
  });

  it("does not progress a one-set session without a plan", () => {
    const target = computeProgression([{ weight_kg: 20, reps: 20 }], DATE, null);

    expect(target?.added_load).toBe(false);
    expect(target?.sets[0]).toEqual({ weight_kg: 20, reps: 20 });
  });

  it("uses the 8-12 default when there is no prescription", () => {
    const target = computeProgression(
      [
        { weight_kg: 40, reps: 12 },
        { weight_kg: 40, reps: 12 },
      ],
      DATE,
      null,
    );

    expect(target?.added_load).toBe(true);
    expect(target?.sets[0].weight_kg).toBe(42.5);
  });

  it("returns null when there is no previous session", () => {
    expect(computeProgression([], DATE, prescription())).toBeNull();
  });
});

describe("computeProgression — plate", () => {
  it("moves up one stack position when every set hit the top", () => {
    const target = computeProgression(
      [
        { weight_kg: null, reps: 12, plate_position: 8 },
        { weight_kg: null, reps: 12, plate_position: 8 },
      ],
      DATE,
      prescription({ load_mode: "plate", plate_config: { min_position: 1, max_position: 20 } }),
    );

    expect(target?.mode).toBe("plate");
    expect(target?.added_load).toBe(true);
    expect(target?.sets).toEqual([
      { weight_kg: null, reps: 8, plate_position: 9 },
      { weight_kg: null, reps: 8, plate_position: 9 },
    ]);
    expect(target?.headline).toBe("Pos 9 × 8");
  });

  it("holds at the top of the stack and adds reps instead", () => {
    const target = computeProgression(
      [
        { weight_kg: null, reps: 12, plate_position: 20 },
        { weight_kg: null, reps: 12, plate_position: 20 },
      ],
      DATE,
      prescription({ load_mode: "plate", plate_config: { min_position: 1, max_position: 20 } }),
    );

    expect(target?.added_load).toBe(false);
    expect(target?.sets[0]).toEqual({ weight_kg: null, reps: 13, plate_position: 20 });
    expect(target?.reason).toContain("top of the stack");
  });
});

describe("computeProgression — bodyweight", () => {
  it("adds a rep on every set", () => {
    const target = computeProgression(
      [
        { weight_kg: null, reps: 10 },
        { weight_kg: null, reps: 9 },
        { weight_kg: null, reps: 8 },
      ],
      DATE,
      prescription(),
    );

    expect(target?.mode).toBe("bw");
    expect(target?.added_load).toBe(false);
    expect(target?.sets.map((set) => set.reps)).toEqual([11, 10, 9]);
    expect(target?.headline).toBe("BW × 9");
  });
});
