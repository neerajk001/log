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
    // Reasoning-heavy chat turns.
    chatSmart: process.env.COACH_MODEL || "gpt-4.1",
    // Program generation (the coach writing a full plan). A dedicated, strong model:
    // a wrong split is expensive to undo, and cheaper models tripped the plan
    // schema. Falls back to the chat model when unset.
    plan: process.env.COACH_PLAN_MODEL || process.env.COACH_MODEL || "gpt-4.1",
    // Physique photo analysis runs on the cheap vision model (Command Code by
    // default, same family as meal photos) — no longer OpenAI.
    physique:
      process.env.COACH_PHYSIQUE_MODEL ||
      process.env.COACH_MEAL_VISION_MODEL ||
      "deepseek/deepseek-v4-flash-vision-exp",
    // Meal photo/description estimation (needs vision + accuracy).
    meal: process.env.COACH_MEAL_MODEL || process.env.COACH_VISION_MODEL || process.env.COACH_MODEL || "gpt-4.1",
    // Meal photos only. Kept separate from `meal` because a text model accepts an
    // image request and silently returns nothing: the photo path needs a model
    // that actually reads images (e.g. deepseek/deepseek-v4-flash-vision-exp).
    mealVision: process.env.COACH_MEAL_VISION_MODEL || process.env.COACH_VISION_MODEL || "gpt-4.1",
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
    thinking: process.env.AI_THINKING || "",
    replyTokens: parseInt(process.env.AI_REPLY_TOKENS || "400", 10),
    toolTokens: parseInt(process.env.AI_TOOL_TOKENS || "1600", 10),
    // Tool rounds per turn (1-8). Every round replays the conversation when response
    // chaining is off, so this multiplies the input cost of a hard question.
    toolRounds: Math.max(1, Math.min(8, parseInt(process.env.AI_TOOL_ROUNDS || "4", 10) || 4)),
    // Previous messages replayed each turn. Lower = cheaper, shorter memory —
    // with response chaining off, every one of these is re-sent on every round.
    historyTurns: Math.max(2, Math.min(24, parseInt(process.env.AI_HISTORY_TURNS || "8", 10) || 8)),
  },
  // Food lookup: Open Food Facts first (free), optional web-search fallback.
  food: {
    offUserAgent: process.env.OFF_USER_AGENT || "LogApp/1.0 (meal logging)",
    searchApiKey: process.env.TAVILY_API_KEY || process.env.WEB_SEARCH_API_KEY || "",
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
