import { useMemo } from "react";
import { useApiClient } from "./client";
import type { VerdictResponse } from "./types";

export function useVerdictApi() {
  const client = useApiClient();
  return useMemo(() => ({
    getWeeklyVerdict: () => client.get<VerdictResponse>("/api/verdict/weekly"),
  }), [client]);
}
