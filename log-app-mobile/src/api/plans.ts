import { useMemo } from "react";
import { useApiClient } from "./client";
import type {
  WorkoutPlan,
  ParsedPlanPreview,
  PlanToday,
  CreatePlanInput,
} from "./types";

export function usePlansApi() {
  const client = useApiClient();

  return useMemo(() => ({
    parsePlanText: (text: string) =>
      client.post<ParsedPlanPreview>("/api/plans/parse", { text }),
    parsePlanPdf: (file: { uri: string; name: string; type: string }) => {
      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.type || "application/pdf",
      } as unknown as Blob);
      return client.postFormData<ParsedPlanPreview>("/api/plans/parse", formData);
    },
    parsePlanPdfForm: (formData: FormData) =>
      client.postFormData<ParsedPlanPreview>("/api/plans/parse", formData),
    createPlan: (data: CreatePlanInput) => client.post<WorkoutPlan>("/api/plans", data),
    getPlans: () => client.get<WorkoutPlan[]>("/api/plans"),
    getPlanToday: (id: string) => client.get<PlanToday>(`/api/plans/${id}/today`),
  }), [client]);
}
