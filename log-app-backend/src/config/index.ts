import dotenv from "dotenv";
import { parseAllowedOrigins } from "../cors";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY || "",
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || "",
  },
  database: {
    url: process.env.DATABASE_URL || "",
    sslNoVerify: process.env.DATABASE_SSL_NO_VERIFY === "true",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  },
  // Model routing: match the model to how much "thinking" a task needs, so a
  // cheap model handles the easy work and a strong one handles reasoning.
  models: {
    // Structured extraction (plan text/PDF -> JSON): cheap and fast suffices.
    parsing: process.env.OPENAI_PARSE_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    // Short, simple chat turns.
    chatFast: process.env.COACH_FAST_MODEL || "gpt-4.1-mini",
    // Reasoning-heavy chat, program generation and physique analysis.
    chatSmart: process.env.COACH_MODEL || "gpt-4.1",
    vision: process.env.COACH_VISION_MODEL || process.env.COACH_MODEL || "gpt-4.1",
  },
  cors: {
    allowedOrigins: parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS),
  },
  sentry: {
    dsn: process.env.SENTRY_DSN || "",
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || undefined,
  },
};

export function validateRuntimeConfig(): void {
  const missing = [
    ["DATABASE_URL", config.database.url],
    ["CLERK_SECRET_KEY", config.clerk.secretKey],
    ["OPENAI_API_KEY", config.openai.apiKey],
  ].flatMap(([name, value]) => (value ? [] : [name]));

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
