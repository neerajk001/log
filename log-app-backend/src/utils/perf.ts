/**
 * Production-safe performance helpers (Phase 0 instrumentation).
 *
 * Privacy contract — these helpers must NEVER see secrets or personal data:
 * - paths are redacted (UUIDs/ids become `:id`, query strings dropped) so log
 *   aggregation has bounded cardinality and no identifiers leak;
 * - query text is normalized and truncated, and bind parameters are never
 *   accepted, so values can't reach the logs.
 */

/** Query-string stripped, UUID/long-hex segments replaced — safe for log aggregation. */
export function redactPath(rawPath: string): string {
  const path = rawPath.split("?")[0];
  return path
    .split("/")
    .map((seg) =>
      /^[0-9a-fA-F-]{36}$/.test(seg) || /^[0-9a-fA-F]{16,}$/.test(seg) ? ":id" : seg,
    )
    .join("/");
}

/** Collapse whitespace and truncate — keeps slow-query logs one line and value-free. */
export function normalizeQueryText(text: string, maxChars = 120): string {
  return text.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

/** Slow-query threshold in ms. Env-overridable, conservative default. */
export function slowDbMs(): number {
  const parsed = parseInt(process.env.DB_SLOW_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 200;
}
