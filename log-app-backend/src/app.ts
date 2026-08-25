import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { errorHandler } from "./middleware/errorHandler";
import { config } from "./config";
import usersRouter from "./routes/users";
import dailyLogsRouter from "./routes/dailyLogs";
import liftLogsRouter from "./routes/liftLogs";
import plansRouter from "./routes/plans";
import trendsRouter from "./routes/trends";
import verdictRouter from "./routes/verdict";

const app = express();

app.use(cors({
  origin: true,
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
app.use("/api/plans", plansRouter);
app.use("/api/trends", trendsRouter);
app.use("/api/verdict", verdictRouter);

app.use(errorHandler);

export default app;
