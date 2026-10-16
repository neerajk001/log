import { useState, useCallback } from "react";
import { useTrendsApi } from "../api/trends";
import { useDataSyncOnFocus } from "./useDataSync";
import { useCurrentDate } from "./useCurrentDate";
import { useLatest } from "./useLatest";
import type { TrendRange, TrendsResponse } from "../api/types";

export function useTrends(range: TrendRange = "30d", nutritionWeeks = 8) {
  const api = useTrendsApi();
  // The athlete's local date: it anchors the buckets server-side, and a midnight
  // rollover refreshes the charts.
  const today = useCurrentDate();
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  const fetch = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    if (__DEV__) console.log("[trends] -> fetch", { range, weeks: nutritionWeeks, today });
    try {
      const result = await api.getTrends(range, nutritionWeeks, today);
      // A range/window switch fires a new fetch; a slow old response must not
      // overwrite the newer range's data.
      if (!isCurrent(token)) return;
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
      if (!isCurrent(token)) return;
      if (__DEV__) console.warn("[trends] x failed", err instanceof Error ? err.message : err);
      setError(err instanceof Error ? err.message : "Failed to load trends");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, range, nutritionWeeks, today, begin, isCurrent]);

  useDataSyncOnFocus(["trends"], fetch);

  return { data, loading, error, refetch: fetch };
}