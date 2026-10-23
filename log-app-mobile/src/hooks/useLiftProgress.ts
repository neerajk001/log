import { useCallback, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import { useDataSyncOnFocus } from "./useDataSync";
import { useCurrentDate } from "./useCurrentDate";
import { useLatest } from "./useLatest";
import { addDays } from "../utils/date";
import type { LiftProgress } from "../api/types";

/**
 * Per-exercise session history for the Insights progress card and the exercise
 * detail screen. The previous window is the same length immediately before the
 * current one, so changes are always like-for-like.
 */
export function useLiftProgress(days: number) {
  const api = useLiftLogsApi();
  const [data, setData] = useState<LiftProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();
  const today = useCurrentDate();

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const from = addDays(today, -(days - 1));
      const result = await api.getLiftProgress(
        from,
        today,
        addDays(from, -days),
        addDays(from, -1),
      );
      if (!isCurrent(token)) return;
      setData(result);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load lift progress");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, days, today, begin, isCurrent]);

  useDataSyncOnFocus(["lift"], load);

  return { data, loading, error, refetch: load };
}
