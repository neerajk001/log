import { useMemo } from "react";
import { useApiClient } from "./client";
import type { TrendsResponse } from "./types";

export function useTrendsApi() {
  const client = useApiClient();
  return useMemo(() => ({
    getTrends: () => client.get<TrendsResponse>("/api/trends"),
  }), [client]);
}
