import { Request, Response, NextFunction } from "express";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyGenerator: (req: Request) => string;
}

interface Hit {
  count: number;
  resetAt: number;
}

/**
 * Minimal in-memory fixed-window rate limiter. Sufficient for the single
 * costly endpoint (`POST /api/plans/parse`) on a single instance — see
 * security.md. Multi-instance deployments need a shared store (Redis);
 * entries are evicted lazily on access plus a sweep when the map grows.
 */
export function rateLimit({ windowMs, max, keyGenerator }: RateLimitOptions) {
  const hits = new Map<string, Hit>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyGenerator(req);

    if (hits.size > 10000) {
      for (const [k, v] of hits) {
        if (v.resetAt <= now) hits.delete(k);
        if (hits.size <= 10000) break;
      }
    }

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      if (entry) hits.delete(key);
      hits.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= max) {
      res.status(429).json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
        },
      });
      return;
    }

    entry.count += 1;
    next();
  };
}
