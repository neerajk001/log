import { useCallback, useEffect, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import { addDays, todayLocal } from "../utils/date";

/** Distinct exercises logged in the recent window, used for quick re-entry. */
export function useRecentExercises(days = 120) {
  const api = useLiftLogsApi();
  const [names, setNames] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const to = todayLocal();
      const logs = await api.getLiftLogsRange(addDays(to, -days), to);
      const seen: string[] = [];
      for (const l of logs) {
        if (!seen.includes(l.exercise_name)) seen.push(l.exercise_name);
      }
      setNames(seen.slice(0, 12));
    } catch {
      setNames([]);
    }
  }, [api, days]);

  useEffect(() => {
    load();
  }, [load]);

  return { names, refetch: load };
}
