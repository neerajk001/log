import { useCallback, useMemo, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import { useDataSyncOnFocus } from "./useDataSync";
import type { LiftLog } from "../api/types";
import { addDays, todayLocal } from "../utils/date";
import {
  currentWeekInfo,
  dailySetSeries,
  dailyVolumeSeries,
  muscleBreakdown,
  personalRecords,
  strengthChangePctWindow,
  topExercises,
  totalVolume,
  uniqueWorkoutDates,
  weeklySetSeries,
  weeklyVolumeSeries,
  workoutStreak,
  workoutsThisWeek,
} from "../utils/derive";

/**
 * Everything the Insights screen needs, derived in-app from the lift-log
 * range endpoint (no backend changes). Fetches a wider window than the tab
 * range so strength deltas can be compared against the preceding period.
 */
export function useInsights(rangeDays: number, restDays: number[] = []) {
  const api = useLiftLogsApi();
  const [logs, setLogs] = useState<LiftLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDays = Math.max(rangeDays * 2, 60);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const to = todayLocal();
      const from = addDays(to, -(fetchDays - 1));
      setLogs(await api.getLiftLogsRange(from, to));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lifts");
    } finally {
      setLoading(false);
    }
  }, [api, fetchDays]);

  useDataSyncOnFocus(["lift"], load);

  const metrics = useMemo(() => {
    const today = todayLocal();
    const rangeStart = addDays(today, -(rangeDays - 1));
    const rangeLogs = logs.filter((l) => l.date >= rangeStart);

    const workoutDays = uniqueWorkoutDates(rangeLogs);

    return {
      workouts: workoutDays.length,
      workoutsThisWeek: workoutsThisWeek(logs, today),
      totalVolume: totalVolume(rangeLogs),
      strengthPct: strengthChangePctWindow(logs, rangeDays, today),
      monthStrengthPct: strengthChangePctWindow(logs, 28, today),
      top: topExercises(rangeLogs, 5),
      records: personalRecords(logs),
      muscles: muscleBreakdown(rangeLogs),
      sets: rangeLogs.length,
      streak: workoutStreak(logs, today, restDays),
      weekInfo: currentWeekInfo(logs, restDays, today),
      // Long ranges aggregate weekly so the chart stays readable.
      setsSeries:
        rangeDays >= 90
          ? weeklySetSeries(rangeLogs, 13, today)
          : dailySetSeries(rangeLogs, rangeDays, today),
      volumeSeries:
        rangeDays >= 90
          ? weeklyVolumeSeries(rangeLogs, 13, today)
          : dailyVolumeSeries(rangeLogs, rangeDays, today),
    };
  }, [logs, rangeDays, restDays]);

  return { logs, loading, error, metrics, refetch: load };
}
