import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useCoachApi } from "../api/coach";
import type { CoachSession } from "../api/types";

/** Chat history: the user's coach sessions, newest first. */
export function useCoachSessions() {
  const api = useCoachApi();
  const [sessions, setSessions] = useState<CoachSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSessions(await api.getSessions());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your chats");
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Refresh whenever the list regains focus (e.g. after a new chat).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

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
