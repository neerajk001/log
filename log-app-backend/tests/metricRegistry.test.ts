import { beforeEach, describe, expect, it } from "vitest";
import {
  incrementCounter,
  observeHistogram,
  renderMetrics,
  resetMetrics,
} from "../src/utils/metricRegistry";

beforeEach(() => resetMetrics());

describe("metricRegistry", () => {
  it("renders counters with HELP, TYPE and escaped labels", () => {
    incrementCounter("http_requests_total", {
      method: "GET",
      route: "/api/me",
      status_class: "2xx",
    });
    incrementCounter("http_requests_total", {
      method: "GET",
      route: "/api/me",
      status_class: "2xx",
    });
    incrementCounter("http_requests_total", {
      method: "GET",
      route: '/api/odd"path',
      status_class: "4xx",
    });

    const out = renderMetrics();
    expect(out).toContain("# TYPE http_requests_total counter");
    expect(out).toContain('http_requests_total{method="GET",route="/api/me",status_class="2xx"} 2');
    expect(out).toContain('route="/api/odd\\"path"');
  });

  it("buckets observations cumulatively", () => {
    observeHistogram("http_request_duration_ms", { method: "GET", route: "/api/me" }, 40);
    observeHistogram("http_request_duration_ms", { method: "GET", route: "/api/me" }, 300);

    const out = renderMetrics();
    expect(out).toContain('http_request_duration_ms_bucket{method="GET",route="/api/me",le="25"} 0');
    expect(out).toContain('http_request_duration_ms_bucket{method="GET",route="/api/me",le="50"} 1');
    expect(out).toContain('http_request_duration_ms_bucket{method="GET",route="/api/me",le="500"} 2');
    expect(out).toContain(
      'http_request_duration_ms_bucket{method="GET",route="/api/me",le="+Inf"} 2',
    );
    expect(out).toContain('http_request_duration_ms_sum{method="GET",route="/api/me"} 340');
    expect(out).toContain('http_request_duration_ms_count{method="GET",route="/api/me"} 2');
  });

  it("renders coach cost counters, including zero-label series", () => {
    incrementCounter("coach_turns_total");
    incrementCounter("coach_input_tokens_total", {}, 1200);
    incrementCounter("coach_output_tokens_total", {}, 45);
    incrementCounter("coach_tool_calls_total", { tool: "get_meals" });
    incrementCounter("coach_provider_retries_total", { kind: "stream" });
    incrementCounter("coach_failures_total", { code: "COACH_UNREACHABLE" });
    incrementCounter("db_transient_retries_total", { reason: "pre_ping" });

    const out = renderMetrics();
    expect(out).toContain("coach_turns_total 1");
    expect(out).toContain("coach_input_tokens_total 1200");
    expect(out).toContain("coach_output_tokens_total 45");
    expect(out).toContain('coach_tool_calls_total{tool="get_meals"} 1');
    expect(out).toContain('coach_provider_retries_total{kind="stream"} 1');
    expect(out).toContain('coach_failures_total{code="COACH_UNREACHABLE"} 1');
    expect(out).toContain('db_transient_retries_total{reason="pre_ping"} 1');
  });

  it("drops all series on reset but keeps the catalogue", () => {
    incrementCounter("coach_turns_total");
    resetMetrics();

    const out = renderMetrics();
    expect(out).not.toContain("coach_turns_total 1");
    expect(out).toContain("# TYPE coach_turns_total counter");
  });

  it("rejects unknown metric names so typos cannot be silent", () => {
    expect(() => incrementCounter("nope_total" as never)).toThrow(/Unknown counter/);
    expect(() => observeHistogram("nope_ms" as never, {}, 1)).toThrow(/Unknown histogram/);
  });
});
