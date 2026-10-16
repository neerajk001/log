import { useCallback, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import { useDataSyncOnFocus } from "./useDataSync";
import { useCurrentDate } from "./useCurrentDate";
import { useLatest } from "./useLatest";
import type { LiftLog } from "../api/types";

/**
 * Distinct exercises logged in the recent window (for quick re-entry), plus the top
 * set from each one's last session — the "Last:" cue on the Lift screen. Today's own
 * sets are excluded, so "Last" always means the previous session.
 *
 * Computed server-side: this used to download every set of the last four months.
 */
export function useRecentExercises(days = 120) {
  const api = useLiftLogsApi();
  const [names, setNames] = useState<string[]>([]);
  const [lastByExercise, setLastByExercise] = useState<Map<string, LiftLog>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();
  // Live "today": at midnight the window moves, so the "Last:" cue must refetch.
  const today = useCurrentDate();

  const load = useCallback(async () => {
    const token = begin();
    try {
      const summary = await api.getLiftSummary(days, today);
      if (!isCurrent(token)) return;
      setNames(summary.names);
      setLastByExercise(
        new Map(summary.last_by_exercise.map((log) => [log.exercise_name, log])),
      );
      setError(null);
    } catch (err) {
      if (!isCurrent(token)) return;
      // Keep the last good names and "Last:" cues — a blip shouldn't wipe them.
      setError(err instanceof Error ? err.message : "Failed to load recent exercises");
    }
  }, [api, days, today, begin, isCurrent]);

  useDataSyncOnFocus(["lift"], load);

  return { names, lastByExercise, error, refetch: load };
}
