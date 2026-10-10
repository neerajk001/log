import { useCallback, useEffect, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import type { LiftLog } from "../api/types";
import { addDays, todayLocal } from "../utils/date";

/**
 * Distinct exercises logged in the recent window (for quick re-entry), plus
 * the most recent prior set for each exercise — the "Last:" cue on the Lift
 * screen. Today's own sets are excluded, so "Last" always means the previous
 * session.
 */
export function useRecentExercises(days = 120) {
  const api = useLiftLogsApi();
  const [names, setNames] = useState<string[]>([]);
  const [lastByExercise, setLastByExercise] = useState<Map<string, LiftLog>>(new Map());

  const load = useCallback(async () => {
    try {
      const to = todayLocal();
      const logs = await api.getLiftLogsRange(addDays(to, -days), to);
      const seen: string[] = [];
      const latest = new Map<string, LiftLog>();
      for (const log of logs) {
        if (!seen.includes(log.exercise_name)) seen.push(log.exercise_name);
        if (log.date >= to) continue;
        const current = latest.get(log.exercise_name);
        if (
          !current ||
          log.date > current.date ||
          (log.date === current.date && Number(log.weight_kg) > Number(current.weight_kg))
        ) {
          latest.set(log.exercise_name, log);
        }
      }
      setNames(seen.slice(0, 12));
      setLastByExercise(latest);
    } catch {
      setNames([]);
      setLastByExercise(new Map());
    }
  }, [api, days]);

  useEffect(() => {
    load();
  }, [load]);

  return { names, lastByExercise, refetch: load };
}
