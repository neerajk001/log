import express from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/node";
import { clerkMiddleware } from "@clerk/express";
import { isAllowedOrigin } from "./cors";
import { errorHandler } from "./middleware/errorHandler";
import { requestTiming } from "./middleware/requestTiming";
import { config } from "./config";
import { checkDatabaseReadiness } from "./db/readiness";
import { renderMetrics } from "./utils/metricRegistry";
import usersRouter from "./routes/users";
import dailyLogsRouter from "./routes/dailyLogs";
import liftLogsRouter from "./routes/liftLogs";
import activityLogsRouter from "./routes/activityLogs";
import plansRouter from "./routes/plans";
import mealsRouter from "./routes/meals";
import trendsRouter from "./routes/trends";
import insightsRouter from "./routes/insights";
import verdictRouter from "./routes/verdict";
import coachRouter from "./routes/coach";
import billingRouter from "./routes/billing";

const app = express();
const READINESS_REPORT_INTERVAL_MS = 5 * 60 * 1000;
let lastReadinessReportAt = 0;
app.set("trust proxy", 1);
app.use(helmet());
app.use(
  compression({
    // Never gzip the coach's SSE stream — each token has to flush immediately.
    filter: (req, res) => {
      const type = res.getHeader("Content-Type")?.toString() ?? "";
      if (type.includes("text/event-stream")) return false;
      return compression.filter(req, res);
    },
  }),
);

// Phase 0 instrumentation: per-request timing in every env (dev logger folded in).
// One line per request, redacted path, no PII — aggregate into p50/p95 per endpoint.
app.use(requestTiming);

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin, config.cors.allowedOrigins)) return callback(null, true);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  exposedHeaders: ["Content-Type"],
  credentials: true,
  maxAge: 86400,
}));
app.use((req, res, next) => {
  if (req.is("multipart/form-data")) return next();
  express.json({ limit: "1mb" })(req, res, next);
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/ready", async (_req, res) => {
  try {
    await checkDatabaseReadiness();
    res.json({ status: "ready" });
  } catch (err) {
    console.error("[readiness] Database unavailable", {
      name: err instanceof Error ? err.name : "UnknownError",
    });
    const now = Date.now();
    if (now - lastReadinessReportAt >= READINESS_REPORT_INTERVAL_MS) {
      lastReadinessReportAt = now;
      Sentry.withScope((scope) => {
        scope.setTag("operation", "database.readiness");
        Sentry.captureException(err);
      });
    }
    res.status(503).json({ status: "unavailable" });
  }
});

/** Constant-time bearer-token compare (length mismatch short-circuits safely). */
function isMetricsAuthorized(header: string | undefined, token: string): boolean {
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const providedBuf = Buffer.from(provided);
  const tokenBuf = Buffer.from(token);
  return providedBuf.length === tokenBuf.length && timingSafeEqual(providedBuf, tokenBuf);
}

// Prometheus scrape endpoint. Deliberately 404 when METRICS_TOKEN is unset so
// no new surface exists until an operator opts in; the token is compared in
// constant time and never logged.
app.get("/metrics", (req, res) => {
  if (!config.metrics.token) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
    return;
  }
  if (!isMetricsAuthorized(req.headers.authorization, config.metrics.token)) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Missing or invalid metrics token" },
    });
    return;
  }
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderMetrics());
});

app.use(clerkMiddleware({ secretKey: config.clerk.secretKey }));

app.use("/api", usersRouter);
app.use("/api/logs", dailyLogsRouter);
app.use("/api/logs", liftLogsRouter);
app.use("/api/logs", activityLogsRouter);
app.use("/api/plans", plansRouter);
app.use("/api/meals", mealsRouter);
app.use("/api/trends", trendsRouter);
app.use("/api/insights", insightsRouter);
app.use("/api/verdict", verdictRouter);
app.use("/api/coach", coachRouter);
app.use("/api/billing", billingRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
});

// Captures propagated 500s/uncaught route errors to Sentry, then passes
// them on to our formatter below (no-ops entirely when DSN is unset).
Sentry.setupExpressErrorHandler(app);

app.use(errorHandler);

export default app;
