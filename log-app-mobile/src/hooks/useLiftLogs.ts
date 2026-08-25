import { useState, useEffect, useCallback } from "react";
import { useLiftLogsApi } from "../api/liftLogs";
import type { LiftLog, LiftLogCreate } from "../api/types";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useLiftLogs() {
  const api = useLiftLogsApi();
  const [entries, setEntries] = useState<LiftLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await api.getLiftLogsByDate(today());
      setEntries(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const addEntry = useCallback(
    async (data: LiftLogCreate): Promise<LiftLog> => {
      setError(null);

      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const optimistic: LiftLog = {
        id: tempId,
        date: data.date,
        exercise_name: data.exercise_name,
        weight_kg: data.weight_kg,
        reps: data.reps,
        plan_day_id: data.plan_day_id ?? null,
      };
      setEntries((prev) => [optimistic, ...prev]);

      try {
        const saved = await api.createLiftLog(data);
        setEntries((prev) =>
          prev.map((e) => (e.id === tempId ? saved : e)),
        );
        return saved;
      } catch (err) {
        setEntries((prev) => prev.filter((e) => e.id !== tempId));
        setError(err instanceof Error ? err.message : "Failed to save lift");
        throw err;
      }
    },
    [api],
  );

  return {
    entries,
    loading,
    error,
    addEntry,
    refetch: fetch,
  };
}

