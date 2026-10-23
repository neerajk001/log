import { useMemo } from "react";
import { useApiClient } from "./client";
import type { CreatePlanInput, ParsedPlanPreview, PlanToday, WorkoutPlan } from "./types";

export function usePlansApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      // Text parsing is an AI call; the default 15s client timeout used to abort
      // it as a connection error (same class as coach plan generation — give it
      // the AI allowance, matching the PDF path's 120s via postFormData).
      parsePlanText: (text: string) =>
        client.post<ParsedPlanPreview>(
          "/api/plans/parse",
          { text },
          { timeoutMs: 120_000, invalidate: false },
        ),
      parsePlanPdfForm: (formData: FormData) =>
        client.postFormData<ParsedPlanPreview>("/api/plans/parse", formData, {
          invalidate: false,
        }),
      createPlan: (data: CreatePlanInput) => client.post<WorkoutPlan>("/api/plans", data),
      updatePlan: (id: string, data: CreatePlanInput) =>
        client.put<WorkoutPlan>(`/api/plans/${id}`, data),
      getPlans: () => client.get<WorkoutPlan[]>("/api/plans"),
      /** Just the active plan — the Lift screen doesn't need the whole history. */
      getActivePlan: () => client.get<WorkoutPlan[]>("/api/plans?active=1"),
      activatePlan: (id: string) => client.post<WorkoutPlan>(`/api/plans/${id}/activate`, {}),
      deletePlan: (id: string) => client.del<{ ok: true }>(`/api/plans/${id}`),
      /** `date` is the athlete's LOCAL date — the server's UTC day can differ. */
      getPlanToday: (id: string, opts?: { force?: boolean; date?: string }) =>
        client.get<PlanToday>(
          `/api/plans/${id}/today${opts?.date ? `?date=${opts.date}` : ""}`,
          opts?.force ? { force: true } : undefined,
        ),
    }),
    [client],
  );
}
