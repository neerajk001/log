import { useCallback, useState } from "react";
import { useTrendsApi } from "../api/trends";
import { useDataSyncOnFocus } from "./useDataSync";
import { useLatest } from "./useLatest";
import type { BodyAnalysis, BodyAnalysisRange } from "../api/types";

/**
 * Pro detailed body/nutrition analysis for one window. Data changes with every
 * daily log, so it subscribes to the `daily` resource and refetches on focus.
 */
export function useBodyAnalysis(
  range: BodyAnalysisRange,
  date: string,
  enabled: boolean,
) {
  const api = useTrendsApi();
  const [data, setData] = useState<BodyAnalysis | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  const load = useCallback(async (force = false) => {
    if (!enabled) return;
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const next = await api.getBodyAnalysis(range, date, { force });
      if (!isCurrent(token)) return;
      setData(next);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Couldn't load the analysis");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, range, date, enabled, begin, isCurrent]);

  useDataSyncOnFocus(["daily"], load);

  return { data, loading, error, refetch: load };
}
