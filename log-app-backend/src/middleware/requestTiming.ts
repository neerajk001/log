import { Request, Response, NextFunction } from "express";
import { redactPath } from "../utils/perf";
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
  // Capture now: Express routers strip req.url as they delegate, so reading
  // req.path in the finish handler would log the mount-relative path.
  const path = redactPath(req.originalUrl || req.url || "");
  const method = req.method;
  const startedAt = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - startedAt;
    console.log(`[req] ${method} ${path} ${res.statusCode} ${ms}ms`);
    incrementCounter("http_requests_total", {
      method,
      route: path,
      status_class: `${Math.floor(res.statusCode / 100)}xx`,
    });
    observeHistogram("http_request_duration_ms", { method, route: path }, ms);
  });
  next();
}
