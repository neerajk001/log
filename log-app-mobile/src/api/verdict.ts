import { useMemo } from "react";
import { useApiClient } from "./client";
import type { VerdictResponse } from "./types";

export function useVerdictApi() {
  const client = useApiClient();
  return useMemo(() => ({
    /** `date` is the athlete's LOCAL date — the server's UTC day can differ. */
    getWeeklyVerdict: (date?: string) =>
      client.get<VerdictResponse>(`/api/verdict/weekly${date ? `?date=${date}` : ""}`),
  }), [client]);
}
