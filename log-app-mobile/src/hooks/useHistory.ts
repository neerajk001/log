import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useDailyLogsApi } from "../api/dailyLogs";
import { useLiftLogsApi } from "../api/liftLogs";
import { useActivityApi } from "../api/activity";
import { useCurrentDate } from "./useCurrentDate";
import { useDataSync } from "./useDataSync";
import type { ActivityLog, DailyLog, LiftLog } from "../api/types";
import { addDays } from "../utils/date";
import { groupByDate, strengthChangePct, totalVolume, uniqueWorkoutDates } from "../utils/derive";

/** One calendar day of history, combining lifts, daily values and activities. */
export interface HistoryDay {
  date: string;
  lifts: LiftLog[];
  daily: DailyLog | null;
  activities: ActivityLog[];
  exercises: string[];
  volume: number;
}

/** History data (daily + lift + activity) for a range, with deletes. */
export function useHistory(rangeDays: number) {
  const dailyApi = useDailyLogsApi();
  const liftApi = useLiftLogsApi();
  const activityApi = useActivityApi();

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [liftLogs, setLiftLogs] = useState<LiftLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live date (not mount-time): a midnight rollover re-runs `load` via the
  // focus effect, since `to` feeds its dependency chain.
  const to = useCurrentDate();
  const from = useMemo(() => addDays(to, -(rangeDays - 1)), [to, rangeDays]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, l, a] = await Promise.all([
        dailyApi.getDailyLogsRange(from, to),
        liftApi.getLiftLogsRange(from, to),
        activityApi.getActivityRange(from, to),
      ]);
      setDailyLogs(d);
      setLiftLogs(l);
      setActivityLogs(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [dailyApi, liftApi, activityApi, from, to]);

  // useFocusEffect fires on mount too, so no separate useEffect — otherwise
  // the screen would fetch all three ranges twice on first open.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Meals move the day's calories/protein too, hence "daily" alongside the rest.
  useDataSync(["daily", "lift", "activity"], load);

  const deleteDailyLog = useCallback(
    async (date: string) => {
      const removed = dailyLogs.find((d) => d.date === date);
      setDailyLogs((prev) => prev.filter((d) => d.date !== date));
      try {
        await dailyApi.deleteDailyLog(date);
      } catch (err) {
        if (removed) setDailyLogs((prev) => [...prev, removed]);
        throw err;
      }
    },
    [dailyApi, dailyLogs],
  );

  const deleteLiftLog = useCallback(
    async (id: string) => {
      const removed = liftLogs.find((l) => l.id === id);
      setLiftLogs((prev) => prev.filter((l) => l.id !== id));
      try {
        await liftApi.deleteLiftLog(id);
      } catch (err) {
        if (removed) setLiftLogs((prev) => [...prev, removed]);
        throw err;
      }
    },
    [liftApi, liftLogs],
  );

  const deleteActivity = useCallback(
    async (id: string) => {
      const removed = activityLogs.find((a) => a.id === id);
      setActivityLogs((prev) => prev.filter((a) => a.id !== id));
      try {
        await activityApi.deleteActivity(id);
      } catch (err) {
        if (removed) setActivityLogs((prev) => [...prev, removed]);
        throw err;
      }
    },
    [activityApi, activityLogs],
  );

  const stats = useMemo(() => {
    const workoutDays = uniqueWorkoutDates(liftLogs);
    const volume = totalVolume(liftLogs);
    return {
      daysLogged: dailyLogs.length,
      workouts: workoutDays.length,
      totalVolume: volume,
      avgVolume: workoutDays.length ? volume / workoutDays.length : 0,
      strengthPct: strengthChangePct(liftLogs),
      workoutDates: new Set(workoutDays),
    };
  }, [dailyLogs, liftLogs]);

  const groups = useMemo(() => groupByDate(liftLogs), [liftLogs]);

  // Combined per-day view: every date that has a lift, a daily log, or an
  // activity, newest first. This is what the History screen renders so the
  // three sources sit together instead of being stacked end-to-end.
  const days = useMemo<HistoryDay[]>(() => {
    const byDate = new Map<string, HistoryDay>();
    const ensure = (date: string): HistoryDay => {
      let day = byDate.get(date);
      if (!day) {
        day = { date, lifts: [], daily: null, activities: [], exercises: [], volume: 0 };
        byDate.set(date, day);
      }
      return day;
    };

    for (const group of groupByDate(liftLogs)) {
      const day = ensure(group.date);
      day.lifts = group.logs;
      day.exercises = Array.from(new Set(group.logs.map((l) => l.exercise_name)));
      day.volume = group.logs.reduce((sum, l) => sum + Number(l.weight_kg) * l.reps, 0);
    }
    for (const dl of dailyLogs) ensure(dl.date).daily = dl;
    for (const a of activityLogs) ensure(a.date).activities.push(a);

    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [liftLogs, dailyLogs, activityLogs]);

  return {
    dailyLogs,
    liftLogs,
    activityLogs,
    groups,
    days,
    stats,
    loading,
    error,
    from,
    to,
    refetch: load,
    deleteDailyLog,
    deleteLiftLog,
    deleteActivity,
  };
}
