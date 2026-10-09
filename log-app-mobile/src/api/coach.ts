import { useMemo } from "react";
import { fetch as expoFetch } from "expo/fetch";
import { API_BASE_URL, useApiClient } from "./client";
import type { CoachMessage, CoachProfile, CoachProfileInput, ParsedPlanPreview } from "./types";

export function useCoachApi() {
  const client = useApiClient();

  return useMemo(
    () => ({
      getProfile: () => client.get<CoachProfile | null>("/api/coach/profile"),
      saveProfile: (data: CoachProfileInput) =>
        client.put<CoachProfile>("/api/coach/profile", data),
      getMessages: () => client.get<CoachMessage[]>("/api/coach/messages"),
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
 * Streams a coach reply. Uses `expo/fetch` (the global fetch here) because it
 * exposes a real `ReadableStream` body with `abort()` — React Native's plain
 * fetch does not. Calls `onDelta` for each token and resolves with the full text.
 */
export async function streamCoachChat({
  token,
  message,
  onDelta,
  onStatus,
  signal,
}: {
  token: string | null;
  message: string;
  onDelta: (delta: string) => void;
  onStatus?: (status: string) => void;
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
    body: JSON.stringify({ message }),
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
      let event: { delta?: string; done?: boolean; error?: string; status?: string };
      try {
        event = JSON.parse(payload) as typeof event;
      } catch {
        continue;
      }
      if (event.error) serverError = event.error;
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
