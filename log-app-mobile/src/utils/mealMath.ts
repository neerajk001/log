import type { MealItem } from "../api/types";

/**
 * Makes a meal's per-item numbers add up to the edited totals again.
 *
 * The edit sheet lets the athlete correct a meal's calories/protein; without
 * this, the stored items would keep summing to the old totals, so the meal
 * detail view and the day's maths would disagree. Each field is scaled
 * proportionally (rounding drift is absorbed so the parts sum exactly); when
 * every item is zero, the target is spread evenly across them.
 */
export function scaleMealItems(items: MealItem[], calories: number, proteinG: number): MealItem[] {
  if (items.length === 0) return items;
  const calorieValues = distribute(items.map((i) => i.calories), calories);
  const proteinValues = distribute(items.map((i) => i.protein_g), proteinG);
  return items.map((item, i) => ({
    ...item,
    calories: calorieValues[i],
    protein_g: proteinValues[i],
  }));
}

/** Splits `target` across `values` proportionally, as whole numbers summing to it. */
function distribute(values: number[], target: number): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  const shares =
    sum > 0 ? values.map((v) => (v / sum) * target) : values.map(() => target / values.length);
  const rounded = shares.map((v) => Math.max(0, Math.round(v)));

  // Absorb the rounding drift on the largest entries (first when all equal) so
  // the parts add up to exactly `target`.
  let drift = target - rounded.reduce((a, b) => a + b, 0);
  for (const i of Array.from(rounded.keys()).sort((a, b) => rounded[b] - rounded[a])) {
    if (drift === 0) break;
    const next = Math.max(0, rounded[i] + drift);
    drift -= next - rounded[i];
    rounded[i] = next;
  }
  return rounded;
}
