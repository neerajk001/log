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
    chatFast: process.env.COACH_FAST_MODEL || "deepseek/deepseek-v4.1-flash",
    // Reasoning-heavy chat turns.
    chatSmart: process.env.COACH_MODEL || "deepseek/deepseek-v4.1-flash",
    // Program generation (the coach writing a full plan). A dedicated, strong model:
    // a wrong split is expensive to undo, and cheaper models tripped the plan
    // schema. Falls back to the chat model when unset.
    plan: process.env.COACH_PLAN_MODEL || process.env.COACH_MODEL || "deepseek/deepseek-v4.1-flash",
    // Physique photo analysis runs on the cheap vision model (Command Code by
    // default, same family as meal photos) — no longer OpenAI.
    physique:
      process.env.COACH_PHYSIQUE_MODEL ||
      process.env.COACH_MEAL_VISION_MODEL ||
      "deepseek/deepseek-v4.1-flash",
    // Meal photo/description estimation (needs vision + accuracy).
    meal: process.env.COACH_MEAL_MODEL || process.env.COACH_VISION_MODEL || process.env.COACH_MODEL || "deepseek/deepseek-v4.1-flash",
    // Meal photos only. Kept separate from `meal` because a text model accepts an
    // image request and silently returns nothing: the photo path needs a model
    // that actually reads images (e.g. deepseek/deepseek-v4.1-flash).
    mealVision: process.env.COACH_MEAL_VISION_MODEL || process.env.COACH_VISION_MODEL || "deepseek/deepseek-v4.1-flash",
  },
  // Coach chat + meal provider. Defaults to OpenAI; point AI_BASE_URL at any
  // OpenAI-Responses-compatible endpoint (e.g. Command Code) for other models.
  // Plan parsing is the one path pinned to OpenAI (see services/planParser.ts).
  ai: {
    baseUrl: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    apiKey:
      process.env.AI_API_KEY || process.env.COMMANDCODE_API_KEY || process.env.OPENAI_API_KEY || "",
    // previous_response_id chaining (off for providers without response storage).
    chaining: process.env.AI_RESPONSE_CHAINING !== "false",
    promptCache: process.env.AI_PROMPT_CACHE !== "false",
    // "disabled" tells reasoning models to skip thinking (faster/cheaper chat).
    // Defaults to disabled: reasoning tokens share max_output_tokens, and the
    // default reply budget (400) is sized for a non-thinking model. Enabling it
    // requires raising AI_REPLY_TOKENS — see reasoningBudgetError below.
    thinking: process.env.AI_THINKING || "disabled",
    replyTokens: parseInt(process.env.AI_REPLY_TOKENS || "400", 10),
    toolTokens: parseInt(process.env.AI_TOOL_TOKENS || "1600", 10),
    // Tool rounds per turn (1-8). Every round replays the conversation when response
    // chaining is off, so this multiplies the input cost of a hard question.
    toolRounds: Math.max(1, Math.min(8, parseInt(process.env.AI_TOOL_ROUNDS || "4", 10) || 4)),
    // Previous messages replayed each turn. Lower = cheaper, shorter memory —
    // with response chaining off, every one of these is re-sent on every round.
    historyTurns: Math.max(2, Math.min(24, parseInt(process.env.AI_HISTORY_TURNS || "8", 10) || 8)),
    // Inactivity watchdog per streaming round: abort a round that yields no chunk
    // for this long (0 = disabled). Size from p99 round latency — never below
    // observed slow successes, or it converts slow replies into failures.
    stallMs: Math.max(0, parseInt(process.env.AI_STALL_MS || "0", 10) || 0),
  },
  // Food lookup: Open Food Facts first (free), optional web-search fallback.
  food: {
    offUserAgent: process.env.OFF_USER_AGENT || "LogApp/1.0 (meal logging)",
    searchApiKey: process.env.TAVILY_API_KEY || process.env.WEB_SEARCH_API_KEY || "",
  },
  cors: {
    allowedOrigins: parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS),
  },
  // GET /metrics is 404 unless METRICS_TOKEN is set; scrapers then send it as a
  // bearer token. Off by default so no new surface exists without a decision.
  metrics: {
    token: process.env.METRICS_TOKEN || "",
  },
  sentry: {
    dsn: process.env.SENTRY_DSN || "",
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
    release: process.env.SENTRY_RELEASE || undefined,
  },
};

/**
 * Reasoning tokens count against `max_output_tokens`; a thinking model with a
 * ~400-token reply budget can burn the whole ceiling before writing anything,
 * and the turn then surfaces as"that change was too large" (or an empty reply).
 * The minimum leaves room for both the reasoning and the short final answer.
 */
export const REASONING_MIN_REPLY_TOKENS = 1500;

/** A human-readable reason the thinking + budget combo is unusable, or null. */
export function reasoningBudgetError(thinking: string, replyTokens: number): string | null {
  if (thinking === "disabled") return null;
  if (replyTokens >= REASONING_MIN_REPLY_TOKENS) return null;
  return (
    `AI_THINKING=${thinking} enables reasoning, but AI_REPLY_TOKENS is ${replyTokens}. ` +
    `Reasoning tokens share the output budget, so the final answer can be truncated to nothing. ` +
    `Set AI_REPLY_TOKENS to at least ${REASONING_MIN_REPLY_TOKENS}, or leave AI_THINKING unset (default: disabled).`
  );
}

/** Required-at-boot env vars, from a config-shaped object (pure, for tests). */
export function collectMissingRuntimeConfig(cfg: {
  database: { url: string };
  clerk: { secretKey: string };
  ai: { apiKey: string };
}): string[] {
  const missing: string[] = [];
  if (!cfg.database.url) missing.push("DATABASE_URL");
  if (!cfg.clerk.secretKey) missing.push("CLERK_SECRET_KEY");
  // The coach/meal/plan-generation provider is happy with AI_API_KEY alone.
  // OPENAI_API_KEY is only needed by plan *import* (services/planParser.ts),
  // which fails with friendly copy rather than at boot.
  if (!cfg.ai.apiKey) missing.push("AI_API_KEY (or COMMANDCODE_API_KEY / OPENAI_API_KEY)");
  return missing;
}

export function validateRuntimeConfig(): void {
  const missing = collectMissingRuntimeConfig(config);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const budgetProblem = reasoningBudgetError(config.ai.thinking, config.ai.replyTokens);
  if (budgetProblem) {
    throw new Error(budgetProblem);
  }

  if (!config.openai.apiKey) {
    console.warn(
      "[config] OPENAI_API_KEY is not set — AI plan import (POST /api/plans/parse) is unavailable.",
    );
  }
}
