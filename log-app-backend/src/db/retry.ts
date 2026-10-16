/**
 * Transient database-failure handling.
 *
 * Neon's pooler (like any PgBouncer-style pooler) can close idle pooled sockets
 * server-side. `pg` hands the dead connection to the next query, which fails
 * with a connection-level error — intermittently, and attributed to whichever
 * query happens to run first (for the coach context that is a 13-query fan-out,
 * so the failure surfaces on a random model: coachMemory, dailyLog, ...).
 *
 * These failures are transient. Retry policy:
 * - Connection-setup failures never executed the query → safe for any operation.
 * - Failures during a query are ambiguous (a write may have committed) → retry
 *   reads only; a write surfaces the error instead of risking a duplicate.
 * - Validation errors are deterministic → never retried.
 */
import { Prisma } from "@prisma/client";

/** Codes raised before a statement runs (cannot-reach, connect timeout, pool timeout). */
const CONNECTION_SETUP_CODES = new Set(["P1001", "P1002", "P1003", "P2024"]);

/** Codes that can surface mid-statement. */
const CONNECTION_DURING_QUERY_CODES = new Set(["P1017"]);

/** Some pooler/proxy failures arrive as plain errors without a Prisma code. */
const TRANSIENT_MESSAGE =
  /server has (?:been )?closed the connection|closed the connection|connection (?:has been |was )?(?:terminated|reset|refused|closed)|econnreset|econnrefused|socket hang up|terminating connection|database system is (?:starting up|shutting down|in recovery)|prepared statement .* (?:does not exist|already exists)|unexpected end of|too many clients/i;

/**
 * Postgres error codes that mean the connection died, not that the query was
 * wrong: connection-exception class (08xxx), shutdown class (57P0x) and the
 * pooler's "too many clients" (53300). The pg adapter passes them through
 * inside a P2010 message ("Raw query failed. Code: `57P01`. Message: …"), so
 * they must be read from the text.
 */
const CONNECTION_PG_CODE = /^(?:08[0-9A-Z]{3}|57P0[123]|53300)$/i;
const PG_CODE_IN_MESSAGE = /Raw query failed\. Code: `?([0-9A-Z]{5})`?/i;

const READ_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

export function operationIsRead(operation: string): boolean {
  return READ_OPERATIONS.has(operation);
}

export function shouldRetryDbOperation(err: unknown, operation: string): boolean {
  // A malformed query will fail identically on retry.
  if (err instanceof Prisma.PrismaClientValidationError) return false;

  // Cannot reach the database / connect or pool timeout: the statement never ran.
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  const code = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
  if (code != null && CONNECTION_SETUP_CODES.has(code)) return true;

  const message = err instanceof Error ? err.message : "";
  // The pg adapter passes driver errors through as Prisma P2010 ("Raw query
  // failed. Code: `57P01`. Message: …"), so the Postgres code must be read from
  // the text — that is the shape the production failures actually arrive in.
  const pgCode = PG_CODE_IN_MESSAGE.exec(message)?.[1] ?? null;
  const duringQuery =
    (code != null && CONNECTION_DURING_QUERY_CODES.has(code)) ||
    (pgCode != null && CONNECTION_PG_CODE.test(pgCode)) ||
    TRANSIENT_MESSAGE.test(message);
  // Ambiguous failures: only reads, where a replay cannot duplicate anything.
  return duringQuery && operationIsRead(operation);
}

export interface RetryOptions {
  maxAttempts?: number;
  /** Injectable for tests; defaults to a short jittered backoff. */
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (err: unknown, attempt: number) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs `run` with one retry (by default) when the failure is transient. */
export async function runWithRetry<T>(
  operation: string,
  run: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 2);
  const sleep = opts.sleep ?? defaultSleep;

  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= maxAttempts || !shouldRetryDbOperation(err, operation)) throw err;
      opts.onRetry?.(err, attempt);
      // Small jittered backoff: enough for the pool to discard a dead socket.
      await sleep(120 + Math.floor(Math.random() * 180));
    }
  }
}
