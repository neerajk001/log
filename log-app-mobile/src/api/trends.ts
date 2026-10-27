import { useMemo } from "react";
import { useApiClient } from "./client";
import type { BodyAnalysis, BodyAnalysisRange, TrendRange, TrendsResponse } from "./types";

export function useTrendsApi() {
  const client = useApiClient();
  return useMemo(() => ({
    /** Each range/window is a distinct cache key, so switching back is instant. */
    getTrends: (range: TrendRange, weeks: number, date: string) =>
      client.get<TrendsResponse>(`/api/trends?range=${range}&weeks=${weeks}&date=${date}`),
    /** Pro detailed weight/nutrition analysis. */
    getBodyAnalysis: (range: BodyAnalysisRange, date: string, opts?: { force?: boolean }) =>
      client.get<BodyAnalysis>(`/api/insights/body?range=${range}&date=${date}`, opts),
  }), [client]);
}
