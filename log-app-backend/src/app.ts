import express from "express";
import cors from "cors";
import helmet from "helmet";
import * as Sentry from "@sentry/node";
import { clerkMiddleware } from "@clerk/express";
import { isAllowedOrigin } from "./cors";
import { errorHandler } from "./middleware/errorHandler";
import { config } from "./config";
import usersRouter from "./routes/users";
import dailyLogsRouter from "./routes/dailyLogs";
import liftLogsRouter from "./routes/liftLogs";
import activityLogsRouter from "./routes/activityLogs";
import plansRouter from "./routes/plans";
import trendsRouter from "./routes/trends";
import verdictRouter from "./routes/verdict";

const app = express();
app.set("trust proxy", 1);
app.use(helmet());

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

app.use(clerkMiddleware({ secretKey: config.clerk.secretKey }));

app.use("/api", usersRouter);
app.use("/api/logs", dailyLogsRouter);
app.use("/api/logs", liftLogsRouter);
app.use("/api/logs", activityLogsRouter);
app.use("/api/plans", plansRouter);
app.use("/api/trends", trendsRouter);
app.use("/api/verdict", verdictRouter);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
});

// Captures propagated 500s/uncaught route errors to Sentry, then passes
// them on to our formatter below (no-ops entirely when DSN is unset).
Sentry.setupExpressErrorHandler(app);

app.use(errorHandler);

export default app;
