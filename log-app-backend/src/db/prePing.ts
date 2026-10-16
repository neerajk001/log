/**
 * Connection pre-ping (the `pool_pre_ping` pattern).
 *
 * Neon's pooler and network middleboxes can close idle pooled sockets without
 * the client noticing. The retry layer (db/retry.ts) recovers reads, but a
 * WRITE attempted on a dead socket is ambiguous and must not be replayed.
 * Pinging a connection that has been idle beyond `idleMs` before handing it to
 * Prisma catches dead sockets up front, so even writes transparently get a
 * fresh connection.
 *
 * Fresh connections are never pinged, and steady traffic (queries seconds
 * apart) stays under the idle window — so the ping costs nothing in the normal
 * case. Only reuse after quiet periods pays one `SELECT 1`.
 */
import type { Pool, PoolClient } from "pg";

const DEFAULT_IDLE_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_ATTEMPTS = 5;

/** Ping only connections idle at least this long (0 disables pre-ping). */
export function prePingIdleMs(): number {
  const raw = process.env.DB_PRE_PING_MS;
  if (raw === undefined || raw === "") return DEFAULT_IDLE_MS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_IDLE_MS;
}

/** A ping that hasn't answered within this window is treated as death. */
export function prePingTimeoutMs(): number {
  const raw = process.env.DB_PRE_PING_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_TIMEOUT_MS;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

type ConnectCallback = (
  err: Error | null,
  client?: PoolClient,
  done?: (releaseErr?: boolean | Error) => void,
) => void;

export interface PrePingOptions {
  idleMs: number;
  timeoutMs: number;
  /** How many connections may be discarded before giving up. */
  maxAttempts?: number;
  now?: () => number;
  ping?: (client: PoolClient) => Promise<unknown>;
  onUnhealthy?: (reason: "failed" | "timeout") => void;
}

/**
 * Wraps `pool.connect` so a reused connection is checked before use. Safe with
 * `pool.query`, which acquires clients through the callback form.
 */
export function installPrePing(pool: Pool, opts: PrePingOptions): void {
  // Dev (tsx watch) re-evaluates this module for a shared pooled instance;
  // double-wrapping would ping twice per checkout.
  const flag = pool as unknown as { __prePingInstalled?: boolean };
  if (flag.__prePingInstalled) return;
  flag.__prePingInstalled = true;

  if (opts.idleMs <= 0) return;

  const now = opts.now ?? Date.now;
  const ping = opts.ping ?? ((client) => client.query("SELECT 1"));
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const originalConnect = pool.connect.bind(pool) as () => Promise<PoolClient>;
  /** When each client last finished a use; absent until its first release. */
  const lastUsedAt = new WeakMap<PoolClient, number>();

  pool.on("release", (_err: Error, client: PoolClient) => {
    if (client) lastUsedAt.set(client, now());
  });

  const needsCheck = (client: PoolClient): boolean => {
    const last = lastUsedAt.get(client);
    return last !== undefined && now() - last >= opts.idleMs;
  };

  const isHealthy = async (client: PoolClient): Promise<boolean> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pending = Promise.resolve().then(() => ping(client));
    // If the ping is abandoned on timeout, its eventual rejection must not be
    // an unhandled rejection.
    pending.catch(() => {});
    try {
      await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("pre-ping timeout")), opts.timeoutMs);
        }),
      ]);
      return true;
    } catch (err) {
      const reason = err instanceof Error && err.message === "pre-ping timeout" ? "timeout" : "failed";
      opts.onUnhealthy?.(reason);
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const discard = (client: PoolClient): void => {
    try {
      // Releasing with an error destroys the client instead of returning it.
      client.release(new Error("pre-ping: connection unhealthy"));
    } catch {
      // already gone; nothing to release
    }
  };

  const acquire = async (attempt: number): Promise<PoolClient> => {
    const client = await originalConnect();
    if (!needsCheck(client) || (await isHealthy(client))) return client;
    discard(client);
    if (attempt + 1 >= maxAttempts) {
      throw new Error("No healthy database connection available");
    }
    return acquire(attempt + 1);
  };

  pool.connect = ((first?: unknown) => {
    if (typeof first === "function") {
      const callback = first as ConnectCallback;
      acquire(0).then(
        (client) =>
          callback(null, client, (releaseErr?: boolean | Error) => client.release(releaseErr)),
        (err: unknown) => callback(err instanceof Error ? err : new Error(String(err))),
      );
      return;
    }
    return acquire(0);
  }) as Pool["connect"];
}
