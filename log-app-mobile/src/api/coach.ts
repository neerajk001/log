import { useMemo } from "react";
import { useApiClient } from "./client";
import type { CoachMessage, CoachProfile, CoachProfileInput, ParsedPlanPreview } from "./types";

export function useCoachApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      getProfile: () => client.get<CoachProfile | null>("/api/coach/profile"),
      saveProfile: (data: CoachProfileInput) =>
        client.put<CoachProfile>("/api/coach/profile", data),
      getMessages: () => client.get<CoachMessage[]>("/api/coach/messages"),
      chat: (message: string) => client.post<{ reply: string }>("/api/coach/chat", { message }),
      generatePlan: (body: { goal?: string; notes?: string }) =>
        client.post<ParsedPlanPreview>("/api/coach/plan", body),
      analyzePhoto: (formData: FormData) =>
        client.postFormData<{ analysis: string }>("/api/coach/analyze", formData),
    }),
    [client],
  );
}
