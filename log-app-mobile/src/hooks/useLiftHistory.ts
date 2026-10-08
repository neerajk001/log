import { useCallback, useEffect, useState } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import type { LiftLog } from "../api/types";

/** Past logs for a single exercise (design's "View History"). */
export function useLiftHistory(exercise: string | null, weeks = 8) {
  const api = useLiftLogsApi();
  const [logs, setLogs] = useState<LiftLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!exercise) {
      setLogs([]);
      setLoaded(false);
      return;
    }
    setLoading(true);
    setLoaded(false);
    setError(null);
    try {
      setLogs(await api.getLiftHistory(exercise, weeks));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [api, exercise, weeks]);

  useEffect(() => {
    load();
  }, [load]);

  return { logs, loading, loaded, error, refetch: load };
}
