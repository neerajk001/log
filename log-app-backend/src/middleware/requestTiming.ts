import { Request, Response, NextFunction } from "express";
import { redactPath } from "../utils/perf";

/** Liveness probes would drown the timing stream — never log them. */
const SKIPPED_PATHS = new Set(["/health"]);

/**
 * Production-safe request timing: one line per request with method, redacted
 * path, status and wall time. No headers, bodies, query values, tokens or user
 * ids — safe to aggregate into p50/p95 per endpoint.
 */
export function requestTiming(req: Request, res: Response, next: NextFunction): void {
  if (SKIPPED_PATHS.has(req.path)) {
    next();
    return;
  }
  // Capture now: Express routers strip req.url as they delegate, so reading
  // req.path in the finish handler would log the mount-relative path.
  const path = redactPath(req.originalUrl || req.url || "");
  const startedAt = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - startedAt;
    console.log(`[req] ${req.method} ${path} ${res.statusCode} ${ms}ms`);
  });
  next();
}
