import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import type { LiftLog } from "../api/types";
import { addDays, todayLocal } from "../utils/date";
import {
  currentWeekDots,
  dailyVolumeSeries,
  muscleBreakdown,
  personalRecords,
  strengthChangePct,
  topExercises,
  totalVolume,
  uniqueWorkoutDates,
  weeklyVolumeSeries,
  workoutStreak,
  workoutsThisWeek,
} from "../utils/derive";

/**
 * Everything the Insights screen needs, derived in-app from the lift-log
 * range endpoint (no backend changes).
 */
export function useInsights(rangeDays: number) {
  const api = useLiftLogsApi();
  const [logs, setLogs] = useState<LiftLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const to = todayLocal();
      const from = addDays(to, -(rangeDays - 1));
      setLogs(await api.getLiftLogsRange(from, to));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lifts");
    } finally {
      setLoading(false);
    }
  }, [api, rangeDays]);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => {
    const workoutDays = uniqueWorkoutDates(logs);
    const volume = totalVolume(logs);
    return {
      workouts: workoutDays.length,
      workoutsThisWeek: workoutsThisWeek(logs),
      totalVolume: volume,
      avgVolume: workoutDays.length ? volume / workoutDays.length : 0,
      strengthPct: strengthChangePct(logs),
      top: topExercises(logs, 5),
      records: personalRecords(logs),
      muscles: muscleBreakdown(logs),
      streak: workoutStreak(logs),
      weekDots: currentWeekDots(logs),
      // Long ranges aggregate weekly so the chart stays readable; the
      // screen labels the pill to match.
      volumeSeries:
        rangeDays >= 90 ? weeklyVolumeSeries(logs, 13) : dailyVolumeSeries(logs, rangeDays),
    };
  }, [logs, rangeDays]);

  return { logs, loading, error, metrics, refetch: load };
}
