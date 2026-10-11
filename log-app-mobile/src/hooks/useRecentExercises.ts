import { useCallback, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import { useDataSyncOnFocus } from "./useDataSync";
import type { LiftLog } from "../api/types";
import { todayLocal } from "../utils/date";

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

  const load = useCallback(async () => {
    try {
      const summary = await api.getLiftSummary(days, todayLocal());
      setNames(summary.names);
      setLastByExercise(
        new Map(summary.last_by_exercise.map((log) => [log.exercise_name, log])),
      );
      setError(null);
    } catch (err) {
      // Keep the last good names and "Last:" cues — a blip shouldn't wipe them.
      setError(err instanceof Error ? err.message : "Failed to load recent exercises");
    }
  }, [api, days]);

  useDataSyncOnFocus(["lift"], load);

  return { names, lastByExercise, error, refetch: load };
}
