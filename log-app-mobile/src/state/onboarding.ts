import type { OnboardingInput } from "../api/types";

export interface OnboardingDraft {
  sex: "male" | "female" | "other" | null;
  age: string;
  height_cm: string;
  weight_kg: string;
}

function emptyDraft(): OnboardingDraft {
  return { sex: null, age: "", height_cm: "", weight_kg: "" };
}

let draft = emptyDraft();

/**
 * Dev-only preview switch: when on, the first-run gate stops bouncing you out of
 * the onboarding screens, so the Settings shortcuts can walk the flow on an
 * account that is already onboarded.
 */
let devPreview = false;

export function setDevPreview(value: boolean): void {
  devPreview = value;
}

export function isDevPreview(): boolean {
  return devPreview;
}

/** In-progress answers, shared across the onboarding steps. */
export function getDraft(): OnboardingDraft {
  return draft;
}

export function setDraft(patch: Partial<OnboardingDraft>): void {
  draft = { ...draft, ...patch };
}

export function resetDraft(): void {
  draft = emptyDraft();
}

function num(value: string): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The onboarding payload: just "about you". The meal-tracking and AI-coach flags
 * are deliberately omitted so they keep their `true` defaults — no toggle questions.
 */
export function draftToPayload(d: OnboardingDraft): OnboardingInput {
  const age = Number(d.age);
  return {
    sex: d.sex,
    age: Number.isInteger(age) && age >= 13 && age <= 100 ? age : null,
    height_cm: num(d.height_cm),
    weight_kg: num(d.weight_kg),
  };
}
