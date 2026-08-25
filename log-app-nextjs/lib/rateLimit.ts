type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

/**
 * Fixed-window in-memory rate limiter. Per-user keyed (e.g. by Clerk user
 * id). Good enough for a single-instance MVP; swap for Redis/KV if the app
 * scales horizontally (see docs/security.md — /api/plans/parse is the
 * expensive endpoint).
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;

  entry.count += 1;
  return true;
}
