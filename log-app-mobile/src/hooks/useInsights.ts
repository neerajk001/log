import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import type { LiftLog } from "../api/types";
import { addDays, todayLocal } from "../utils/date";
import {
  currentWeekDots,
  dailyVolumeSeries,
  muscleBreakdown,
  personalRecords,
  strengthChangePctWindow,
  topExercises,
  totalVolume,
  uniqueWorkoutDates,
  weeklyVolumeSeries,
  workoutStreak,
  workoutsThisWeek,
} from "../utils/derive";

/**
 * Everything the Insights screen needs, derived in-app from the lift-log
 * range endpoint (no backend changes). Fetches a wider window than the tab
 * range so strength deltas can be compared against the preceding period.
 */
export function useInsights(rangeDays: number) {
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

  useEffect(() => {
    load();
  }, [load]);

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
      streak: workoutStreak(logs, today),
      weekDots: currentWeekDots(logs, today),
      // Long ranges aggregate weekly so the chart stays readable.
      volumeSeries:
        rangeDays >= 90
          ? weeklyVolumeSeries(rangeLogs, 13, today)
          : dailyVolumeSeries(rangeLogs, rangeDays, today),
    };
  }, [logs, rangeDays]);

  return { logs, loading, error, metrics, refetch: load };
}
