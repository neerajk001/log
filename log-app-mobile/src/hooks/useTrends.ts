import { useState, useCallback } from "react";
import { useTrendsApi } from "../api/trends";
import { useDataSyncOnFocus } from "./useDataSync";
import type { TrendRange, TrendsResponse } from "../api/types";

export function useTrends(range: TrendRange = "30d", nutritionWeeks = 8) {
  const api = useTrendsApi();
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (__DEV__) console.log("[trends] -> fetch", { range, weeks: nutritionWeeks });
    try {
      const result = await api.getTrends(range, nutritionWeeks);
      if (__DEV__) {
        console.log("[trends] <- loaded", {
          bucket: result.bucket,
          series: result.series.length,
          nutrition: result.nutrition.length,
          months: result.months.length,
        });
      }
      setData(result);
    } catch (err) {
      if (__DEV__) console.warn("[trends] x failed", err instanceof Error ? err.message : err);
      setError(err instanceof Error ? err.message : "Failed to load trends");
    } finally {
      setLoading(false);
    }
  }, [api, range, nutritionWeeks]);

  useDataSyncOnFocus(["trends"], fetch);

  return { data, loading, error, refetch: fetch };
}