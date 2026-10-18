import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { Pool, type PoolConfig } from "pg";
import { config } from "../config";
import { normalizeQueryText, slowDbMs } from "../utils/perf";
import { incrementCounter } from "../utils/metricRegistry";
import { installPrePing, prePingIdleMs, prePingTimeoutMs } from "./prePing";
import { operationIsRead, runWithRetry } from "./retry";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

/**
 * Path to a PEM root CA to trust in addition to the system store, e.g.
 * Supabase's `prod-ca-2021.crt`. Providers that use their own CA (Supabase)
 * need it; providers with publicly-trusted certs (Neon) leave it unset.
 */
export function databaseSslCaPath(): string | undefined {
  const path = process.env.DATABASE_SSL_CA?.trim();
  return path ? path : undefined;
}

export function buildPoolSslConfig(
  databaseUrl: string,
  sslNoVerify = false,
  caPath = databaseSslCaPath(),
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
  if (caPath) {
    try {
      // Verification stays ON — this only adds the provider's root to the trust
      // store, so a self-signed pooler chain (Supabase) validates properly.
      return { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true };
    } catch (err) {
      throw new Error(
        `DATABASE_SSL_CA is set to ${caPath} but it could not be read: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return { rejectUnauthorized: true };
}

/**
 * `sslmode` in the connection string takes precedence over an explicit `ssl`
 * object (pg ≥ 8.16 treats `require` as verify-full), which silently discards
 * the CA above. The ssl object built here is authoritative, so the parameter is
 * dropped from the URL. Anything else — including `disable` — is left alone.
 */
export function stripSslMode(databaseUrl: string | undefined): string | undefined {
  if (!databaseUrl) return databaseUrl;
  try {
    const parsed = new URL(databaseUrl);
    if (!parsed.searchParams.has("sslmode")) return databaseUrl;
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return databaseUrl;
  }
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
 * - max 20 (override DB_POOL_MAX): the coach context fires ~13 concurrent
 *   queries; the default 10 forces client-side queueing. Lower it where the
 *   upstream pooler caps connections lower than that.
 * - connectionTimeoutMillis 10s: the default (0 = wait forever) turns a stuck
 *   connect into a hung request instead of a fast, diagnosable error.
 * - idleTimeoutMillis 10s: pg default, stated explicitly (dead sockets after a
 *   suspend must be reaped, not handed out).
 * - keepAlive: TCP keepalive probes detect dead peers through NAT/LB idle drops.
 * - sslmode is stripped from the URL: this file's ssl config is authoritative
 *   (see stripSslMode), otherwise the URL's `require` overrides the CA.
 * No statement_timeout here: with a `-pooler` (PgBouncer transaction-mode) host,
 * per-connection settings are unsafe without verifying the pooler mode first.
 */
export function buildPoolOptions(): PoolConfig {
  return {
    connectionString: stripSslMode(process.env.DATABASE_URL),
    ssl,
    max: poolMax(),
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    keepAlive: true,
    // Start TCP keepalive probes after ~10s (the OS default is hours) so a
    // silently-closed peer is detected while a query waits on it.
    keepAliveInitialDelayMillis: 10_000,
    // Visible in pg_stat_activity / Neon dashboards, and lets the integration
    // suite terminate exactly this app's pooled connections.
    application_name: "log-app-backend",
  };
}

/** Keepalive ping interval. Unset = 4 min (beats Neon's 5-min suspend); 0/garbage = off. */
export function keepaliveMs(): number {
  const raw = process.env.DB_KEEPALIVE_MS;
  if (raw === undefined || raw === "") return 4 * 60 * 1000;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Local pool ceiling. The default (20) sizes past the coach context's ~13-query
 * fan-out. Supabase's session pooler caps server-side connections lower than
 * that, so set DB_POOL_MAX there (e.g. 10) instead of queueing at the pooler.
 */
export function poolMax(): number {
  const raw = process.env.DB_POOL_MAX;
  if (raw === undefined || raw === "") return 20;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
}

const pool = globalForPrisma.pgPool ?? new Pool(buildPoolOptions());

// Dead pooled sockets (Neon pooler/network) are caught at checkout: an idle
// connection is pinged before Prisma may use it — this is what makes WRITES
// safe on flaky connections, where a retry would be ambiguous.
installPrePing(pool, {
  idleMs: prePingIdleMs(),
  timeoutMs: prePingTimeoutMs(),
  onUnhealthy: (reason) => {
    incrementCounter("db_transient_retries_total", { reason: "pre_ping" });
    console.warn(`[db] pre-ping ${reason}, replacing the pooled connection`);
  },
});

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

const basePrisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

/**
 * Every model operation gets one retry on a *transient* connection failure
 * (dead pooled socket, pool/connect timeout) — see db/retry.ts for the policy.
 * Validation errors and ambiguous write failures are never retried.
 */
export const prisma = basePrisma.$extends({
  name: "transient-db-retry",
  query: {
    $allModels: {
      async $allOperations({ args, query, operation, model }) {
        const label = `${model}.${operation}`;
        // Reads get an extra attempt: the coach context is a ~13-query fan-out,
        // so one dead connection among many can still fail a whole turn.
        const maxAttempts = operationIsRead(operation) ? 3 : 2;
        return runWithRetry(label, () => query(args), {
          maxAttempts,
          onRetry: (err, attempt) => {
            incrementCounter("db_transient_retries_total", { reason: "query" });
            console.warn(
              `[db] transient failure on ${label} (attempt ${attempt}), retrying`,
              err instanceof Error ? err.message.split("\n")[0] : err,
            );
          },
        });
      },
    },
  },
}) as unknown as PrismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
  globalForPrisma.pgPool = pool;
}
