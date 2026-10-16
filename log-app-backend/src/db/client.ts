import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolConfig } from "pg";
import { config } from "../config";
import { normalizeQueryText, slowDbMs } from "../utils/perf";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

export function buildPoolSslConfig(
  databaseUrl: string,
  sslNoVerify = false,
): PoolConfig["ssl"] {
  let sslmode: string | null = null;
  try {
    sslmode = new URL(databaseUrl).searchParams.get("sslmode");
  } catch {
    sslmode = null;
  }

  if (sslmode === "disable") return false;
  if (sslmode === "no-verify" || sslNoVerify) {
    console.warn(
      "[db] Postgres TLS verification is DISABLED. Local dev only — never use in production.",
    );
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

export function assertDbSslAllowed(
  ssl: PoolConfig["ssl"],
  nodeEnv = config.nodeEnv,
): void {
  const disabled =
    ssl === false ||
    (typeof ssl === "object" && ssl?.rejectUnauthorized === false);
  if (nodeEnv === "production" && disabled) {
    throw new Error(
      "Refusing to start with Postgres TLS verification disabled in production. Use sslmode=require and remove DATABASE_SSL_NO_VERIFY.",
    );
  }
}

const ssl = buildPoolSslConfig(config.database.url, config.database.sslNoVerify);
assertDbSslAllowed(ssl);

/**
 * Pool shape, extracted pure for tests. Rationale per field (see perf audit §14):
 * - max 20: the coach context fires ~13 concurrent queries; the default 10
 *   forces client-side queueing. Upstream is the Neon pooler, so this is safe.
 * - connectionTimeoutMillis 10s: the default (0 = wait forever) turns a stuck
 *   connect into a hung request instead of a fast, diagnosable error.
 * - idleTimeoutMillis 10s: pg default, stated explicitly (dead sockets after a
 *   Neon suspend must be reaped, not handed out).
 * - keepAlive: TCP keepalive probes detect dead peers through NAT/LB idle drops.
 * No statement_timeout here: with a `-pooler` (PgBouncer transaction-mode) host,
 * per-connection settings are unsafe without verifying the pooler mode first.
 */
export function buildPoolOptions(): PoolConfig {
  return {
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: 20,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    keepAlive: true,
  };
}

/** Keepalive ping interval. Unset = 4 min (beats Neon's 5-min suspend); 0/garbage = off. */
export function keepaliveMs(): number {
  const raw = process.env.DB_KEEPALIVE_MS;
  if (raw === undefined || raw === "") return 4 * 60 * 1000;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const pool = globalForPrisma.pgPool ?? new Pool(buildPoolOptions());

// Idle-client backend errors (e.g. a connection that died while pooled) are
// emitted here. Log and continue — never crash the process, never exit.
pool.on("error", (err) => {
  console.error("[db] idle client error", err instanceof Error ? err.message : err);
});

{
  // Keep one thread of traffic so Neon scale-to-zero (5-min idle suspend) never
  // fires under us and pooled sockets stay fresh. A single SELECT 1 is noise
  // next to real traffic; skipped entirely under tests and when disabled.
  const flag = pool as unknown as { __keepaliveStarted?: boolean };
  const interval = keepaliveMs();
  if (!flag.__keepaliveStarted && interval > 0 && process.env.VITEST == null) {
    flag.__keepaliveStarted = true;
    const timer = setInterval(() => {
      pool.query("SELECT 1").catch((err: unknown) => {
        console.warn("[db] keepalive failed", err instanceof Error ? err.message : err);
      });
    }, interval);
    // Never hold the event loop (scripts, tests, shutdown) for a ping timer.
    if (typeof timer.unref === "function") timer.unref();
  }
}

/**
 * Phase 0 instrumentation: time every query at the pool boundary and log only
 * the slow ones (threshold via `DB_SLOW_MS`, default 200ms). Query text is
 * normalized/truncated and bind parameters are never touched, so values can't
 * leak. Transparent to the Prisma adapter — results pass through untouched.
 */
{
  // Wrap once: dev/test module graphs can evaluate this file repeatedly for a
  // shared pool, and double-wrapping would double-log.
  const flag = pool as unknown as { __slowQueryTimed?: boolean };
  if (!flag.__slowQueryTimed) {
    flag.__slowQueryTimed = true;
    const originalQuery = pool.query.bind(pool);
    const timedQuery = function (this: Pool, ...args: Parameters<Pool["query"]>) {
      const startedAt = Date.now();
      const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: unknown })?.text;
      const pending = (originalQuery as (...a: unknown[]) => Promise<unknown>)(...args);
      // Branch, don't interfere: the original promise is returned untouched, this
      // side-channel only logs (slow successes and slow failures alike).
      void Promise.resolve(pending).then(
        () => logIfSlow(startedAt, text),
        () => logIfSlow(startedAt, text),
      );
      return pending as unknown as ReturnType<Pool["query"]>;
    };
    pool.query = timedQuery as Pool["query"];
  }
}

function logIfSlow(startedAt: number, text: unknown): void {
  const ms = Date.now() - startedAt;
  if (ms >= slowDbMs() && typeof text === "string") {
    console.log(`[db] slow query ${ms}ms ${normalizeQueryText(text)}`);
  }
}

const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}
