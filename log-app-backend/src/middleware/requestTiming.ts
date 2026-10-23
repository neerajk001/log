import { Request, Response, NextFunction } from "express";
import { incrementCounter, observeHistogram } from "../utils/metricRegistry";

/** Liveness probes and metric scrapes would drown the timing stream — never log them. */
const SKIPPED_PATHS = new Set(["/health", "/metrics"]);

/**
 * Production-safe request timing: one line per request with method, redacted
 * path, status and wall time. No headers, bodies, query values, tokens or user
 * ids — safe to aggregate into p50/p95 per endpoint. The same numbers feed the
 * in-process Prometheus registry served at `/metrics`.
 */
export function requestTiming(req: Request, res: Response, next: NextFunction): void {
  if (SKIPPED_PATHS.has(req.path)) {
    next();
    return;
  }
  const method = req.method;
  const startedAt = Date.now();
  res.on("finish", () => {
    // Use the matched route pattern, never the raw URL: a scanner can hit
    // arbitrary paths and would otherwise create a new metric series and log
    // line per request. Unmatched requests collapse to one label.
    const route = (req as { route?: { path?: string } }).route?.path ?? "/unmatched";
    const ms = Date.now() - startedAt;
    console.log(`[req] ${method} ${route} ${res.statusCode} ${ms}ms`);
    incrementCounter("http_requests_total", {
      method,
      route,
      status_class: `${Math.floor(res.statusCode / 100)}xx`,
    });
    observeHistogram("http_request_duration_ms", { method, route }, ms);
  });
  next();
}
