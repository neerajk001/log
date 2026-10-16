/**
 * Full-stack integration suite against a real Postgres (TEST_DATABASE_URL).
 *
 * What is real here: Express routing, validation, rate limiting, services,
 * Prisma and the database. The only mock is `requireAuth`, which maps the
 * `x-test-user-id` header to `req.userId` — every ownership check downstream
 * is the production code path, which is what makes the two-account isolation
 * tests meaningful.
 *
 * Self-skips without TEST_DATABASE_URL (see helpers). CI sets it plus
 * VITEST_REQUIRE_DB=1 so the tests can never silently skip there.
 */
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  asUser,
  bootTestApp,
  createUser,
  describeDb,
  testPrisma,
  truncateAll,
  type TestApp,
} from "./helpers";

vi.mock("../../src/middleware/auth", () => ({
  findOrCreateUserByClerkId: vi.fn(),
  requireAuth: (
    req: { headers: Record<string, unknown>; userId?: string },
    res: { status: (n: number) => { json: (b: unknown) => void } },
    next: () => void,
  ) => {
    const userId = req.headers["x-test-user-id"];
    if (typeof userId !== "string" || userId.length === 0) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "test auth: missing x-test-user-id" },
      });
      return;
    }
    req.userId = userId;
    next();
  },
}));

/**
 * Deterministic Clerk stub for app-level tests.
 *
 * The real `@clerk/express` middleware builds an AuthenticateContext on every
 * request and fatally asserts a valid publishable key (keyless environments
 * throw "Publishable key is missing."), which makes these DB/route assertions
 * depend on Clerk key material being present. Auth is stubbed below
 * (`src/middleware/auth`), so the middleware becomes a pass-through and the
 * 401 contract is still asserted through the mocked `requireAuth`.
 */
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
}));

const MEAL_DATE = "2026-10-10";
const mealBody = (patch: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  date: MEAL_DATE,
  title: "Breakfast",
  items: [{ name: "Roti", quantity: "2 medium", calories: 240, protein_g: 6 }],
  calories: 240,
  protein_g: 6,
  source: "ai",
  ...patch,
});

describeDb("full-stack API against a real database", () => {
  let app: TestApp;

  beforeAll(async () => {
    await truncateAll();
    app = await bootTestApp();
  });

  afterAll(async () => {
    await app.close();
    const prisma = await testPrisma();
    await prisma.$disconnect();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("auth contract", () => {
    it("rejects an unauthenticated request with 401", async () => {
      const res = await fetch(`${app.base}/api/me`);
      expect(res.status).toBe(401);
    });
  });

  describe("meals: ledger, idempotency and isolation", () => {
    it("replays a same-id retry, 409s a changed payload, and keeps the day exact", async () => {
      const prisma = await testPrisma();
      const alice = await createUser("meals-alice");
      const bob = await createUser("meals-bob");
      const a = asUser(app, alice);

      const body = mealBody();
      const first = await a("/api/meals", { method: "POST", body: JSON.stringify(body) });
      expect(first.status).toBe(201);

      const replay = await a("/api/meals", { method: "POST", body: JSON.stringify(body) });
      expect(replay.status).toBe(200);
      expect(((await replay.json()) as { id: string }).id).toBe(body.id);

      const conflict = await a("/api/meals", {
        method: "POST",
        body: JSON.stringify({ ...body, calories: 300, protein_g: 20 }),
      });
      expect(conflict.status).toBe(409);
      expect(((await conflict.json()) as { error: { code: string } }).error.code).toBe(
        "IDEMPOTENCY_CONFLICT",
      );

      // The merged day ledger carries exactly one meal's macros.
      const day = await prisma.dailyLog.findUnique({
        where: { userId_date: { userId: alice, date: new Date(MEAL_DATE) } },
      });
      expect({ calories: day?.calories, protein: day?.proteinG }).toEqual({
        calories: 240,
        protein: 6,
      });
      expect(await prisma.mealLog.count({ where: { userId: alice } })).toBe(1);

      // Bob sees nothing.
      const bMeals = await asUser(app, bob)(`/api/meals?date=${MEAL_DATE}`);
      expect(((await bMeals.json()) as { meals: unknown[] }).meals).toEqual([]);
      expect(await prisma.mealLog.count({ where: { userId: bob } })).toBe(0);
    });

    // The compare-and-swap stale-edit guard is covered deterministically by the
    // mocked service suite (tests/meals.test.ts, "refuses a stale edit"): its
    // race window is milliseconds and cannot be forced through HTTP without
    // instrumenting the service.

    it("does not lose deltas when meals land concurrently (atomic ledger)", async () => {
      const prisma = await testPrisma();
      const carol = await createUser("meals-carol");
      const a = asUser(app, carol);
      const date = "2026-10-11";

      const bodies = Array.from({ length: 5 }, () => mealBody({ date, calories: 100, protein_g: 10 }));
      const results = await Promise.all(
        bodies.map((body) => a("/api/meals", { method: "POST", body: JSON.stringify(body) })),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);

      const day = await prisma.dailyLog.findUnique({
        where: { userId_date: { userId: carol, date: new Date(date) } },
      });
      expect(day?.calories).toBe(500);
      expect(day?.proteinG).toBe(50);
      expect(await prisma.mealLog.count({ where: { userId: carol } })).toBe(5);
    });
  });

  describe("lift logs: idempotency, isolation and edit recovery", () => {
    it("replays by id, conflicts on change, and other accounts cannot see or delete the set", async () => {
      const id = randomUUID();
      const payload = {
        id,
        date: "2026-10-12",
        exercise_name: "Barbell Bench Press",
        weight_kg: 62.5,
        reps: 8,
      };
      const eve = await createUser("lifts-eve");
      const frank = await createUser("lifts-frank");
      const a = asUser(app, eve);

      expect((await a("/api/logs/lift", { method: "POST", body: JSON.stringify(payload) })).status).toBe(201);
      expect((await a("/api/logs/lift", { method: "POST", body: JSON.stringify(payload) })).status).toBe(200);
      const changed = await a("/api/logs/lift", {
        method: "POST",
        body: JSON.stringify({ ...payload, weight_kg: 65 }),
      });
      expect(changed.status).toBe(409);

      const b = asUser(app, frank);
      const bList = await b("/api/logs/lift?from=2026-10-12&to=2026-10-12");
      expect(await bList.json()).toEqual([]);
      expect((await b(`/api/logs/lift/${id}`, { method: "DELETE" })).status).toBe(404);

      // The owner's edit path (used after a lost response) stays available.
      const updated = await a(`/api/logs/lift/${id}`, {
        method: "PUT",
        body: JSON.stringify({ weight_kg: 65, reps: 8 }),
      });
      expect(updated.status).toBe(200);
      expect(((await updated.json()) as { weight_kg: number }).weight_kg).toBe(65);
    });
  });

  describe("daily logs: upsert + isolation", () => {
    it("keeps one row per user per date and never leaks across accounts", async () => {
      const grace = await createUser("daily-grace");
      const henry = await createUser("daily-henry");
      const a = asUser(app, grace);
      const b = asUser(app, henry);
      const date = "2026-10-13";

      await a(`/api/logs/daily/${date}`, {
        method: "PUT",
        body: JSON.stringify({ weight_kg: 70, calories: 2000 }),
      });
      await b(`/api/logs/daily/${date}`, {
        method: "PUT",
        body: JSON.stringify({ calories: 1500 }),
      });

      const aDay = (await (await a(`/api/logs/daily/${date}`)).json()) as {
        weight_kg: number | null;
        calories: number | null;
      };
      const bDay = (await (await b(`/api/logs/daily/${date}`)).json()) as {
        weight_kg: number | null;
        calories: number | null;
      };
      expect(aDay).toMatchObject({ weight_kg: 70, calories: 2000 });
      expect(bDay).toMatchObject({ weight_kg: null, calories: 1500 });
    });
  });

  describe("weekly verdict: computed, persisted, per-account", () => {
    it("computes and stores a verdict for the caller only", async () => {
      const prisma = await testPrisma();
      const ivy = await createUser("verdict-ivy");
      const jack = await createUser("verdict-jack");
      const a = asUser(app, ivy);

      // Two weigh-ins six days apart: -0.5 kg over 6 days ≈ -0.58 kg/wk.
      await a("/api/logs/daily/2026-10-06", { method: "PUT", body: JSON.stringify({ weight_kg: 80 }) });
      await a("/api/logs/daily/2026-10-12", { method: "PUT", body: JSON.stringify({ weight_kg: 79.5 }) });

      const res = await a("/api/verdict/weekly?date=2026-10-12");
      expect(res.status).toBe(200);
      const verdict = (await res.json()) as {
        verdict: string;
        week_start_date: string;
        weight_trend_kg_per_week: number | null;
      };
      expect(verdict.verdict).toBe("hold");
      expect(verdict.weight_trend_kg_per_week).toBeGreaterThan(-0.8);
      expect(verdict.weight_trend_kg_per_week).toBeLessThan(-0.3);

      const stored = await prisma.weeklyVerdict.findUnique({
        where: { userId_weekStartDate: { userId: ivy, weekStartDate: new Date("2026-10-12") } },
      });
      expect(stored?.verdict).toBe("hold");

      // The other account gets its own (no-data) verdict, not ivy's row.
      const bRes = await asUser(app, jack)("/api/verdict/weekly?date=2026-10-12");
      const bVerdict = (await bRes.json()) as { verdict: string; weight_trend_kg_per_week: number | null };
      expect(bVerdict.weight_trend_kg_per_week).toBeNull();
      const jackRows = await prisma.weeklyVerdict.count({ where: { userId: jack } });
      expect(jackRows).toBe(1);
    });
  });

  describe("coach: outage handling and session isolation", () => {
    it("surfaces a provider outage as an SSE error and stores no assistant turn", async () => {
      const prisma = await testPrisma();
      const kate = await createUser("coach-kate");
      const a = asUser(app, kate);

      const realFetch = globalThis.fetch;
      vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
        const url = typeof input === "string" ? input : String(input);
        if (url.startsWith(app.base)) return realFetch(input as never, init);
        return Promise.resolve(new Response("provider down", { status: 500 }));
      });

      const res = await a("/api/coach/chat/stream", {
        method: "POST",
        body: JSON.stringify({ message: "hello coach", localDate: "2026-10-09" }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('"error"');
      vi.unstubAllGlobals();

      const messages = await prisma.coachMessage.findMany({
        where: { userId: kate },
        orderBy: { createdAt: "asc" },
      });
      expect(messages.map((m) => m.role)).toEqual(["user"]);
    });

    it("never exposes another account's sessions or messages", async () => {
      const prisma = await testPrisma();
      const liam = await createUser("coach-liam");
      const mia = await createUser("coach-mia");

      const session = await prisma.coachSession.create({
        data: { userId: liam, title: "Liam's chat", agent: "general" },
        select: { id: true },
      });
      await prisma.coachMessage.create({
        data: { userId: liam, sessionId: session.id, role: "user", content: "private" },
      });

      const liamSessions = (await (await asUser(app, liam)("/api/coach/sessions")).json()) as {
        id: string;
      }[];
      expect(liamSessions.map((s) => s.id)).toContain(session.id);

      const b = asUser(app, mia);
      expect(await (await b("/api/coach/sessions")).json()).toEqual([]);
      expect((await b(`/api/coach/sessions/${session.id}/messages`)).status).toBe(404);
      expect((await b(`/api/coach/sessions/${session.id}`, { method: "DELETE" })).status).toBe(404);
      // Liam's session survived Mia's delete attempt.
      expect(
        await prisma.coachSession.count({ where: { id: session.id, userId: liam } }),
      ).toBe(1);
    });
  });

  describe("connection recovery", () => {
    it("keeps serving reads and writes after Postgres terminates the pool", async () => {
      const prisma = await testPrisma();
      const target = await createUser("kill-target");

      // Terminate this app's pooled backends (identified by the pool's
      // application_name). The query runs on a different pid, so it survives.
      const killed = await prisma.$queryRawUnsafe<{ killed: bigint }[]>(
        `SELECT count(pg_terminate_backend(pid))::bigint AS killed
           FROM pg_stat_activity
          WHERE application_name = 'log-app-backend' AND pid <> pg_backend_pid()`,
      );
      expect(Number(killed[0].killed)).toBeGreaterThan(0);

      // A read recovers via pre-ping/retry; the write proves pre-ping made the
      // dead-socket path safe even where a replay would be ambiguous.
      const count = await prisma.user.count();
      expect(count).toBeGreaterThan(0);

      const updated = await prisma.user.update({
        where: { id: target },
        data: { proteinTargetG: 123 },
        select: { proteinTargetG: true },
      });
      expect(updated.proteinTargetG).toBe(123);
    });
  });

  describe("metrics endpoint", () => {
    it("is off without a token, then demands the bearer token", async () => {
      const { config } = await import("../../src/config");

      // Off by default: no metrics surface exists until an operator opts in.
      expect((await fetch(`${app.base}/metrics`)).status).toBe(404);

      config.metrics.token = "test-metrics-token";
      try {
        const denied = await fetch(`${app.base}/metrics`, {
          headers: { authorization: "Bearer wrong-token" },
        });
        expect(denied.status).toBe(401);

        const res = await fetch(`${app.base}/metrics`, {
          headers: { authorization: "Bearer test-metrics-token" },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/plain");

        const text = await res.text();
        // Real traffic from the tests above is in the registry: successes and
        // 401s both produced series, with token/latency instrumentation live.
        expect(text).toContain("# TYPE http_requests_total counter");
        expect(text).toContain('status_class="2xx"');
        expect(text).toContain('status_class="4xx"');
        expect(text).toContain("# TYPE http_request_duration_ms histogram");
      } finally {
        config.metrics.token = "";
      }
    });
  });
});
