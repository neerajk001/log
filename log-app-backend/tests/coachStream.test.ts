/**
 * Phase 1 verification: the coach SSE endpoint delivers tokens progressively
 * through the REAL Express stack (helmet, compression with its SSE bypass,
 * JSON limits, validation, rate limiting, request timing).
 *
 * Auth and the AI service are mocked at the module boundary; everything between
 * the socket and `runCoachChatStream` is production code. If Express (or the
 * compression filter) buffered the stream, deltas emitted 60ms apart would
 * arrive in one burst at the end instead of spread over time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";

vi.mock("../src/middleware/auth", () => ({
  requireAuth: (req: { userId?: string }, _res: unknown, next: () => void) => {
    req.userId = "user-1";
    next();
  },
}));

/**
 * Deterministic Clerk stub for app-level tests.
 *
 * The real `@clerk/express` middleware builds an AuthenticateContext on every
 * request and fatally asserts a valid publishable key (keyless environments
 * throw "Publishable key is missing."), which makes any app-booting test
 * depend on Clerk key material being present. These suites stub the auth
 * later (`src/middleware/auth` above), so the middleware is replaced with a
 * pass-through: routing, validation, SSE and DB behavior — the actual
 * subjects — stay production code. Production keeps the real middleware.
 */
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
}));

const hooks = vi.hoisted(() => ({
  runCoachChatStream: vi.fn(),
}));

vi.mock("../src/services/coach", () => ({
  analyzePhysique: vi.fn(),
  generateCoachPlan: vi.fn(),
  runCoachChatStream: hooks.runCoachChatStream,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { Express } from "express";
import app from "../src/app";

let server: ReturnType<Express["listen"]> | null = null;

beforeEach(() => {
  hooks.runCoachChatStream.mockReset();
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
  vi.unstubAllGlobals();
});

async function listen(): Promise<string> {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const port = (server!.address() as AddressInfo).port;
  return `http://127.0.0.1:${port}`;
}

interface TimedEvent {
  at: number;
  payload: Record<string, unknown>;
}

async function readStream(
  res: Response,
  timeoutMs = 5000,
): Promise<{ events: TimedEvent[]; headersAt: number; status: number }> {
  const startedAt = Date.now();
  const events: TimedEvent[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = setTimeout(() => {
    throw new Error("stream read timed out");
  }, timeoutMs);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        try {
          events.push({ at: Date.now() - startedAt, payload: JSON.parse(trimmed.slice(5)) });
        } catch {
          // ignore partial frames
        }
      }
    }
  } finally {
    clearTimeout(deadline);
  }
  return { events, headersAt: 0, status: res.status };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("POST /api/coach/chat/stream transport", () => {
  it("sends SSE headers and delivers deltas progressively, not in one end burst", async () => {
    hooks.runCoachChatStream.mockImplementation(
      async (
        _userId: string,
        _session: null,
        _msg: string,
        _today: string,
        handlers: {
          onSession: (id: string) => void;
          onDelta: (d: string) => void;
        },
      ) => {
        handlers.onSession("session-1");
        for (const token of ["Hello", " ", "there"]) {
          await sleep(60);
          handlers.onDelta(token);
        }
        return "Hello there";
      },
    );

    const base = await listen();
    const res = await fetch(`${base}/api/coach/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");

    const { events } = await readStream(res);
    const kinds = events.map((e) =>
      "delta" in e.payload ? "delta" : "done" in e.payload ? "done" : Object.keys(e.payload)[0],
    );
    expect(kinds[0]).toBe("sessionId");
    const deltas = events.filter((e) => "delta" in e.payload);
    expect(deltas.map((e) => e.payload.delta)).toEqual(["Hello", " ", "there"]);
    expect(kinds[kinds.length - 1]).toBe("done");

    // Progressive, not buffered: the first token lands ~60ms after headers while
    // the whole turn takes ~180ms+. A buffering layer would collapse all three
    // deltas to (near-)identical arrival times at the very end. (Event clocks
    // start when headers arrive, so the spread is the signal, not the offset.)
    expect(deltas[0].at).toBeLessThan(150);
    const lastDeltaAt = deltas[deltas.length - 1].at;
    expect(lastDeltaAt - deltas[0].at).toBeGreaterThanOrEqual(80);
  }, 15000);

  it("ends the stream promptly when the client disconnects", async () => {
    let calls = 0;
    hooks.runCoachChatStream.mockImplementation(
      async (
        _u: string,
        _s: null,
        _m: string,
        _t: string,
        handlers: { onDelta: (d: string) => void },
        _a: unknown,
        signal?: AbortSignal,
      ) => {
        for (;;) {
          if (signal?.aborted) return "stopped";
          calls += 1;
          handlers.onDelta("tok");
          await sleep(20);
        }
      },
    );

    const base = await listen();
    const controller = new AbortController();
    const res = await fetch(`${base}/api/coach/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "go" }),
      signal: controller.signal,
    });
    expect(res.status).toBe(200);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let sawToken = false;
    const abortAt = Date.now();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text.includes("tok")) {
        sawToken = true;
        controller.abort();
        break;
      }
      if (Date.now() - abortAt > 5000) throw new Error("no token arrived");
    }
    expect(sawToken).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(1);
    // The aborted fetch rejects; the server side must observe `close` and stop.
    await expect(reader.read()).rejects.toThrow();
    await sleep(150);
  }, 15000);

  it("surfaces a known (AppError) failure as its friendly message", async () => {
    const { AppError } = await import("../src/middleware/errorHandler");
    hooks.runCoachChatStream.mockRejectedValue(
      new AppError(502, "COACH_UNREACHABLE", "I can't reach the coach right now - try again."),
    );

    const base = await listen();
    const res = await fetch(`${base}/api/coach/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(200);

    const { events } = await readStream(res);
    const errors = events.filter((e) => typeof e.payload.error === "string");
    expect(errors).toHaveLength(1);
    expect(errors[0].payload.error).toContain("can't reach the coach");
    expect(errors[0].payload.code).toBe("COACH_UNREACHABLE");
  }, 15000);

  it("never leaks raw internals for unexpected failures", async () => {
    // Exactly what a transient DB failure looks like from the route's view.
    hooks.runCoachChatStream.mockRejectedValue(
      new Error("Invalid `prisma.coachMemory.findUnique()` invocation: Raw query failed"),
    );

    const base = await listen();
    const res = await fetch(`${base}/api/coach/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(200);

    const text = await res.text();
    expect(text).not.toContain("prisma");
    const events = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => JSON.parse(line.slice(5).trim()) as { error?: string; code?: string });
    const errors = events.filter((e) => typeof e.error === "string");
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toContain("unexpected problem");
    expect(errors[0].code).toBe("COACH_UNEXPECTED");
  }, 15000);

  it("rejects invalid bodies with 400 before any streaming starts", async () => {
    const base = await listen();
    const res = await fetch(`${base}/api/coach/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    expect(res.status).toBe(400);
    expect(hooks.runCoachChatStream).not.toHaveBeenCalled();
  }, 15000);
});
