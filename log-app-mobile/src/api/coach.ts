import { useMemo } from "react";
import { fetch as expoFetch } from "expo/fetch";
import { API_BASE_URL, useApiClient } from "./client";
import type {
  AgentId,
  CoachMemory,
  CoachMessage,
  CoachProfile,
  CoachProfileInput,
  CoachProposal,
  CoachSession,
  ParsedPlanPreview,
} from "./types";

export function useCoachApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      getProfile: () => client.get<CoachProfile | null>("/api/coach/profile"),
      saveProfile: (data: CoachProfileInput) =>
        client.put<CoachProfile>("/api/coach/profile", data),
      getSessions: () => client.get<CoachSession[]>("/api/coach/sessions"),
      getSessionMessages: (id: string) =>
        client.get<{ agent: AgentId; messages: CoachMessage[] }>(
          `/api/coach/sessions/${id}/messages`,
        ),
      deleteSession: (id: string) => client.del<{ ok: true }>(`/api/coach/sessions/${id}`),
      getMemory: () => client.get<CoachMemory | null>("/api/coach/memory"),
      clearMemory: () => client.del<{ ok: true }>("/api/coach/memory"),
      chat: (message: string) => client.post<{ reply: string }>("/api/coach/chat", { message }),
      generatePlan: (body: { goal?: string; notes?: string }) =>
        client.post<ParsedPlanPreview>("/api/coach/plan", body),
      analyzePhoto: (formData: FormData) =>
        client.postFormData<{ analysis: string }>("/api/coach/analyze", formData),
    }),
    [client],
  );
}

/**
 * Streams a coach reply within a chat session. Uses `expo/fetch` (the global fetch
 * here) because it exposes a real `ReadableStream` body with `abort()` — React
 * Native's plain fetch does not. Calls `onDelta` per token, `onStatus` while a tool
 * runs, and `onSessionId` when the server creates the chat.
 */
export async function streamCoachChat({
  token,
  message,
  sessionId,
  localDate,
  agent,
  onDelta,
  onStatus,
  onSessionId,
  onProposal,
  signal,
}: {
  token: string | null;
  message: string;
  sessionId?: string | null;
  localDate?: string;
  agent?: AgentId;
  onDelta: (delta: string) => void;
  onStatus?: (status: string) => void;
  onSessionId?: (sessionId: string) => void;
  onProposal?: (proposal: CoachProposal) => void;
  signal?: AbortSignal;
}): Promise<string> {
  if (!token) throw new Error("Signed out. Please sign in again.");

  const res = await expoFetch(`${API_BASE_URL}/api/coach/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ message, sessionId: sessionId ?? undefined, localDate, agent }),
    signal,
  });

  if (!res.ok || !res.body) {
    let text = `The coach failed to reply (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) text = body.error.message;
    } catch {
      // keep the generic message
    }
    throw new Error(text);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let serverError: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload) continue;
      let event: {
        delta?: string;
        done?: boolean;
        error?: string;
        status?: string;
        sessionId?: string;
        proposal?: CoachProposal;
      };
      try {
        event = JSON.parse(payload) as typeof event;
      } catch {
        continue;
      }
      if (event.error) serverError = event.error;
      if (event.sessionId) onSessionId?.(event.sessionId);
      if (event.proposal) onProposal?.(event.proposal);
      if (typeof event.status === "string" && event.status.length > 0) onStatus?.(event.status);
      if (typeof event.delta === "string" && event.delta.length > 0) {
        full += event.delta;
        onDelta(event.delta);
      }
    }
  }

  if (serverError) throw new Error(serverError);
  return full;
}
