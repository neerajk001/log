import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { streamCoachChat, useCoachApi } from "../api/coach";
import type { AgentId, CoachProposal, DismissedMeal } from "../api/types";
import { todayLocal } from "../utils/date";

/** Asked the moment a meal estimate is dismissed — the answer becomes the correction. */
const CORRECTION_PROMPT = "No problem — what was off? Portion, an item, or the numbers?";

export interface ChatProposal {
  id: string;
  proposal: CoachProposal;
  status?: "applied" | "dismissed" | "error";
  note?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Assistant bubble is still receiving tokens. */
  streaming?: boolean;
  /** The stream failed (or produced nothing) — offer retry. */
  failed?: boolean;
  /** Changes the coach prepared during this reply, awaiting confirmation. */
  proposals?: ChatProposal[];
}

/** Coach chat for one session (or a fresh one when `initialSessionId` is absent). */
export function useCoachChat(initialSessionId?: string, initialAgent?: AgentId) {
  const api = useCoachApi();
  const { getToken } = useAuth();
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [agent, setAgent] = useState<AgentId>(initialAgent ?? "general");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(initialSessionId));
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCorrection, setPendingCorrection] = useState<DismissedMeal | null>(null);
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
      const res = await api.getSessionMessages(initialSessionId);
      setAgent(res.agent);
      setMessages(res.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })));
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
    async (message: string, appendUser: boolean, correction?: DismissedMeal | null) => {
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
      let proposalSeq = 0;

      try {
        const token = await getToken();
        await streamCoachChat({
          token,
          message,
          sessionId,
          localDate: todayLocal(),
          agent,
          dismissedMeal: correction ?? undefined,
          signal: controller.signal,
          onSessionId: (id) => setSessionId(id),
          onDelta: (delta) => {
            setStatus(null);
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + delta } : m)),
            );
          },
          onStatus: (next) => setStatus(next),
          onProposal: (proposal) => {
            proposalSeq += 1;
            const id = `${assistantId}-p${proposalSeq}`;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, proposals: [...(m.proposals ?? []), { id, proposal }] }
                  : m,
              ),
            );
          },
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, streaming: false, failed: m.content.length === 0 && !m.proposals?.length }
              : m,
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
    [getToken, sessionId, agent],
  );

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || streaming) return;
      // A dismissed meal rides along with the next thing the athlete says.
      const correction = pendingCorrection;
      if (correction) setPendingCorrection(null);
      void runStream(message, true, correction);
    },
    [runStream, streaming, pendingCorrection],
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

  const resolveProposal = useCallback(
    (messageId: string, proposalId: string, status: "applied" | "dismissed" | "error", note?: string) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                proposals: (m.proposals ?? []).map((p) =>
                  p.id === proposalId ? { ...p, status, note } : p,
                ),
              }
            : m,
        ),
      );
    },
    [],
  );

  /**
   * A local-only athlete bubble. The photo path isn't a chat turn (it goes to the meal
   * analyser, not the model), so the caption they typed has to be shown here or it
   * vanishes the moment they send it.
   */
  const injectUser = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `local-u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        role: "user",
        content: text,
      },
    ]);
  }, []);

  const injectAssistant = useCallback((text: string, proposal?: CoachProposal) => {
    const id = `local-a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setMessages((prev) => [
      ...prev,
      {
        id,
        role: "assistant",
        content: text,
        proposals: proposal ? [{ id: `${id}-p1`, proposal }] : undefined,
      },
    ]);
  }, []);

  /**
   * Dismissing a meal estimate isn't the end of it: the coach asks what was off and
   * keeps the estimate, so the athlete's answer re-estimates from their correction
   * instead of repeating the same numbers.
   */
  const dismissMealProposal = useCallback(
    (messageId: string, proposalId: string, proposal: CoachProposal) => {
      if (proposal.kind !== "meal_log" && proposal.kind !== "meal_update") return;
      resolveProposal(messageId, proposalId, "dismissed");
      setPendingCorrection({
        title: proposal.title,
        items: proposal.items,
        calories: proposal.calories,
        protein_g: proposal.protein_g,
        date: proposal.date,
      });
      injectAssistant(CORRECTION_PROMPT);
    },
    [injectAssistant, resolveProposal],
  );

  return {
    sessionId,
    agent,
    setAgent,
    messages,
    loading,
    streaming,
    status,
    error,
    send,
    stop,
    retry,
    resolveProposal,
    dismissMealProposal,
    injectAssistant,
    injectUser,
    refetch: load,
  };
}
