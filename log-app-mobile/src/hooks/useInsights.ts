import { useCallback, useMemo, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import { useDataSyncOnFocus } from "./useDataSync";
import type { LiftMetrics } from "../api/types";
import { addDays, todayLocal } from "../utils/date";
import {
  currentWeekInfoFromDates,
  dailySetSeries,
  muscleBreakdownFrom,
  personalRecordsFrom,
  strengthChangePctFrom,
  topExercisesFrom,
  weeklySetSeries,
  workoutStreakFromDates,
  workoutsThisWeekFrom,
} from "../utils/metrics";

/**
 * Everything the Insights screen shows, built from the metrics endpoint's per-day
 * counts and per-exercise rollups — the range and the period before it, so strength
 * deltas have something to compare against.
 */
export function useInsights(rangeDays: number, restDays: number[] = []) {
  const api = useLiftLogsApi();
  const [data, setData] = useState<LiftMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const today = todayLocal();
      const from = addDays(today, -(rangeDays - 1));
      setData(
        await api.getLiftMetrics(from, today, addDays(from, -rangeDays), addDays(from, -1)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lifts");
    } finally {
      setLoading(false);
    }
  }, [api, rangeDays]);

  useDataSyncOnFocus(["lift"], load);

  const metrics = useMemo(() => {
    const today = todayLocal();
    const days = data?.days ?? [];
    const exercises = data?.exercises ?? [];
    const dates = days.map((d) => d.date);
    const counts = new Map(days.map((d) => [d.date, d.sets]));

    return {
      workouts: days.length,
      workoutsThisWeek: workoutsThisWeekFrom(dates, today),
      sets: days.reduce((sum, d) => sum + d.sets, 0),
      strengthPct: strengthChangePctFrom(exercises),
      top: topExercisesFrom(exercises),
      records: personalRecordsFrom(exercises, today),
      muscles: muscleBreakdownFrom(exercises),
      streak: workoutStreakFromDates(dates, today, restDays),
      weekInfo: currentWeekInfoFromDates(dates, restDays, today),
      // Long ranges aggregate weekly so the chart stays readable.
      setsSeries:
        rangeDays >= 90
          ? weeklySetSeries(counts, 13, today)
          : dailySetSeries(counts, rangeDays, today),
    };
  }, [data, rangeDays, restDays]);

  return { loading, error, metrics, refetch: load };
}
