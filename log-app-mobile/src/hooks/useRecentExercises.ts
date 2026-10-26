import { useCallback, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import { useDataSyncOnFocus } from "./useDataSync";
import { useCurrentDate } from "./useCurrentDate";
import { useLatest } from "./useLatest";
import type { LastSessionSets, LiftLog } from "../api/types";

/**
 * Distinct exercises logged in the recent window (for quick re-entry), the top set
 * from each one's last session — the "Last:" cue on the Lift screen — and that
 * session's full set list, so each row can be pre-filled set by set. Today's own
 * sets are excluded, so "Last" always means the previous session.
 *
 * Computed server-side: this used to download every set of the last four months.
 */
export function useRecentExercises(days = 120) {
  const api = useLiftLogsApi();
  const [names, setNames] = useState<string[]>([]);
  const [lastByExercise, setLastByExercise] = useState<Map<string, LiftLog>>(new Map());
  const [lastSetsByExercise, setLastSetsByExercise] = useState<Map<string, LastSessionSets>>(
    new Map(),
  );
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
      setLastSetsByExercise(new Map(Object.entries(summary.last_sets_by_exercise ?? {})));
      setError(null);
    } catch (err) {
      if (!isCurrent(token)) return;
      // Keep the last good names and "Last:" cues — a blip shouldn't wipe them.
      setError(err instanceof Error ? err.message : "Failed to load recent exercises");
    }
  }, [api, days, today, begin, isCurrent]);

  useDataSyncOnFocus(["lift"], load);

  return { names, lastByExercise, lastSetsByExercise, error, refetch: load };
}
