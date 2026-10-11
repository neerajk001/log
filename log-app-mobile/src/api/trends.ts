import { useMemo } from "react";
import { useApiClient } from "./client";
import type { TrendRange, TrendsResponse } from "./types";

export function useTrendsApi() {
  const client = useApiClient();
  return useMemo(() => ({
    /** Each range/window is a distinct cache key, so switching back is instant. */
    getTrends: (range: TrendRange, weeks: number, date: string) =>
      client.get<TrendsResponse>(`/api/trends?range=${range}&weeks=${weeks}&date=${date}`),
  }), [client]);
}
