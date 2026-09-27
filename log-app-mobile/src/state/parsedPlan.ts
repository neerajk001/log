import type { EditableDay } from "../components/PlanDaysEditor";

export interface PendingPlan {
  name: string;
  source: "manual" | "ai_parsed";
  days: EditableDay[];
  /** When set, preview updates an existing plan instead of creating one. */
  editingPlanId?: string;
}

let pending: PendingPlan | null = null;

export function setPendingPlan(plan: PendingPlan) {
  pending = plan;
}

export function getPendingPlan(): PendingPlan | null {
  return pending;
}

export function clearPendingPlan() {
  pending = null;
}
