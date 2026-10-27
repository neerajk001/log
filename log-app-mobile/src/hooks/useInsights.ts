import { useCallback, useMemo, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import { useDataSyncOnFocus } from "./useDataSync";
import { useCurrentDate } from "./useCurrentDate";
import { useLatest } from "./useLatest";
import type { LiftMetrics } from "../api/types";
import { addDays } from "../utils/date";
import {
  personalRecordsFrom,
  strengthChangePctFrom,
  workoutsThisWeekFrom,
} from "../utils/metrics";

/**
 * The Insights summary and PR data, built from the metrics endpoint's per-day
 * counts and per-exercise rollups — the range and the period before it, so
 * strength deltas have something to compare against.
 */
export function useInsights(rangeDays: number) {
  const api = useLiftLogsApi();
  const [data, setData] = useState<LiftMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  // Live date: a midnight rollover rebuilds the window (and re-runs the load).
  const today = useCurrentDate();

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const from = addDays(today, -(rangeDays - 1));
      const result = await api.getLiftMetrics(from, today, addDays(from, -rangeDays), addDays(from, -1));
      // A range switch fires a new load; a late old response must not win.
      if (!isCurrent(token)) return;
      setData(result);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load lifts");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, rangeDays, today, begin, isCurrent]);

  useDataSyncOnFocus(["lift"], load);

  const metrics = useMemo(() => {
    const days = data?.days ?? [];
    const exercises = data?.exercises ?? [];
    const dates = days.map((d) => d.date);

    return {
      workouts: days.length,
      workoutsThisWeek: workoutsThisWeekFrom(dates, today),
      sets: days.reduce((sum, d) => sum + d.sets, 0),
      strengthPct: strengthChangePctFrom(exercises),
      records: personalRecordsFrom(exercises, today),
    };
  }, [data, today]);

  return { loading, error, metrics, refetch: load };
}
