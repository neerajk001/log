import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { streamCoachChat, useCoachApi } from "../api/coach";
import { todayLocal } from "../utils/date";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Assistant bubble is still receiving tokens. */
  streaming?: boolean;
  /** The stream failed (or produced nothing) — offer retry. */
  failed?: boolean;
}

/** Coach chat for one session (or a fresh one when `initialSessionId` is absent). */
export function useCoachChat(initialSessionId?: string) {
  const api = useCoachApi();
  const { getToken } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(initialSessionId));
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!initialSessionId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const history = await api.getSessionMessages(initialSessionId);
      setMessages(history.map((m) => ({ id: m.id, role: m.role, content: m.content })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load this chat");
    } finally {
      setLoading(false);
    }
  }, [api, initialSessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Abandon any in-flight stream when the screen unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runStream = useCallback(
    async (message: string, appendUser: boolean) => {
      const assistantId = `coach-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setError(null);
      setStatus(null);
      setStreaming(true);
      setMessages((prev) => [
        ...prev,
        ...(appendUser
          ? [{ id: `local-${Date.now()}`, role: "user" as const, content: message }]
          : []),
        { id: assistantId, role: "assistant" as const, content: "", streaming: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const token = await getToken();
        await streamCoachChat({
          token,
          message,
          sessionId,
          localDate: todayLocal(),
          signal: controller.signal,
          onSessionId: (id) => setSessionId(id),
          onDelta: (delta) => {
            setStatus(null);
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
            );
          },
          onStatus: (next) => setStatus(next),
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false, failed: m.content.length === 0 } : m,
          ),
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          // Stopped by the user — keep whatever streamed.
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
          );
        } else {
          setError(err instanceof Error ? err.message : "The coach didn't reply.");
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, failed: true } : m)),
          );
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        setStatus(null);
      }
    },
    [getToken, sessionId],
  );

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || streaming) return;
      void runStream(message, true);
    },
    [runStream, streaming],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const retry = useCallback(() => {
    if (streaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((prev) => prev.filter((m) => !m.failed));
    void runStream(lastUser.content, false);
  }, [messages, runStream, streaming]);

  return { sessionId, messages, loading, streaming, status, error, send, stop, retry, refetch: load };
}
