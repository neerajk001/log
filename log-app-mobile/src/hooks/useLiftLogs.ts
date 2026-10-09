import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as Crypto from "expo-crypto";
import { useLiftLogsApi } from "../api/liftLogs";
import type { LiftLog, LiftLogCreate } from "../api/types";

export function useLiftLogs(date: string) {
  const api = useLiftLogsApi();
  const [entries, setEntries] = useState<LiftLog[]>([]);
  const entriesRef = useRef<LiftLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Map<string, Promise<LiftLog>>>(new Map());
  const loadSequenceRef = useRef(0);

  const applyEntries = useCallback((next: LiftLog[] | ((current: LiftLog[]) => LiftLog[])) => {
    const value = typeof next === "function" ? next(entriesRef.current) : next;
    entriesRef.current = value;
    setEntries(value);
  }, []);

  const setPending = useCallback((id: string, pending: boolean) => {
    const next = new Set(pendingIdsRef.current);
    if (pending) next.add(id);
    else next.delete(id);
    pendingIdsRef.current = next;
    setPendingIds(next);
  }, []);

  const load = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const fetched = await api.getLiftLogsRange(date, date);
      if (sequence !== loadSequenceRef.current) return;
      const fetchedIds = new Set(fetched.map((entry) => entry.id));
      const pending = entriesRef.current.filter(
        (entry) => pendingIdsRef.current.has(entry.id) && !fetchedIds.has(entry.id),
      );
      applyEntries([...pending, ...fetched]);
    } catch (err) {
      if (sequence !== loadSequenceRef.current) return;
      setLoadError(err instanceof Error ? err.message : "Failed to load lifts");
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, [api, applyEntries, date]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addEntry = useCallback(
    async (data: LiftLogCreate): Promise<LiftLog> => {
      const id = data.id ?? Crypto.randomUUID();
      const existingRequest = inFlightRef.current.get(id);
      if (existingRequest) return existingRequest;

      const requestData: LiftLogCreate = { ...data, id };
      const alreadyPresent = entriesRef.current.some((entry) => entry.id === id);
      setMutationError(null);
      setPending(id, true);
      if (!alreadyPresent) {
        applyEntries((current) => [
          {
            id,
            date: requestData.date,
            exercise_name: requestData.exercise_name,
            weight_kg: requestData.weight_kg,
            reps: requestData.reps,
            plan_day_id: requestData.plan_day_id ?? null,
          },
          ...current,
        ]);
      }

      if (__DEV__) {
        console.log("[lift] -> POST /api/logs/lift", requestData);
      }

      const request = api
        .createLiftLog(requestData)
        .then((saved) => {
          if (__DEV__) console.log("[lift] <- saved", saved);
          applyEntries((current) => {
            const exists = current.some((entry) => entry.id === id);
            return exists
              ? current.map((entry) => (entry.id === id ? saved : entry))
              : [saved, ...current];
          });
          return saved;
        })
        .catch((err) => {
          if (__DEV__) {
            console.warn("[lift] x save failed", id, err instanceof Error ? err.message : err);
          }
          if (!alreadyPresent) {
            applyEntries((current) => current.filter((entry) => entry.id !== id));
          }
          setMutationError(err instanceof Error ? err.message : "Failed to save lift");
          throw err;
        })
        .finally(() => {
          inFlightRef.current.delete(id);
          setPending(id, false);
        });

      inFlightRef.current.set(id, request);
      return request;
    },
    [api, applyEntries, setPending],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      if (pendingIdsRef.current.has(id)) return;
      const removed = entriesRef.current.find((entry) => entry.id === id);
      applyEntries((current) => current.filter((entry) => entry.id !== id));
      setMutationError(null);
      try {
        await api.deleteLiftLog(id);
      } catch (err) {
        if (removed) applyEntries((current) => [removed, ...current]);
        setMutationError(err instanceof Error ? err.message : "Failed to delete set");
        throw err;
      }
    },
    [api, applyEntries],
  );

  const clearMutationError = useCallback(() => setMutationError(null), []);

  return {
    entries,
    loading,
    error: loadError ?? mutationError,
    loadError,
    mutationError,
    pendingIds,
    addEntry,
    deleteEntry,
    clearMutationError,
    refetch: load,
  };
}
