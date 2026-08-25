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
 * costly endpoint (`POST /api/plans/parse`) — see security.md.
 */
export function rateLimit({ windowMs, max, keyGenerator }: RateLimitOptions) {
  const hits = new Map<string, Hit>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyGenerator(req);

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
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
