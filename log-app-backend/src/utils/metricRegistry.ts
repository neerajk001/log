/**
 * Dependency-free Prometheus metrics registry (Phase B monitoring).
 *
 * Deliberately minimal: a fixed catalogue of counters + one latency histogram,
 * so the exposition output is always valid and label cardinality is bounded by
 * the redacted route path. No external dependency, no background flush — the
 * VPS scraper (or any Prometheus-compatible collector) pulls `/metrics`.
 *
 * Privacy contract: labels carry route patterns, status classes, tool names and
 * failure codes only. Never user ids, session ids, prompts or content.
 */

type Labels = Record<string, string | number>;

interface CounterDef {
  help: string;
  labelNames: readonly string[];
}

interface HistogramDef {
  help: string;
  labelNames: readonly string[];
  buckets: readonly number[];
}

const COUNTERS = {
  http_requests_total: {
    help: "HTTP requests processed, by method, redacted route and status class.",
    labelNames: ["method", "route", "status_class"],
  },
  coach_turns_total: {
    help: "Coach chat turns completed (success or failure surfaced to the client).",
    labelNames: [],
  },
  coach_rounds_total: {
    help: "Model rounds executed across coach turns.",
    labelNames: [],
  },
  coach_input_tokens_total: {
    help: "Provider-reported input tokens across coach turns.",
    labelNames: [],
  },
  coach_output_tokens_total: {
    help: "Provider-reported output tokens across coach turns.",
    labelNames: [],
  },
  coach_tool_calls_total: {
    help: "Coach tool executions, by tool name.",
    labelNames: ["tool"],
  },
  coach_provider_retries_total: {
    help: "Retries of upstream model calls, by call kind (stream/nonstream).",
    labelNames: ["kind"],
  },
  coach_failures_total: {
    help: "Coach turns that failed, by error code.",
    labelNames: ["code"],
  },
  db_transient_retries_total: {
    help: "Database connection recoveries, by reason (query = retried query, pre_ping = dead socket replaced at checkout).",
    labelNames: ["reason"],
  },
} as const satisfies Record<string, CounterDef>;

const HISTOGRAMS = {
  http_request_duration_ms: {
    help: "HTTP request wall time in milliseconds.",
    labelNames: ["method", "route"],
    buckets: [25, 50, 100, 200, 500, 1000, 2500, 5000, 10000, 30000],
  },
} as const satisfies Record<string, HistogramDef>;

type CounterName = keyof typeof COUNTERS;
type HistogramName = keyof typeof HISTOGRAMS;

const counters = new Map<string, Map<string, number>>();
const histograms = new Map<string, Map<string, { counts: number[]; sum: number; count: number }>>();
/** Hard bound on label cardinality per metric (protects memory under hostile paths). */
const MAX_SERIES_PER_METRIC = 2_000;

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function seriesKey(labelNames: readonly string[], labels: Labels): string {
  return labelNames
    .map((name) => `${name}="${escapeLabelValue(String(labels[name] ?? ""))}"`)
    .join(",");
}

function seriesSuffix(key: string, extra?: string): string {
  const parts = [key, extra].filter(Boolean).join(",");
  return parts.length > 0 ? `{${parts}}` : "";
}

/** Increment a counter series. Unknown names throw so typos can't be silent. */
export function incrementCounter(name: CounterName, labels: Labels = {}, value = 1): void {
  const def = COUNTERS[name];
  if (!def) throw new Error(`Unknown counter: ${name}`);
  const key = seriesKey(def.labelNames, labels);
  const series = counters.get(name) ?? new Map<string, number>();
  if (!series.has(key) && series.size >= MAX_SERIES_PER_METRIC) return;
  series.set(key, (series.get(key) ?? 0) + value);
  counters.set(name, series);
}

/** Observe a duration (ms) into a histogram series. Unknown names throw. */
export function observeHistogram(name: HistogramName, labels: Labels, valueMs: number): void {
  const def = HISTOGRAMS[name];
  if (!def) throw new Error(`Unknown histogram: ${name}`);
  const key = seriesKey(def.labelNames, labels);
  const series =
    histograms.get(name) ??
    new Map<string, { counts: number[]; sum: number; count: number }>();
  if (!series.has(key) && series.size >= MAX_SERIES_PER_METRIC) return;
  const entry =
    series.get(key) ?? { counts: def.buckets.map(() => 0), sum: 0, count: 0 };
  for (let i = 0; i < def.buckets.length; i++) {
    if (valueMs <= def.buckets[i]) entry.counts[i] += 1;
  }
  entry.sum += valueMs;
  entry.count += 1;
  series.set(key, entry);
  histograms.set(name, series);
}

/** Prometheus text exposition (version 0.0.4). */
export function renderMetrics(): string {
  const lines: string[] = [];

  for (const [name, def] of Object.entries(COUNTERS)) {
    lines.push(`# HELP ${name} ${def.help}`);
    lines.push(`# TYPE ${name} counter`);
    const series = counters.get(name);
    if (series) {
      for (const [key, value] of series) {
        lines.push(`${name}${seriesSuffix(key)} ${value}`);
      }
    }
  }

  for (const [name, def] of Object.entries(HISTOGRAMS)) {
    lines.push(`# HELP ${name} ${def.help}`);
    lines.push(`# TYPE ${name} histogram`);
    const series = histograms.get(name);
    if (series) {
      for (const [key, entry] of series) {
        const bucketDef = (def as HistogramDef).buckets;
        bucketDef.forEach((bound, i) => {
          lines.push(
            `${name}_bucket${seriesSuffix(key, `le="${bound}"`)} ${entry.counts[i]}`,
          );
        });
        lines.push(`${name}_bucket${seriesSuffix(key, 'le="+Inf"')} ${entry.count}`);
        lines.push(`${name}_sum${seriesSuffix(key)} ${entry.sum}`);
        lines.push(`${name}_count${seriesSuffix(key)} ${entry.count}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

/** Test hook: drop all series. */
export function resetMetrics(): void {
  counters.clear();
  histograms.clear();
}
