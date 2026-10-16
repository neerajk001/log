import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useCoachApi } from "../api/coach";
import { useDataSync } from "./useDataSync";
import { useLatest } from "./useLatest";
import type { CoachSession } from "../api/types";

/** Chat history: the user's coach sessions, newest first. */
export function useCoachSessions() {
  const api = useCoachApi();
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { begin, isCurrent } = useLatest();

  const load = useCallback(async () => {
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const next = await api.getSessions();
      // A delete (or a streak of focus refetches) can land while a slow load is
      // in flight; only the newest response commits.
      if (!isCurrent(token)) return;
      setSessions(next);
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load your chats");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, begin, isCurrent]);

  // Refresh whenever the list regains focus (e.g. after a new chat), or when a
  // streamed turn creates/renames one.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useDataSync(["coach"], load);

  const remove = useCallback(
    async (id: string) => {
      const removed = sessions.find((s) => s.id === id) ?? null;
      setSessions((prev) => prev.filter((s) => s.id !== id));
      try {
        await api.deleteSession(id);
      } catch (err) {
        if (removed) setSessions((prev) => [removed, ...prev]);
        setError(err instanceof Error ? err.message : "Failed to delete the chat");
      }
    },
    [api, sessions],
  );

  return { sessions, loading, error, remove, refetch: load };
}
