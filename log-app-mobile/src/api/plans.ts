import { useMemo } from "react";
import { useApiClient } from "./client";
import type { CreatePlanInput, ParsedPlanPreview, PlanToday, WorkoutPlan } from "./types";

export function usePlansApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      parsePlanText: (text: string) =>
        client.post<ParsedPlanPreview>("/api/plans/parse", { text }),
      parsePlanPdfForm: (formData: FormData) =>
        client.postFormData<ParsedPlanPreview>("/api/plans/parse", formData),
      createPlan: (data: CreatePlanInput) => client.post<WorkoutPlan>("/api/plans", data),
      updatePlan: (id: string, data: CreatePlanInput) =>
        client.put<WorkoutPlan>(`/api/plans/${id}`, data),
      getPlans: () => client.get<WorkoutPlan[]>("/api/plans"),
      getPlanToday: (id: string, opts?: { force?: boolean }) =>
        client.get<PlanToday>(`/api/plans/${id}/today`, opts),
    }),
    [client],
  );
}
