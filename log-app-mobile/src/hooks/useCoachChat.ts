import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import { usePostHog } from "posthog-react-native";
import { CoachStreamError, streamCoachChat, useCoachApi } from "../api/coach";
import { ApiError } from "../api/client";
import { clearAllCache } from "../api/cache";
import { captureTiming } from "../utils/perf";
import { useLatest } from "./useLatest";
import type { AgentId, CoachProposal, CoachUsage, DismissedMeal } from "../api/types";
import { todayLocal } from "../utils/date";

/** Asked the moment a meal estimate is dismissed — the answer becomes the correction. */
const CORRECTION_PROMPT = "No problem — what was off? Portion, an item, or the numbers?";

/**
 * Failures worth one automatic retry: transient upstream/transport problems
 * (provider unreachable, provider errored, empty reply, network drop). A
 * deterministic failure (validation, rate limit, truncation) is not retried —
 * repeating it would only burn quota and time.
 */
const AUTO_RETRY_CODES = new Set(["COACH_UNREACHABLE", "COACH_ERROR", "COACH_EMPTY", "NETWORK"]);

function isAutoRetryable(err: unknown): boolean {
  return err instanceof CoachStreamError && AUTO_RETRY_CODES.has(err.code);
}

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
export function useCoachChat(
  initialSessionId?: string,
  initialAgent?: AgentId,
  localDate: string = todayLocal(),
) {
  const api = useCoachApi();
  const { getToken, signOut } = useAuth();
  const posthog = usePostHog();
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId ?? null);
  const [agent, setAgent] = useState<AgentId>(initialAgent ?? "general");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [loading, setLoading] = useState(Boolean(initialSessionId));
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingCorrection, setPendingCorrection] = useState<DismissedMeal | null>(null);
  const { begin, isCurrent } = useLatest();
  const abortRef = useRef<AbortController | null>(null);
  /**
   * Synchronous in-flight flag: `streaming` state only lands on the next render,
   * so two taps in the same frame would both pass a state check and fire two
   * turns. This ref is set before any await, so the second tap sees it.
   */
  const streamingRef = useRef(false);

  const load = useCallback(async () => {
    if (!initialSessionId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const token = begin();
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSessionMessages(initialSessionId);
      if (!isCurrent(token)) return;
      setAgent(res.agent);
      setMessages(
        res.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          // Proposals persisted with the turn come back as live cards, so a
          // reopened chat can still confirm what the coach prepared.
          proposals: (m.proposals ?? []).map((proposal, i) => ({
            id: proposal.id ?? `${m.id}-p${i + 1}`,
            proposal,
            status: proposal.status,
          })),
        })),
      );
    } catch (err) {
      if (!isCurrent(token)) return;
      setError(err instanceof Error ? err.message : "Failed to load this chat");
    } finally {
      if (isCurrent(token)) setLoading(false);
    }
  }, [api, initialSessionId, begin, isCurrent]);

  useEffect(() => {
    load();
  }, [load]);

  // Abandon any in-flight stream when the screen unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const runStream = useCallback(
    async (
      message: string,
      appendUser: boolean,
      correction?: DismissedMeal | null,
      isRetry = false,
    ) => {
      const assistantId = `coach-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      streamingRef.current = true;
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
      // Phase 0: client-side turn timing (durations + agent only — never content).
      const t0 = Date.now();
      let firstDeltaAt: number | null = null;
      let aborted = false;
      let failed = false;
      let retried = false;
      /** Server-measured token facts for this turn, captured into analytics. */
      let usage: CoachUsage | null = null;
      // A retry must reuse the session attempt 0 created (a fresh session id
      // arrives mid-stream), or the server would create a second chat.
      let resolvedSessionId: string | null = sessionId;

      try {
        // One automatic retry for transient failures. The replayed turn carries
        // `retry: true`, so the server never stores the prompt twice.
        for (let attempt = 0; ; attempt++) {
          try {
            const token = await getToken();
            await streamCoachChat({
              token,
              message,
              sessionId: resolvedSessionId,
              localDate,
              agent,
              dismissedMeal: correction ?? undefined,
              retry: isRetry || attempt > 0,
              signal: controller.signal,
              onSessionId: (id) => {
                resolvedSessionId = id;
                setSessionId(id);
              },
              onDelta: (delta) => {
                setStatus(null);
                if (firstDeltaAt == null) firstDeltaAt = Date.now();
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, content: m.content + delta } : m,
                  ),
                );
              },
              onStatus: (next) => setStatus(next),
              onProposal: (proposal) => {
                proposalSeq += 1;
                const id = proposal.id ?? `${assistantId}-p${proposalSeq}`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, proposals: [...(m.proposals ?? []), { id, proposal }] }
                      : m,
                  ),
                );
              },
              onUsage: (u) => {
                usage = u;
              },
            });
            break;
          } catch (err) {
            const autoRetry =
              attempt === 0 && !controller.signal.aborted && isAutoRetryable(err);
            if (!autoRetry) throw err;
            // Wipe whatever the failed attempt left on the bubble and replay.
            retried = true;
            firstDeltaAt = null;
            usage = null;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: "", proposals: [] } : m,
              ),
            );
            setStatus("Retrying…");
          }
        }
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
          aborted = true;
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)),
          );
        } else {
          // Mirror useApiClient.wrap: an expired session signs out (clearing the
          // signed-out user's cache) instead of looking like "coach didn't reply".
          if (err instanceof ApiError && err.status === 401) {
            clearAllCache();
            try {
              await signOut();
            } catch {}
          }
          failed = true;
          setError(err instanceof Error ? err.message : "The coach didn't reply.");
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, failed: true } : m)),
          );
        }
      } finally {
        abortRef.current = null;
        streamingRef.current = false;
        setStreaming(false);
        setStatus(null);
        // Skip user-stopped turns: they measure impatience, not performance.
        if (!aborted) {
          captureTiming(posthog, "coach_turn", {
            total_ms: Date.now() - t0,
            ...(firstDeltaAt != null ? { first_delta_ms: firstDeltaAt - t0 } : {}),
            agent,
            failed: failed ? 1 : 0,
            ...(retried ? { retried: 1 } : {}),
          });
          // Token cost of the turn, straight from the provider's usage report.
          if (usage != null) {
            const u: CoachUsage = usage;
            captureTiming(posthog, "coach_tokens", {
              input_tokens: u.input_tokens,
              output_tokens: u.output_tokens,
              rounds: u.rounds,
              agent,
            });
          }
        }
      }
    },
    [getToken, signOut, posthog, sessionId, agent, localDate],
  );

  const send = useCallback(
    (text: string) => {
      const message = text.trim();
      if (!message || streamingRef.current || loading) return;
      // A dismissed meal rides along with the next thing the athlete says.
      const correction = pendingCorrection;
      if (correction) setPendingCorrection(null);
      void runStream(message, true, correction);
    },
    [runStream, pendingCorrection, loading],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  /** Switch agent in place: abandon the current turn and start a fresh chat. */
  const reset = useCallback((nextAgent?: AgentId) => {
    // Invalidate any in-flight history load before clearing the transcript.
    begin();
    abortRef.current?.abort();
    abortRef.current = null;
    streamingRef.current = false;
    setSessionId(null);
    setMessages([]);
    setLoading(false);
    setStreaming(false);
    setStatus(null);
    setError(null);
    setPendingCorrection(null);
    if (nextAgent) setAgent(nextAgent);
  }, [begin]);

  const retry = useCallback(() => {
    if (streamingRef.current || loading) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((prev) => prev.filter((m) => !m.failed));
    // `isRetry` tells the server the prompt is already stored — retrying must
    // not append the same user message to the transcript a second time.
    void runStream(lastUser.content, false, null, true);
  }, [messages, runStream, loading]);

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
      if (status !== "error") {
        const target = messagesRef.current
          .find((m) => m.id === messageId)
          ?.proposals?.find((p) => p.id === proposalId);
        const serverId = target?.proposal.id;
        // Plan updates are only really applied after the preview save; keep
        // those cards re-openable until then. Photo estimates have no stored
        // proposal, so there is nothing to update.
        if (serverId && target?.proposal.kind !== "plan_update") {
          // Persist the decision with the stored proposal so reopening the chat
          // never asks them to confirm the same change twice.
          void api.resolveProposal(serverId, status).catch(() => {});
        }
      }
    },
    [api],
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
        proposals: proposal
          ? [{ id: proposal.id ?? `${id}-p1`, proposal }]
          : undefined,
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
    reset,
    retry,
    resolveProposal,
    dismissMealProposal,
    injectAssistant,
    injectUser,
    refetch: load,
  };
}
