import { useCallback, useEffect, useState } from "react";
import { useCoachApi } from "../api/coach";
import type { CoachMessage } from "../api/types";

/** Coach chat: loads history, sends messages optimistically. */
export function useCoachChat() {
  const api = useCoachApi();
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMessages(await api.getMessages());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || sending) return;
      setError(null);
      setSending(true);
      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, role: "user", content: message, created_at: new Date().toISOString() },
      ]);
      try {
        const { reply } = await api.chat(message);
        setMessages((prev) => [
          ...prev,
          { id: `coach-${Date.now()}`, role: "assistant", content: reply, created_at: new Date().toISOString() },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "The coach didn't reply. Try again.");
      } finally {
        setSending(false);
      }
    },
    [api, sending],
  );

  return { messages, loading, sending, error, send, refetch: load };
}
