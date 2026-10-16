import { useCallback, useMemo, useRef, useState } from "react";
import { useDailyLogsApi } from "../api/dailyLogs";
import { useLiftLogsApi } from "../api/liftLogs";
import { useActivityApi } from "../api/activity";
import { useCurrentDate } from "./useCurrentDate";
import { useDataSyncOnFocus } from "./useDataSync";
import { useLatest } from "./useLatest";
import type { ActivityLog, DailyLog, LiftLog } from "../api/types";
import { addDays } from "../utils/date";
import { groupByDate } from "../utils/derive";
import { strengthChangePctFrom } from "../utils/metrics";

/** One calendar day of history, combining lifts, daily values and activities. */
export interface HistoryDay {
  date: string;
  lifts: LiftLog[];
  daily: DailyLog | null;
  activities: ActivityLog[];
  exercises: string[];
  volume: number;
}

/** The range's headline numbers, from the server rollup. */
interface RangeStats {
  workouts: number;
  totalVolume: number;
  strengthPct: number | null;
}

type Slice = "daily" | "lift" | "activity" | "stats";

const EMPTY_STATS: RangeStats = { workouts: 0, totalVolume: 0, strengthPct: null };

/**
 * History data for a range, loaded per source so one failing endpoint can't blank the
 * other two — and so a write only refetches the slice it changed.
 */
export function useHistory(rangeDays: number) {
  const dailyApi = useDailyLogsApi();
  const liftApi = useLiftLogsApi();
  const activityApi = useActivityApi();

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [liftLogs, setLiftLogs] = useState<LiftLog[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [rangeStats, setRangeStats] = useState<RangeStats>(EMPTY_STATS);
  const [errors, setErrors] = useState<Partial<Record<Slice, string>>>({});
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pendingRef = useRef(0);
  // One generation per slice: a range switch must not let a slow old daily
  // response overwrite the new one, while an in-flight lift load stays valid.
  // Destructured so the stable callbacks (not a fresh object) land in deps.
  const { begin: beginDaily, isCurrent: isCurrentDaily } = useLatest();
  const { begin: beginLift, isCurrent: isCurrentLift } = useLatest();
  const { begin: beginActivity, isCurrent: isCurrentActivity } = useLatest();
  const { begin: beginStats, isCurrent: isCurrentStats } = useLatest();

  // Live date (not mount-time): a midnight rollover re-runs the loaders, since the
  // window feeds their dependency chain.
  const to = useCurrentDate();
  const from = useMemo(() => addDays(to, -(rangeDays - 1)), [to, rangeDays]);
  const prevFrom = useMemo(() => addDays(from, -rangeDays), [from, rangeDays]);
  const prevTo = useMemo(() => addDays(from, -1), [from]);

  /** Runs one slice under its own generation guard, tracking error + loading. */
  const run = useCallback(
    async (
      slice: Slice,
      begin: () => number,
      isCurrent: (token: number) => boolean,
      task: (apply: (fn: () => void) => void) => Promise<void>,
      fallback: string,
    ) => {
      const token = begin();
      setErrors((prev) => ({ ...prev, [slice]: undefined }));
      pendingRef.current += 1;
      setLoading(true);
      const apply = (fn: () => void) => {
        if (isCurrent(token)) fn();
      };
      try {
        await task(apply);
      } catch (err) {
        if (isCurrent(token)) {
          setErrors((prev) => ({
            ...prev,
            [slice]: err instanceof Error ? err.message : fallback,
          }));
        }
      } finally {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) setLoading(false);
      }
    },
    [],
  );

  const loadDaily = useCallback(
    () =>
      run(
        "daily",
        beginDaily,
        isCurrentDaily,
        async (apply) => {
          const rows = await dailyApi.getDailyLogsRange(from, to);
          apply(() => setDailyLogs(rows));
        },
        "Failed to load your daily values",
      ),
    [run, dailyApi, from, to, beginDaily, isCurrentDaily],
  );

  const loadLift = useCallback(
    () =>
      run(
        "lift",
        beginLift,
        isCurrentLift,
        async (apply) => {
          const rows = await liftApi.getLiftLogsRange(from, to);
          apply(() => setLiftLogs(rows));
        },
        "Failed to load your lifts",
      ),
    [run, liftApi, from, to, beginLift, isCurrentLift],
  );

  const loadActivity = useCallback(
    () =>
      run(
        "activity",
        beginActivity,
        isCurrentActivity,
        async (apply) => {
          const rows = await activityApi.getActivityRange(from, to);
          apply(() => setActivityLogs(rows));
        },
        "Failed to load your activity",
      ),
    [run, activityApi, from, to, beginActivity, isCurrentActivity],
  );

  /**
   * The range's stats come from the rollup, not from the fetched rows: Strength has to
   * describe the selected range, and ISO-week-over-week did not.
   */
  const loadStats = useCallback(
    () =>
      run(
        "stats",
        beginStats,
        isCurrentStats,
        async (apply) => {
          const metrics = await liftApi.getLiftMetrics(from, to, prevFrom, prevTo);
          apply(() =>
            setRangeStats({
              workouts: metrics.days.length,
              totalVolume: metrics.exercises.reduce((sum, e) => sum + e.volume, 0),
              strengthPct: strengthChangePctFrom(metrics.exercises),
            }),
          );
        },
        "Failed to load your stats",
      ),
    [run, liftApi, from, to, prevFrom, prevTo, beginStats, isCurrentStats],
  );

  // Lift writes move the stats too, so they share one loader.
  const loadLiftSlice = useCallback(() => {
    loadLift();
    loadStats();
  }, [loadLift, loadStats]);

  useDataSyncOnFocus(["daily"], loadDaily);
  useDataSyncOnFocus(["lift"], loadLiftSlice);
  useDataSyncOnFocus(["activity"], loadActivity);

  const error =
    errors.daily ?? errors.lift ?? errors.activity ?? errors.stats ?? null;

  const retry = useCallback(() => {
    loadDaily();
    loadLiftSlice();
    loadActivity();
  }, [loadDaily, loadLiftSlice, loadActivity]);

  // Deletes revert locally and report through `mutationError` rather than throwing, so
  // a failed delete can't disappear without a word.
  const failMutation = (err: unknown, fallback: string) =>
    setMutationError(err instanceof Error ? err.message : fallback);

  const deleteDailyLog = useCallback(
    async (date: string) => {
      const removed = dailyLogs.find((d) => d.date === date);
      setDailyLogs((prev) => prev.filter((d) => d.date !== date));
      try {
        await dailyApi.deleteDailyLog(date);
      } catch (err) {
        if (removed) setDailyLogs((prev) => [...prev, removed]);
        failMutation(err, "Couldn't delete that day");
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
        failMutation(err, "Couldn't delete that set");
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
        failMutation(err, "Couldn't delete that activity");
      }
    },
    [activityApi, activityLogs],
  );

  const stats = useMemo(
    () => ({ ...rangeStats, daysLogged: dailyLogs.length }),
    [rangeStats, dailyLogs.length],
  );

  // Combined per-day view: every date that has a lift, a daily log, or an activity,
  // newest first. This is what the screen renders so the three sources sit together.
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
    days,
    stats,
    loading,
    error,
    mutationError,
    clearMutationError: useCallback(() => setMutationError(null), []),
    from,
    to,
    refetch: retry,
    deleteDailyLog,
    deleteLiftLog,
    deleteActivity,
  };
}
