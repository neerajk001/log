import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useLiftLogsApi } from "../api/liftLogs";
import type { LiftLog, LiftLogCreate } from "../api/types";

/** Today's (or a given date's) logged lift sets, with optimistic add/delete. */
export function useLiftLogs(date: string) {
  const api = useLiftLogsApi();
  const [entries, setEntries] = useState<LiftLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await api.getLiftLogsRange(date, date));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lifts");
    } finally {
      setLoading(false);
    }
  }, [api, date]);

  // useFocusEffect fires on mount too, so no separate useEffect — otherwise
  // the screen would fetch the same range twice on first open.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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
        setEntries((prev) => prev.map((e) => (e.id === tempId ? saved : e)));
        return saved;
      } catch (err) {
        setEntries((prev) => prev.filter((e) => e.id !== tempId));
        const message = err instanceof Error ? err.message : "Failed to save lift";
        setError(message);
        throw err;
      }
    },
    [api],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      if (id.startsWith("pending-")) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        return;
      }
      const removed = entries.find((e) => e.id === id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      try {
        await api.deleteLiftLog(id);
      } catch (err) {
        if (removed) setEntries((prev) => [removed, ...prev]);
        setError(err instanceof Error ? err.message : "Failed to delete set");
        throw err;
      }
    },
    [api, entries],
  );

  return { entries, loading, error, addEntry, deleteEntry, refetch: load };
}
