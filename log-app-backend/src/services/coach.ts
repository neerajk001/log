import { config } from "../config";
import { prisma } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import { parsePlanOutput, PlanParseError } from "./planParser";
import { resolvePlanDayForDate } from "./planRotation";
import { parsedPlanSchema, type ParsedPlan } from "../validation/schemas";

const CONTEXT_WINDOW_DAYS = 28;
const HISTORY_TURNS = 12;
const PROMPT_CACHE_KEY = "log-coach-v1";

/** Messages about eating food → the meal agent. */
const MEAL_HINT =
  /\b(ate|eat|eaten|eating|drank|drink|meal|breakfast|lunch|dinner|snack|food|portion|serving|calorie|calories|kcal|roti|chapati|naan|rice|dal|curry|curd|yogurt|paneer|chicken|beef|fish|egg|eggs|oats|milk|banana|apple|whey)\b/i;

/** Messages about the plan/lifts → the training agent. */
const TRAINING_HINT =
  /\b(plan|workout|exercise|squat|bench|deadlift|overhead press|row|pull|push|curl|lift|lifts|deload|program|split|routine|swap|replace|plateau|stall|volume|training|reps?)\b/i;

const COACH_MAIN = `You are an evidence-based strength and fat-loss coach inside a tracking app.

You are given TODAY's date, the units in use, and a bounded summary of the athlete's real data under
"ATHLETE CONTEXT". Use only that data — never invent numbers or history.

Facts and honesty:
- Ground every claim in the given data and quote the values you cite; say plainly when there is not
  enough data instead of guessing.
- What you CAN see: profile/goal, ~4 weeks of weight and nutrition (averages plus recent daily
  weights), top sets and weekly volume per exercise, this-vs-last-week lift trend, activity minutes,
  recent weekly verdicts, and the active plan's days.
- What you CANNOT see: individual sets beyond the top set, individual meals, or anything older than
  ~4 weeks. If asked about those, say so.
- You have tools to look up the athlete's data on demand; prefer calling a tool over guessing, and
  don't call one for facts already in the context above.
- "What did I log" questions: call get_day_logs and report exactly what it returns — including
  off-plan exercises. Use get_plan_vs_actual ONLY for plan-adherence questions (it compares against
  the prescription and exercise names may differ), never to state what was logged, and never say a
  planned exercise "wasn't logged" unless that day's logs actually show it missing.
- You are not a doctor: never diagnose or give medical advice. For injuries or medical concerns, tell
  the user to consult a professional.`;

const COACH_STYLE = `How to write (this matters as much as the content):
- Sound like a coach texting a client: warm, direct, second person, contractions ("you're", "I'd"). A
  person talking, not a report.
- Lead with the takeaway in the first sentence. No preamble, no "great question", no restating what
  they asked, and no summary at the end.
- One short paragraph (2-4 sentences), or two at most — aim for under ~100 words.
- Cite at most 2-3 numbers, only the ones that drive the advice.
- End with one clear recommendation. Use a short bullet list only for 3 or more discrete steps.
- You may bold one short phrase with **double asterisks**; use no other formatting.
- If it genuinely needs more, stop and offer "want me to go deeper?" instead of writing an essay.
- If a missing detail blocks the answer, ask one short clarifying question.`;

const PLAN_PROPOSAL_RULES = `- You can PROPOSE changes to the athlete's plan and logged sets: update_plan (rewrite a plan's
  days/exercises/sets/reps, optionally rename it), activate_plan (switch which plan is active),
  delete_plan, update_logged_set, delete_logged_set. These never change anything themselves — they
  create a proposal the athlete reviews and confirms in the app. Use get_plans to see their plans and
  current prescriptions, and get_lift_history (each set includes its id) to target a logged set. Only
  propose when the athlete asks for a change or clearly agrees to one, and NEVER say a change is done
  — say you've prepared it and it's waiting for their confirmation, then briefly state what you proposed.`;

const MEAL_RULES = `- The athlete can log what they ate right here in chat. Estimate calories and protein per item from a
  common portion and put the assumed portion in the item's "quantity" (e.g. "1 cup cooked"). Keep
  estimates close to accurate and conservative; use the common home preparation for regional dishes.
  When a portion or dish is genuinely ambiguous, ask ONE short clarifying question instead of guessing
  and wait for the answer. Use get_meals to see what's already logged (avoid duplicates), then call
  log_meal to propose it — update_meal / delete_meal to correct one. Never say a meal is logged before
  the athlete confirms.
- Branded or packaged food (or anything you're unsure about): call lookup_food first and base the estimate
  on its per-100 g figures times the portion you assume — say where the numbers came from and the portion.
  If nothing is found, ask for the label or quantity, or estimate and say it's an estimate.`;

const FOCUS_GENERAL = `Your job: answer anything about the athlete's training, nutrition and progress — you have every tool.
${PLAN_PROPOSAL_RULES}
${MEAL_RULES}`;

const FOCUS_MEAL = `Your job right now: help the athlete log what they ate, and correct or remove meals they already logged.
${MEAL_RULES}`;

const FOCUS_TRAINING = `Your job right now: manage their training — review the plan, look at logged lifts, and propose
changes (edit a plan, swap/reorder exercises or sets, switch or delete a plan, fix a logged set).
${PLAN_PROPOSAL_RULES}`;

const COACH_SYSTEM = `${COACH_MAIN}\n\n${FOCUS_GENERAL}\n\n${COACH_STYLE}`;

const PLAN_SYSTEM = `You design structured workout programs and return them as JSON only.

Output ONLY a JSON object, no surrounding text and no markdown fences, matching exactly:
{
  "days": [
    { "day_name": "string", "exercises": [ { "name": "string", "sets": number, "reps": "string", "weight_kg": number } ] }
  ]
}

Rules:
- Respect the athlete's available training days, experience, and equipment.
- "day_name" is a label like "Push", "Pull", "Legs", "Upper", "Lower", "Full Body".
- "reps" preserves notation as a string (e.g. "5", "8-12").
- Include "weight_kg" only when the athlete gave a target weight or their history
  makes one obvious; otherwise omit the field.
- Use 3-8 exercises per day; keep it realistic for the stated experience level.`;

type InputPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string };

type InputMessage = { role: "user" | "assistant"; content: InputPart[] };

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday 00:00 UTC of the ISO week containing `d`. */
function startOfIsoWeekUtc(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return utc;
}

/** Top set per exercise within `[start, end)`. */
function topSetByWindow(
  lifts: { date: Date; exerciseName: string; weightKg: unknown }[],
  start: Date,
  end: Date,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of lifts) {
    if (l.date < start || l.date >= end) continue;
    const w = Number(l.weightKg);
    const prev = map.get(l.exerciseName);
    if (prev == null || w > prev) map.set(l.exerciseName, w);
  }
  return map;
}

/**
 * A compact, token-bounded summary of the athlete's profile and last ~4 weeks
 * of data: weight/nutrition averages plus recent daily weights, per-exercise
 * top sets and volume, this-vs-last-week lift trend, activity minutes, recent
 * verdicts and the active plan. Aggregates only — no raw log dumps.
 *
 * `today` is the athlete's LOCAL date (YYYY-MM-DD) — the server may be on UTC,
 * which can be a day behind/ahead of them.
 */
export async function buildAthleteContext(
  userId: string,
  today: string = fmtDate(new Date()),
): Promise<string> {
  const now = new Date(`${today}T00:00:00Z`);
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - CONTEXT_WINDOW_DAYS);

  const [profile, daily, lifts, verdicts, plan, activities, memory] = await Promise.all([
    prisma.coachProfile.findUnique({ where: { userId } }),
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "asc" },
      select: { date: true, weightKg: true, calories: true, proteinG: true, sleepHours: true },
    }),
    prisma.liftLog.findMany({
      where: { userId, date: { gte: since } },
      select: { date: true, exerciseName: true, weightKg: true, reps: true },
    }),
    prisma.weeklyVerdict.findMany({
      where: { userId },
      orderBy: { weekStartDate: "desc" },
      take: 6,
    }),
    prisma.workoutPlan.findFirst({
      where: { userId, isActive: true },
      include: { planDays: { orderBy: { dayOrder: "asc" } } },
    }),
    prisma.activityLog.findMany({
      where: { userId, date: { gte: since } },
      select: { durationMin: true, activityType: true },
    }),
    prisma.coachMemory.findUnique({ where: { userId } }),
  ]);

  const lines: string[] = [];

  if (profile) {
    const bits = [
      profile.goal && `goal=${profile.goal}`,
      profile.weightKg != null && `weight=${Number(profile.weightKg)}kg`,
      profile.targetWeightKg != null && `target=${Number(profile.targetWeightKg)}kg`,
      profile.heightCm != null && `height=${profile.heightCm}cm`,
      profile.experience && `experience=${profile.experience}`,
      profile.daysPerWeek != null && `days/week=${profile.daysPerWeek}`,
      profile.equipment && `equipment=${profile.equipment}`,
      profile.dietNotes && `diet=${profile.dietNotes}`,
      profile.injuries && `injuries=${profile.injuries}`,
      profile.notes && `notes=${profile.notes}`,
    ].filter(Boolean);
    if (bits.length > 0) lines.push(`PROFILE: ${bits.join("; ")}`);
  }

  if (memory?.summary) {
    lines.push(`LONG-TERM MEMORY (what you remember about this athlete): ${memory.summary}`);
  }

  const weights = daily.filter((d) => d.weightKg != null).map((d) => Number(d.weightKg));
  if (weights.length > 0) {
    const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
    lines.push(
      `WEIGHT (last ${CONTEXT_WINDOW_DAYS}d): ${weights.length} entries, first ${weights[0]}kg, latest ${weights[weights.length - 1]}kg, avg ${avg.toFixed(1)}kg`,
    );
  }

  const recentWeights = daily.filter((d) => d.weightKg != null).slice(-7);
  if (recentWeights.length > 0) {
    lines.push(
      `WEIGHT (recent days): ${recentWeights
        .map((d) => `${fmtDate(d.date)}=${Number(d.weightKg)}`)
        .join(", ")}`,
    );
  }

  const avgOf = (values: number[]): number | null =>
    values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const calories = avgOf(daily.filter((d) => d.calories != null).map((d) => d.calories as number));
  const protein = avgOf(daily.filter((d) => d.proteinG != null).map((d) => d.proteinG as number));
  const sleep = avgOf(daily.filter((d) => d.sleepHours != null).map((d) => Number(d.sleepHours)));
  const nutrition = [
    calories != null && `calories=${Math.round(calories)}`,
    protein != null && `protein=${Math.round(protein)}g`,
    sleep != null && `sleep=${sleep.toFixed(1)}h`,
  ].filter(Boolean);
  if (nutrition.length > 0) {
    lines.push(`NUTRITION (avg/day, last ${CONTEXT_WINDOW_DAYS}d): ${nutrition.join(", ")}`);
  }

  const byExercise = new Map<string, { top: number; volume: number }>();
  for (const l of lifts) {
    const w = Number(l.weightKg);
    const entry = byExercise.get(l.exerciseName) ?? { top: 0, volume: 0 };
    entry.top = Math.max(entry.top, w);
    entry.volume += w * l.reps;
    byExercise.set(l.exerciseName, entry);
  }
  if (byExercise.size > 0) {
    const ranked = Array.from(byExercise.entries())
      .sort((a, b) => b[1].volume - a[1].volume)
      .slice(0, 12)
      .map(([name, e]) => `${name}: ${e.top}kg top / ${Math.round(e.volume)}kg vol`);
    lines.push(`LIFTS (last ${CONTEXT_WINDOW_DAYS}d): ${ranked.join("; ")}`);
  }

  // This week's top set vs last week's, per exercise (ISO weeks).
  const thisWeekStart = startOfIsoWeekUtc(now);
  const nextWeekStart = new Date(thisWeekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const thisWeekTop = topSetByWindow(lifts, thisWeekStart, nextWeekStart);
  const lastWeekTop = topSetByWindow(lifts, lastWeekStart, thisWeekStart);
  if (thisWeekTop.size > 0) {
    const trend = Array.from(thisWeekTop.entries())
      .slice(0, 10)
      .map(([name, kg]) => {
        const prev = lastWeekTop.get(name);
        return prev != null ? `${name}: ${prev}->${kg}kg` : `${name}: ${kg}kg (no last wk)`;
      });
    lines.push(`LIFT TREND (this wk vs last wk, top set): ${trend.join("; ")}`);
  }

  if (activities.length > 0) {
    const totalMin = activities.reduce((s, a) => s + a.durationMin, 0);
    const counts = new Map<string, number>();
    for (const a of activities) counts.set(a.activityType, (counts.get(a.activityType) ?? 0) + 1);
    const byType = Array.from(counts.entries())
      .map(([t, n]) => `${t} ${n}`)
      .join(", ");
    lines.push(
      `ACTIVITY (last ${CONTEXT_WINDOW_DAYS}d): ${activities.length} sessions, ${totalMin} min total (${byType})`,
    );
  }

  const latestVerdict = verdicts[0] ?? null;
  if (latestVerdict) {
    const trend =
      latestVerdict.weightTrendKgPerWeek == null
        ? "n/a"
        : Number(latestVerdict.weightTrendKgPerWeek).toFixed(2);
    const reasoning = (latestVerdict.reasoning as unknown as string[] | null) ?? [];
    lines.push(
      `WEEKLY VERDICT (week of ${fmtDate(latestVerdict.weekStartDate)}): ${latestVerdict.verdict}, weight trend ${trend} kg/wk, strength ${latestVerdict.strengthTrend ?? "n/a"}, adherence ${latestVerdict.adherencePct ?? "n/a"}%. Reasoning: ${reasoning.join(" | ")}`,
    );
  }
  if (verdicts.length > 1) {
    lines.push(
      `VERDICT HISTORY (newest first): ${verdicts
        .map((v) => `${fmtDate(v.weekStartDate)}=${v.verdict}`)
        .join(", ")}`,
    );
  }

  if (plan) {
    lines.push(`ACTIVE PLAN "${plan.name}": ${plan.planDays.map((d) => d.dayName).join(", ")}`);
  }

  if (lines.length === 0) return "No logged data yet.";
  return [`TODAY: ${today} (the athlete's local date; units: kg, kcal, g, hours)`, ...lines].join("\n");
}

/**
 * Picks a chat model by how much reasoning the turn probably needs: short,
 * factual questions go to the cheap/fast model; anything long or reasoning-heavy
 * (why, change, adjust, analyze, plateau, check-in, …) goes to the strong one.
 */
export function routeChatModel(message: string): string {
  const text = message.trim();
  const looksDeep =
    text.length > 120 ||
    /\b(why|explain|analys|analyz|review|compare|should i|change|adjust|program|routine|split|periodi|deload|progress|stall|plateau|injur|pain|macro|calorie|deficit|surplus|check[- ]?in)/i.test(
      text,
    );
  return looksDeep ? config.models.chatSmart : config.models.chatFast;
}

type AiProvider = "ai" | "openai";

/**
 * Resolves the endpoint for a call. "ai" is the coach/meal provider (OpenAI by
 * default, or any OpenAI-Responses-compatible endpoint via AI_BASE_URL);
 * "openai" is pinned to OpenAI for plan generation and physique analysis.
 */
function resolveProvider(name: AiProvider): { baseUrl: string; apiKey: string } {
  if (name === "openai") {
    return { baseUrl: "https://api.openai.com/v1", apiKey: config.openai.apiKey };
  }
  return { baseUrl: config.ai.baseUrl, apiKey: config.ai.apiKey || config.openai.apiKey };
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

async function callModel(
  instructions: string,
  input: InputMessage[],
  maxOutputTokens: number,
  options: { json?: boolean; model: string; provider?: AiProvider; thinking?: boolean },
): Promise<string> {
  const providerName = options.provider ?? "ai";
  const { baseUrl, apiKey } = resolveProvider(providerName);
  if (!apiKey) {
    throw new AppError(503, "COACH_UNAVAILABLE", "The AI coach is not configured");
  }
  const promptCache = providerName === "openai" || config.ai.promptCache;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        instructions,
        input,
        ...(promptCache ? { prompt_cache_key: PROMPT_CACHE_KEY } : {}),
        // Reasoning models (e.g. DeepSeek Flash) can be told to skip "thinking".
        ...(options.thinking === false ? { thinking: { type: "disabled" } } : {}),
        ...(options.json ? { text: { format: { type: "json_object" } } } : {}),
        max_output_tokens: maxOutputTokens,
      }),
    });
  } catch {
    throw new AppError(502, "COACH_UNREACHABLE", "Could not reach the AI service");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const host = hostOf(baseUrl);
    console.error(`[coach] ${host} error ${res.status}:`, detail.slice(0, 300));
    throw new AppError(502, "COACH_ERROR", `The AI service (${host}) returned ${res.status}`);
  }

  const data = (await res.json()) as {
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  if (data.usage) {
    console.log(
      "[coach] usage",
      JSON.stringify({
        model: options.model,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      }),
    );
  }
  const text = data.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;

  if (!text || text.trim().length === 0) {
    throw new AppError(502, "COACH_EMPTY", "The AI returned no content");
  }
  return text.trim();
}

/** One chat turn: builds context, calls the model, persists both messages. */
export async function runCoachChat(userId: string, message: string): Promise<string> {
  const [context, recent] = await Promise.all([
    buildAthleteContext(userId),
    prisma.coachMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
      select: { role: true, content: true },
    }),
  ]);

  const history: InputMessage[] = recent
    .reverse()
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [
        {
          type: m.role === "assistant" ? "output_text" : "input_text",
          text: m.content,
        },
      ] as InputPart[],
    }));

  const reply = await callModel(
    `${COACH_SYSTEM}\n\n--- ATHLETE CONTEXT (their real logged data) ---\n${context}`,
    [...history, { role: "user", content: [{ type: "input_text", text: message }] }],
    400,
    { model: routeChatModel(message), thinking: false },
  );

  await prisma.$transaction([
    prisma.coachMessage.create({ data: { userId, role: "user", content: message } }),
    prisma.coachMessage.create({ data: { userId, role: "assistant", content: reply } }),
  ]);

  return reply;
}

export interface CoachUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type OpenAIEvent =
  | { kind: "text"; delta: string }
  | { kind: "function-call"; callId: string; name: string; args: string }
  | { kind: "completed"; responseId: string | null; usage: CoachUsage | null }
  | { kind: "incomplete"; responseId: string | null; usage: CoachUsage | null }
  | { kind: "other" };

/**
 * Parses one OpenAI Responses SSE `data:` payload into the events we act on:
 * streamed text deltas, completed function calls, and the final completion
 * (which carries the response id for chaining plus token usage).
 */
export function parseOpenAIEvent(payload: string): OpenAIEvent {
  if (!payload || payload === "[DONE]") return { kind: "other" };
  let event: {
    type?: string;
    delta?: unknown;
    item?: { type?: string; call_id?: string; name?: string; arguments?: string };
    response?: {
      id?: string;
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    };
  };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return { kind: "other" };
  }
  if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
    return { kind: "text", delta: event.delta };
  }
  if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
    return {
      kind: "function-call",
      callId: event.item.call_id ?? "",
      name: event.item.name ?? "",
      args: event.item.arguments ?? "{}",
    };
  }
  if (event.type === "response.completed") {
    const usage = event.response?.usage;
    return {
      kind: "completed",
      responseId: event.response?.id ?? null,
      usage: usage
        ? {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          }
        : null,
    };
  }
  if (event.type === "response.incomplete" || event.type === "response.failed") {
    const usage = event.response?.usage;
    return {
      kind: "incomplete",
      responseId: event.response?.id ?? null,
      usage: usage
        ? {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          }
        : null,
    };
  }
  return { kind: "other" };
}

/** Convenience wrapper: the text delta from a payload, or null. */
export function parseOpenAIDelta(payload: string): string | null {
  const event = parseOpenAIEvent(payload);
  return event.kind === "text" ? event.delta : null;
}

/* ----------------------------------------------------------- coach tools */

const MAX_TOOL_ROUNDS = 4;
const MAX_TOOL_DAYS = 90;

/** Responses-API tool definitions (flat name/parameters, not nested). */
const COACH_TOOLS = [
  {
    type: "function",
    name: "get_lift_history",
    description:
      "Look up the athlete's logged sets for an exercise (or all exercises) over the last N days.",
    parameters: {
      type: "object",
      properties: {
        exercise: { type: "string", description: "Exercise name to filter by (optional)." },
        days: { type: "number", description: "How many days back, 1-90 (default 28)." },
      },
    },
  },
  {
    type: "function",
    name: "get_day_logs",
    description:
      "Everything the athlete ACTUALLY logged on one day (defaults to today): lifts grouped by exercise with set counts and top set, plus daily values and activities. Use this to answer 'what did I log' questions.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD; defaults to today." } },
    },
  },
  {
    type: "function",
    name: "get_daily_logs",
    description: "Look up daily body-weight, calories, protein and sleep over the last N days.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "How many days back, 1-90 (default 28)." } },
    },
  },
  {
    type: "function",
    name: "get_weekly_verdicts",
    description: "Look up the athlete's recent weekly verdicts and their reasoning.",
    parameters: {
      type: "object",
      properties: { count: { type: "number", description: "How many recent weeks, 1-12 (default 6)." } },
    },
  },
  {
    type: "function",
    name: "get_plan_vs_actual",
    description:
      "Compare the active plan's prescribed exercises for a date with what was actually logged.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD; defaults to today." },
      },
    },
  },
  {
    type: "function",
    name: "get_activity_logs",
    description: "Look up cardio/other activity sessions (type, duration, distance) over the last N days.",
    parameters: {
      type: "object",
      properties: { days: { type: "number", description: "How many days back, 1-90 (default 28)." } },
    },
  },
  {
    type: "function",
    name: "get_plans",
    description:
      "List the athlete's saved workout plans with their days and exercises (id, name, is_active).",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function",
    name: "update_plan",
    description:
      "PROPOSE a change to a plan. To change ONE day, pass day_name + exercises (that day's new exercises) — prefer this. To replace the whole plan, pass days. Optionally rename with name. Does not apply — creates a proposal the athlete confirms.",
    parameters: {
      type: "object",
      properties: {
        plan: { type: "string", description: "Plan name or id to update; omit to use the active plan." },
        day_name: { type: "string", description: "The single day to change (e.g. 'Lower'). Use with exercises." },
        exercises: {
          type: "array",
          description: "New exercises for day_name (replaces just that day's exercises).",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              sets: { type: "number" },
              reps: { type: "string" },
            },
            required: ["name", "sets", "reps"],
          },
        },
        days: {
          type: "array",
          description: "The COMPLETE new set of workout days (replaces all of the plan's days).",
          items: {
            type: "object",
            properties: {
              day_name: { type: "string" },
              exercises: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    sets: { type: "number" },
                    reps: { type: "string" },
                  },
                  required: ["name", "sets", "reps"],
                },
              },
            },
            required: ["day_name", "exercises"],
          },
        },
        name: { type: "string", description: "New plan name (optional)." },
        summary: { type: "string", description: "One short sentence describing the change." },
      },
    },
  },
  {
    type: "function",
    name: "activate_plan",
    description:
      "PROPOSE making a plan the active one (only one plan is active at a time). Does not apply — creates a proposal.",
    parameters: {
      type: "object",
      properties: { plan: { type: "string", description: "Plan name or id." } },
      required: ["plan"],
    },
  },
  {
    type: "function",
    name: "delete_plan",
    description: "PROPOSE deleting a plan. Does not apply — creates a proposal.",
    parameters: {
      type: "object",
      properties: { plan: { type: "string", description: "Plan name or id." } },
      required: ["plan"],
    },
  },
  {
    type: "function",
    name: "update_logged_set",
    description:
      "PROPOSE a correction to one already-logged set (weight and/or reps). Does not apply — creates a proposal.",
    parameters: {
      type: "object",
      properties: {
        set_id: { type: "string", description: "The set's id, from get_lift_history." },
        weight_kg: { type: "number" },
        reps: { type: "number" },
      },
      required: ["set_id", "weight_kg", "reps"],
    },
  },
  {
    type: "function",
    name: "delete_logged_set",
    description: "PROPOSE deleting one already-logged set. Does not apply — creates a proposal.",
    parameters: {
      type: "object",
      properties: { set_id: { type: "string", description: "The set's id, from get_lift_history." } },
      required: ["set_id"],
    },
  },
  {
    type: "function",
    name: "get_meals",
    description:
      "List the meals the athlete has logged for a day (defaults to today), with per-item calories/protein and totals.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD; defaults to today." } },
    },
  },
  {
    type: "function",
    name: "log_meal",
    description:
      "PROPOSE logging a meal the athlete described (or a photo). Estimate each item's calories and protein from a common portion and state the assumed portion in `quantity`. Does not apply — creates a proposal the athlete confirms.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD; defaults to today." },
        title: { type: "string", description: "Short label, e.g. 'Breakfast' or 'Chicken rice'." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "string", description: "Assumed portion, e.g. '1 cup cooked'." },
              calories: { type: "number" },
              protein_g: { type: "number" },
            },
            required: ["name", "calories", "protein_g"],
          },
        },
        summary: { type: "string", description: "One short sentence for the athlete." },
      },
      required: ["title", "items"],
    },
  },
  {
    type: "function",
    name: "update_meal",
    description:
      "PROPOSE correcting a previously logged meal (fix items/portions). Does not apply — creates a proposal.",
    parameters: {
      type: "object",
      properties: {
        meal_id: { type: "string", description: "The meal's id, from get_meals." },
        title: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "string" },
              calories: { type: "number" },
              protein_g: { type: "number" },
            },
            required: ["name", "calories", "protein_g"],
          },
        },
      },
      required: ["meal_id", "items"],
    },
  },
  {
    type: "function",
    name: "delete_meal",
    description: "PROPOSE deleting a logged meal. Does not apply — creates a proposal.",
    parameters: {
      type: "object",
      properties: { meal_id: { type: "string", description: "The meal's id, from get_meals." } },
      required: ["meal_id"],
    },
  },
  {
    type: "function",
    name: "lookup_food",
    description:
      "Look up a branded/packaged food or a dish to get real calories and protein (Open Food Facts, then web). Prefer this over guessing for brands or anything you're unsure about.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'Brand + product or dish, e.g. "Kellogg\'s corn flakes" or "Amul butter".',
        },
      },
      required: ["query"],
    },
  },
];

/* --------------------------------------------------------------- agents */

export type AgentId = "general" | "meal" | "training";

const MEAL_TOOL_NAMES = [
  "get_meals",
  "log_meal",
  "update_meal",
  "delete_meal",
  "get_day_logs",
  "lookup_food",
];
const TRAINING_TOOL_NAMES = [
  "get_plans",
  "get_plan_vs_actual",
  "get_lift_history",
  "update_plan",
  "activate_plan",
  "delete_plan",
  "update_logged_set",
  "delete_logged_set",
];

function toolsNamed(names: string[]) {
  return COACH_TOOLS.filter((t) => names.includes(t.name));
}

function agentSystem(focus: string): string {
  return `${COACH_MAIN}\n\n${focus}\n\n${COACH_STYLE}`;
}

export interface Agent {
  id: AgentId;
  label: string;
  system: string;
  tools: unknown[];
  model: (message: string) => string;
  /** Whether to let a reasoning model "think" (off for speed on chat). */
  thinking: boolean;
}

export const AGENTS: Record<AgentId, Agent> = {
  general: {
    id: "general",
    label: "General",
    system: COACH_SYSTEM,
    tools: COACH_TOOLS,
    model: (m) => routeChatModel(m),
    thinking: config.ai.thinking !== "disabled",
  },
  meal: {
    id: "meal",
    label: "Meals",
    system: agentSystem(FOCUS_MEAL),
    tools: toolsNamed(MEAL_TOOL_NAMES),
    model: () => config.models.meal,
    thinking: true,
  },
  training: {
    id: "training",
    label: "Training",
    system: agentSystem(FOCUS_TRAINING),
    tools: toolsNamed(TRAINING_TOOL_NAMES),
    model: () => config.models.chatSmart,
    thinking: config.ai.thinking !== "disabled",
  },
};

export function isAgentId(value: unknown): value is AgentId {
  return value === "general" || value === "meal" || value === "training";
}

/**
 * Picks an agent for a turn. An explicit pick (from the UI chips) always wins;
 * otherwise keywords route meal/training, and everything else stays general
 * (which keeps every tool, so a misroute is still answerable).
 */
export function routeAgent(message: string, requested?: AgentId): AgentId {
  if (requested && requested in AGENTS) return requested;
  const text = message.trim();
  if (MEAL_HINT.test(text)) return "meal";
  if (TRAINING_HINT.test(text)) return "training";
  return "general";
}

const TOOL_LABELS: Record<string, string> = {
  get_lift_history: "Checking your lift history…",
  get_day_logs: "Pulling up that day's log…",
  get_daily_logs: "Reading your daily logs…",
  get_weekly_verdicts: "Reviewing your weekly verdicts…",
  get_plan_vs_actual: "Comparing your plan with what you logged…",
  get_activity_logs: "Checking your activities…",
  get_plans: "Reading your plans…",
  update_plan: "Putting together a plan update…",
  activate_plan: "Preparing to switch plans…",
  delete_plan: "Preparing to delete the plan…",
  update_logged_set: "Preparing that set correction…",
  delete_logged_set: "Preparing to remove that set…",
  get_meals: "Reading your meals…",
  log_meal: "Working out that meal…",
  update_meal: "Preparing that meal correction…",
  delete_meal: "Preparing to remove that meal…",
};

function clampDays(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(MAX_TOOL_DAYS, Math.floor(n)));
}

function daysAgo(days: number, today: string): Date {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

export type CoachProposal =
  | {
      kind: "plan_update";
      plan_id: string;
      plan_name: string;
      name: string;
      source: string;
      days: { day_name: string; exercises: { name: string; sets: number; reps: string }[] }[];
      summary: string;
    }
  | { kind: "plan_activate"; plan_id: string; plan_name: string }
  | { kind: "plan_delete"; plan_id: string; plan_name: string }
  | {
      kind: "set_update";
      set_id: string;
      date: string;
      exercise: string;
      from: { weight_kg: number; reps: number };
      to: { weight_kg: number; reps: number };
    }
  | {
      kind: "set_delete";
      set_id: string;
      date: string;
      exercise: string;
      weight_kg: number;
      reps: number;
    }
  | {
      kind: "meal_log";
      date: string;
      title: string;
      items: MealItemDraft[];
      calories: number;
      protein_g: number;
    }
  | {
      kind: "meal_update";
      meal_id: string;
      date: string;
      title: string;
      items: MealItemDraft[];
      calories: number;
      protein_g: number;
    }
  | {
      kind: "meal_delete";
      meal_id: string;
      date: string;
      title: string;
      calories: number;
      protein_g: number;
    };

interface PlanWithDays {
  id: string;
  name: string;
  source: string;
  isActive: boolean;
  planDays: { id: string; dayName: string; dayOrder: number; exercises: unknown }[];
}

/** Resolve a plan by exact id, exact name, or partial name; the active plan when no ref. */
async function resolvePlan(
  userId: string,
  ref?: string,
): Promise<PlanWithDays | { error: string }> {
  const plans = await prisma.workoutPlan.findMany({
    where: { userId },
    include: { planDays: { orderBy: { dayOrder: "asc" } } },
  });
  if (plans.length === 0) return { error: "You don't have any saved plans yet." };
  if (!ref || !ref.trim()) return plans.find((p) => p.isActive) ?? plans[0];

  const needle = ref.trim().toLowerCase();
  const match =
    plans.find((p) => p.id === ref) ??
    plans.find((p) => p.name.toLowerCase() === needle) ??
    plans.find((p) => p.name.toLowerCase().includes(needle));
  if (!match) {
    return {
      error: `No plan matching "${ref}". Their plans: ${plans.map((p) => p.name).join(", ")}.`,
    };
  }
  return match;
}

function serializePlanSummary(plan: PlanWithDays) {
  return {
    id: plan.id,
    name: plan.name,
    is_active: plan.isActive,
    days: plan.planDays.map((d) => ({
      day_name: d.dayName,
      exercises: d.exercises as unknown as { name: string; sets: number; reps: string }[],
    })),
  };
}

function positiveNumber(value: unknown, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(max, n);
}

function positiveInt(value: unknown, max: number): number | null {
  const n = positiveNumber(value, max);
  return n == null ? null : Math.floor(n);
}

function numValue(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

interface MealItemDraft {
  name: string;
  quantity?: string;
  calories: number;
  protein_g: number;
}

/** Validates and normalises a model-supplied list of meal items. */
function mealItemsFromArgs(raw: unknown): MealItemDraft[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 30) return null;
  const items: MealItemDraft[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const r = entry as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 120) : "";
    const calories = numValue(r.calories, 0, 5000);
    const protein = numValue(r.protein_g, 0, 500);
    if (!name || calories == null || protein == null) return null;
    const quantity =
      typeof r.quantity === "string" && r.quantity.trim() ? r.quantity.trim().slice(0, 60) : undefined;
    items.push({
      name,
      ...(quantity ? { quantity } : {}),
      calories: Math.round(calories),
      protein_g: Math.round(protein),
    });
  }
  return items;
}

/* ------------------------------------------------------- food lookup */

const FOOD_CACHE_MS = 24 * 60 * 60 * 1000;
const foodCache = new Map<string, { at: number; data: unknown }>();

function round1(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

async function fetchJson(
  url: string,
  init?: RequestInit,
  timeoutMs = 6000,
  retries = 0,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= retries) throw err;
      // Open Food Facts is flaky (occasional 503) — one short retry helps.
      await new Promise((resolve) => setTimeout(resolve, 400));
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Looks up a food/brand: Open Food Facts first (structured per-100g), then an
 * optional web search. Cached, and never throws — returns a note when nothing
 * matches so the model can ask the athlete or fall back to estimating.
 */
async function lookupFood(query: string): Promise<unknown> {
  const key = query.trim().toLowerCase();
  const cached = foodCache.get(key);
  if (cached && Date.now() - cached.at < FOOD_CACHE_MS) return cached.data;

  // Open Food Facts dislikes punctuation (and "Kellogg's" must become "Kelloggs").
  const cleaned = query
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const term = cleaned.length >= 2 ? cleaned : query;

  const offUrl =
    "https://world.openfoodfacts.org/cgi/search.pl?" +
    new URLSearchParams({
      search_terms: term,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "5",
      fields: "product_name,brands,serving_size,nutriments",
    }).toString();

  try {
    const data = (await fetchJson(
      offUrl,
      { headers: { "User-Agent": config.food.offUserAgent, Accept: "application/json" } },
      6000,
      1,
    )) as {
      products?: {
        product_name?: string;
        brands?: string;
        serving_size?: string;
        nutriments?: Record<string, unknown>;
      }[];
    };
    const results = (data.products ?? [])
      .map((p) => ({
        name: p.product_name?.trim(),
        brand: p.brands?.trim(),
        serving_size: p.serving_size?.trim(),
        kcal_per_100g: round1(p.nutriments?.["energy-kcal_100g"]),
        protein_per_100g: round1(p.nutriments?.["proteins_100g"]),
      }))
      .filter((r) => r.name && (r.kcal_per_100g != null || r.protein_per_100g != null))
      .slice(0, 3);

    if (results.length > 0) {
      const out = { source: "open_food_facts", results };
      foodCache.set(key, { at: Date.now(), data: out });
      return out;
    }
  } catch (err) {
    // fall through to the web-search fallback
    console.warn("[coach] lookup_food OFF failed:", err instanceof Error ? err.message : err);
  }

  if (config.food.searchApiKey) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: config.food.searchApiKey,
          query: `${query} calories protein per 100g`,
          max_results: 3,
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          results?: { title?: string; url?: string; content?: string }[];
        };
        const results = (data.results ?? [])
          .slice(0, 3)
          .map((r) => ({ title: r.title, url: r.url, snippet: r.content }));
        const out = { source: "web", results };
        foodCache.set(key, { at: Date.now(), data: out });
        return out;
      }
    } catch {
      // fall through to the no-match note
    }
  }

  return {
    results: [],
    note: "No match found. Ask the athlete for the label or quantity, or estimate and say it's an estimate.",
  };
}

/** A proposal returned by a tool; the loop forwards it to the client and tells the model it's pending. */
function extractProposal(output: unknown): CoachProposal | null {
  if (output && typeof output === "object" && "__proposal" in output) {
    return (output as { __proposal: CoachProposal }).__proposal;
  }
  return null;
}

/**
 * Runs one coach tool, scoped to `userId`. Always resolves — a failure becomes
 * an `{ error }` payload so the model can recover instead of the stream dying.
 */
export async function executeCoachTool(
  userId: string,
  name: string,
  rawArgs: string,
  today: string = fmtDate(new Date()),
): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    args = {};
  }

  try {
    switch (name) {
      case "get_lift_history": {
        const where: Record<string, unknown> = { userId, date: { gte: daysAgo(clampDays(args.days, 28), today) } };
        if (typeof args.exercise === "string" && args.exercise.trim()) {
          where.exerciseName = args.exercise.trim();
        }
        const rows = await prisma.liftLog.findMany({
          where,
          orderBy: { date: "desc" },
          take: 100,
          select: { id: true, date: true, exerciseName: true, weightKg: true, reps: true },
        });
        return rows.map((r) => ({
          id: r.id,
          date: fmtDate(r.date),
          exercise: r.exerciseName,
          weight_kg: Number(r.weightKg),
          reps: r.reps,
        }));
      }

      case "get_day_logs": {
        const dateStr = typeof args.date === "string" ? args.date : today;
        const day = new Date(`${dateStr}T00:00:00Z`);
        const [lifts, daily, activities] = await Promise.all([
          prisma.liftLog.findMany({
            where: { userId, date: day },
            orderBy: { createdAt: "asc" },
            select: { exerciseName: true, weightKg: true, reps: true },
          }),
          prisma.dailyLog.findFirst({
            where: { userId, date: day },
            select: { weightKg: true, calories: true, proteinG: true, sleepHours: true },
          }),
          prisma.activityLog.findMany({
            where: { userId, date: day },
            select: { activityType: true, name: true, durationMin: true, distanceKm: true },
          }),
        ]);

        const byExercise = new Map<string, { sets: number; top: { weight_kg: number; reps: number } }>();
        for (const l of lifts) {
          const w = Number(l.weightKg);
          const entry = byExercise.get(l.exerciseName) ?? { sets: 0, top: { weight_kg: 0, reps: 0 } };
          entry.sets += 1;
          if (w > entry.top.weight_kg) entry.top = { weight_kg: w, reps: l.reps };
          byExercise.set(l.exerciseName, entry);
        }

        return {
          date: dateStr,
          lifts: Array.from(byExercise.entries()).map(([exercise, e]) => ({
            exercise,
            sets: e.sets,
            top_set: e.top,
          })),
          daily: daily
            ? {
                weight_kg: daily.weightKg == null ? null : Number(daily.weightKg),
                calories: daily.calories,
                protein_g: daily.proteinG,
                sleep_hours: daily.sleepHours == null ? null : Number(daily.sleepHours),
              }
            : null,
          activities: activities.map((a) => ({
            activity_type: a.activityType,
            name: a.name,
            duration_min: a.durationMin,
            distance_km: a.distanceKm,
          })),
        };
      }

      case "get_daily_logs": {
        const rows = await prisma.dailyLog.findMany({
          where: { userId, date: { gte: daysAgo(clampDays(args.days, 28), today) } },
          orderBy: { date: "desc" },
          take: 90,
          select: { date: true, weightKg: true, calories: true, proteinG: true, sleepHours: true },
        });
        return rows.map((r) => ({
          date: fmtDate(r.date),
          weight_kg: r.weightKg == null ? null : Number(r.weightKg),
          calories: r.calories,
          protein_g: r.proteinG,
          sleep_hours: r.sleepHours == null ? null : Number(r.sleepHours),
        }));
      }

      case "get_weekly_verdicts": {
        const count = Math.max(1, Math.min(12, Math.floor(Number(args.count) || 6)));
        const rows = await prisma.weeklyVerdict.findMany({
          where: { userId },
          orderBy: { weekStartDate: "desc" },
          take: count,
        });
        return rows.map((v) => ({
          week_start: fmtDate(v.weekStartDate),
          verdict: v.verdict,
          weight_trend_kg_per_week:
            v.weightTrendKgPerWeek == null ? null : Number(v.weightTrendKgPerWeek),
          strength_trend: v.strengthTrend,
          adherence_pct: v.adherencePct,
          reasoning: (v.reasoning as unknown as string[] | null) ?? [],
        }));
      }

      case "get_plan_vs_actual": {
        const dateStr = typeof args.date === "string" ? args.date : today;
        const plan = await prisma.workoutPlan.findFirst({
          where: { userId, isActive: true },
          include: { planDays: { orderBy: { dayOrder: "asc" } } },
        });
        if (!plan) return { date: dateStr, day: null, note: "No active plan." };
        const day = resolvePlanDayForDate(plan.createdAt, plan.planDays, new Date(`${dateStr}T00:00:00Z`));
        if (!day) return { date: dateStr, day: null };

        const prescribed = day.exercises as unknown as { name: string; sets: number; reps: string }[];
        // Fetch EVERY logged set that day (not just prescribed names) so off-plan
        // work is visible instead of looking like "not logged".
        const logs = await prisma.liftLog.findMany({
          where: { userId, date: new Date(`${dateStr}T00:00:00Z`) },
          select: { exerciseName: true, weightKg: true, reps: true },
        });
        const prescribedNames = new Set(prescribed.map((e) => e.name));
        const offPlan = Array.from(
          new Set(logs.map((l) => l.exerciseName).filter((n) => !prescribedNames.has(n))),
        );

        return {
          date: dateStr,
          day: day.dayName,
          prescribed: prescribed.map((e) => {
            const mine = logs.filter((l) => l.exerciseName === e.name);
            const top = mine.reduce<{ weight_kg: number; reps: number } | null>((best, l) => {
              const kg = Number(l.weightKg);
              return !best || kg > best.weight_kg ? { weight_kg: kg, reps: l.reps } : best;
            }, null);
            return {
              name: e.name,
              target_sets: e.sets,
              target_reps: e.reps,
              logged_sets: mine.length,
              top_set: top,
            };
          }),
          also_logged_off_plan: offPlan,
        };
      }

      case "get_activity_logs": {
        const rows = await prisma.activityLog.findMany({
          where: { userId, date: { gte: daysAgo(clampDays(args.days, 28), today) } },
          orderBy: { date: "desc" },
          take: 90,
          select: {
            date: true,
            activityType: true,
            name: true,
            durationMin: true,
            distanceKm: true,
            caloriesBurned: true,
          },
        });
        return rows.map((a) => ({
          date: fmtDate(a.date),
          activity_type: a.activityType,
          name: a.name,
          duration_min: a.durationMin,
          distance_km: a.distanceKm,
          calories_burned: a.caloriesBurned,
        }));
      }

      case "get_plans": {
        const plans = await prisma.workoutPlan.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          include: { planDays: { orderBy: { dayOrder: "asc" } } },
        });
        return plans.map((p) => serializePlanSummary(p as PlanWithDays));
      }

      case "update_plan": {
        const ref = typeof args.plan === "string" ? args.plan : undefined;
        const plan = await resolvePlan(userId, ref);
        if ("error" in plan) return plan;

        const existingDays = plan.planDays.map((d) => ({
          day_name: d.dayName,
          exercises: d.exercises as unknown as { name: string; sets: number; reps: string }[],
        }));

        let nextDays: { day_name: string; exercises: { name: string; sets: number; reps: string }[] }[];
        if (Array.isArray(args.days)) {
          nextDays = args.days as typeof nextDays;
        } else if (
          typeof args.day_name === "string" &&
          args.day_name.trim() &&
          Array.isArray(args.exercises)
        ) {
          const target = args.day_name.trim();
          const patched = {
            day_name: target,
            exercises: args.exercises as { name: string; sets: number; reps: string }[],
          };
          const idx = existingDays.findIndex(
            (d) => d.day_name.toLowerCase() === target.toLowerCase(),
          );
          nextDays =
            idx >= 0
              ? existingDays.map((d, i) => (i === idx ? patched : d))
              : [...existingDays, patched];
        } else {
          return {
            error: "Provide day_name + exercises to change one day, or days to replace the whole plan.",
          };
        }

        const parsed = parsedPlanSchema.safeParse({ days: nextDays });
        if (!parsed.success) {
          return { error: `Invalid plan: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
        }
        const newName =
          typeof args.name === "string" && args.name.trim() ? args.name.trim().slice(0, 200) : plan.name;
        const summary =
          typeof args.summary === "string" && args.summary.trim()
            ? args.summary.trim().slice(0, 300)
            : `Update "${plan.name}"`;
        return {
          __proposal: {
            kind: "plan_update",
            plan_id: plan.id,
            plan_name: plan.name,
            name: newName,
            source: plan.source,
            days: parsed.data.days,
            summary,
          },
        };
      }

      case "activate_plan": {
        const ref = typeof args.plan === "string" ? args.plan : undefined;
        const plan = await resolvePlan(userId, ref);
        if ("error" in plan) return plan;
        return { __proposal: { kind: "plan_activate", plan_id: plan.id, plan_name: plan.name } };
      }

      case "delete_plan": {
        const ref = typeof args.plan === "string" ? args.plan : undefined;
        const plan = await resolvePlan(userId, ref);
        if ("error" in plan) return plan;
        return { __proposal: { kind: "plan_delete", plan_id: plan.id, plan_name: plan.name } };
      }

      case "update_logged_set": {
        const setId = typeof args.set_id === "string" ? args.set_id : "";
        const row = await prisma.liftLog.findFirst({
          where: { id: setId, userId },
          select: { id: true, date: true, exerciseName: true, weightKg: true, reps: true },
        });
        if (!row) return { error: "That logged set wasn't found." };
        const weight = positiveNumber(args.weight_kg, 9999);
        const reps = positiveInt(args.reps, 9999);
        if (weight == null || reps == null) {
          return { error: "Provide a positive weight and a whole number of reps." };
        }
        return {
          __proposal: {
            kind: "set_update",
            set_id: row.id,
            date: fmtDate(row.date),
            exercise: row.exerciseName,
            from: { weight_kg: Number(row.weightKg), reps: row.reps },
            to: { weight_kg: weight, reps },
          },
        };
      }

      case "delete_logged_set": {
        const setId = typeof args.set_id === "string" ? args.set_id : "";
        const row = await prisma.liftLog.findFirst({
          where: { id: setId, userId },
          select: { id: true, date: true, exerciseName: true, weightKg: true, reps: true },
        });
        if (!row) return { error: "That logged set wasn't found." };
        return {
          __proposal: {
            kind: "set_delete",
            set_id: row.id,
            date: fmtDate(row.date),
            exercise: row.exerciseName,
            weight_kg: Number(row.weightKg),
            reps: row.reps,
          },
        };
      }

      case "get_meals": {
        const dateStr = typeof args.date === "string" ? args.date : today;
        const meals = await prisma.mealLog.findMany({
          where: { userId, date: new Date(`${dateStr}T00:00:00Z`) },
          orderBy: { createdAt: "asc" },
          select: { id: true, title: true, items: true, calories: true, proteinG: true },
        });
        return {
          date: dateStr,
          meals: meals.map((m) => ({
            id: m.id,
            title: m.title,
            items: m.items as unknown as MealItemDraft[],
            calories: m.calories,
            protein_g: m.proteinG,
          })),
          totals: meals.reduce(
            (acc, m) => ({
              calories: acc.calories + m.calories,
              protein_g: acc.protein_g + m.proteinG,
            }),
            { calories: 0, protein_g: 0 },
          ),
        };
      }

      case "log_meal": {
        const dateStr = typeof args.date === "string" ? args.date : today;
        const title =
          typeof args.title === "string" && args.title.trim()
            ? args.title.trim().slice(0, 120)
            : "Meal";
        const items = mealItemsFromArgs(args.items);
        if (!items) {
          return { error: "Provide a meal title and at least one item with calories and protein." };
        }
        return {
          __proposal: {
            kind: "meal_log",
            date: dateStr,
            title,
            items,
            calories: items.reduce((a, i) => a + i.calories, 0),
            protein_g: Math.round(items.reduce((a, i) => a + i.protein_g, 0)),
          },
        };
      }

      case "update_meal": {
        const id = typeof args.meal_id === "string" ? args.meal_id : "";
        const row = await prisma.mealLog.findFirst({
          where: { id, userId },
          select: { id: true, date: true, title: true },
        });
        if (!row) return { error: "That meal wasn't found." };
        const items = mealItemsFromArgs(args.items);
        if (!items) return { error: "Provide the corrected items with calories and protein." };
        const title =
          typeof args.title === "string" && args.title.trim() ? args.title.trim().slice(0, 120) : row.title;
        return {
          __proposal: {
            kind: "meal_update",
            meal_id: row.id,
            date: fmtDate(row.date),
            title,
            items,
            calories: items.reduce((a, i) => a + i.calories, 0),
            protein_g: Math.round(items.reduce((a, i) => a + i.protein_g, 0)),
          },
        };
      }

      case "delete_meal": {
        const id = typeof args.meal_id === "string" ? args.meal_id : "";
        const row = await prisma.mealLog.findFirst({
          where: { id, userId },
          select: { id: true, date: true, title: true, calories: true, proteinG: true },
        });
        if (!row) return { error: "That meal wasn't found." };
        return {
          __proposal: {
            kind: "meal_delete",
            meal_id: row.id,
            date: fmtDate(row.date),
            title: row.title,
            calories: row.calories,
            protein_g: row.proteinG,
          },
        };
      }

      case "lookup_food": {
        const query = typeof args.query === "string" ? args.query.trim().slice(0, 120) : "";
        if (!query) return { error: "Provide a food or brand to look up." };
        return lookupFood(query);
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool failed" };
  }
}

/* -------------------------------------------------------- long-term memory */

const MEMORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // refresh when older than ~7 days

const MEMORY_SYSTEM = `You maintain a concise long-term memory of an athlete for a coaching app.

Given the previous memory and the recent conversation, write an UPDATED memory of at most 180 words.
Capture only durable facts worth remembering across future chats: their goal, training setup,
dietary approach, injuries or limitations, stated preferences, and what has or hasn't worked.
Exclude transient numbers, greetings, and anything already obvious from their logs. Plain prose only —
no headings, no bullet lists, no preamble.`;

/**
 * Refreshes the rolling memory summary when it is missing or stale. Cheap model,
 * bounded output, and never throws — memory failing must not affect the chat.
 */
export async function maybeUpdateMemory(userId: string): Promise<void> {
  try {
    const existing = await prisma.coachMemory.findUnique({ where: { userId } });
    if (existing && Date.now() - existing.updatedAt.getTime() < MEMORY_MAX_AGE_MS) return;

    const recent = await prisma.coachMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { role: true, content: true },
    });
    if (recent.length === 0) return;

    const transcript = recent
      .reverse()
      .map((m) => `${m.role === "assistant" ? "Coach" : "Athlete"}: ${m.content}`)
      .join("\n")
      .slice(0, 8000);

    const summary = await callModel(
      [
        MEMORY_SYSTEM,
        existing ? `Current memory:\n${existing.summary}` : "There is no memory yet.",
        `Recent conversation (oldest first):\n${transcript}`,
      ].join("\n\n"),
      [{ role: "user", content: [{ type: "input_text", text: "Write the updated memory." }] }],
      400,
      { model: config.models.chatFast, thinking: false },
    );

    await prisma.coachMemory.upsert({
      where: { userId },
      create: { userId, summary },
      update: { summary },
    });
  } catch {
    // Best-effort: keep the previous memory.
  }
}

type ToolCall = { callId: string; name: string; args: string };

interface StreamRound {
  text: string;
  calls: ToolCall[];
  responseId: string | null;
  usage: CoachUsage | null;
  /** The response was cut off (e.g. hit max_output_tokens) before it finished. */
  incomplete: boolean;
}

/** One streaming Responses call; forwards text deltas and collects function calls. */
async function streamRound(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onDelta: (delta: string) => void,
): Promise<StreamRound> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { text: "", calls: [], responseId: null, usage: null, incomplete: false };
    }
    throw new AppError(502, "COACH_UNREACHABLE", "Could not reach the AI service");
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    const host = hostOf(baseUrl);
    console.error(`[coach] ${host} stream error ${res.status}:`, detail.slice(0, 300));
    throw new AppError(502, "COACH_ERROR", `The AI service (${host}) returned ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let responseId: string | null = null;
  let usage: CoachUsage | null = null;
  let incomplete = false;
  const calls: ToolCall[] = [];

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const event = parseOpenAIEvent(trimmed.slice(5).trim());
        if (event.kind === "text") {
          text += event.delta;
          onDelta(event.delta);
        } else if (event.kind === "function-call") {
          calls.push({ callId: event.callId, name: event.name, args: event.args });
        } else if (event.kind === "completed") {
          if (event.responseId) responseId = event.responseId;
          if (event.usage) usage = event.usage;
        } else if (event.kind === "incomplete") {
          incomplete = true;
          if (event.responseId) responseId = event.responseId;
          if (event.usage) usage = event.usage;
        }
      }
    }
  } catch (err) {
    // Client disconnected (Stop) — keep whatever we streamed so far.
    if (!(err instanceof Error && err.name === "AbortError")) throw err;
  }

  return { text, calls, responseId, usage, incomplete };
}

/**
 * Streaming coach turn within a chat session. Creates the session on the first
 * message (emitting its id via `handlers.onSession`), runs a bounded tool loop,
 * forwards deltas and tool status, and stores whatever text was produced (a Stop
 * keeps the partial answer).
 *
 * Cost control: the turn continues the session's stored thread with
 * `previous_response_id` (sending only the new message) and each tool round
 * chains from the previous response. Falls back to replaying the session's
 * recent messages when the stored response is gone.
 */
export async function runCoachChatStream(
  userId: string,
  sessionId: string | null,
  message: string,
  today: string,
  handlers: {
    onDelta: (delta: string) => void;
    onStatus?: (status: string) => void;
    onSession?: (sessionId: string) => void;
    onProposal?: (proposal: CoachProposal) => void;
  },
  agent?: AgentId,
  signal?: AbortSignal,
): Promise<string> {
  let session = sessionId
    ? await prisma.coachSession.findFirst({ where: { id: sessionId, userId } })
    : null;
  if (sessionId && !session) {
    throw new AppError(404, "NOT_FOUND", "Chat not found");
  }
  if (!session) {
    session = await prisma.coachSession.create({
      data: { userId, title: message.trim().slice(0, 60) || "New chat", agent: agent ?? "general" },
    });
  } else if (agent && agent !== session.agent) {
    // The user switched agent (chips) — persist it for this session.
    session = await prisma.coachSession.update({ where: { id: session.id }, data: { agent } });
  }
  handlers.onSession?.(session.id);

  const [context, recent] = await Promise.all([
    buildAthleteContext(userId, today),
    prisma.coachMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
      select: { role: true, content: true, responseId: true },
    }),
  ]);

  await prisma.coachMessage.create({
    data: { userId, sessionId: session.id, role: "user", content: message },
  });
  await prisma.coachSession.update({
    where: { id: session.id },
    data: { updatedAt: new Date() },
  });

  const { baseUrl, apiKey } = resolveProvider("ai");
  if (!apiKey) {
    throw new AppError(503, "COACH_UNAVAILABLE", "The AI coach is not configured");
  }

  const history: InputMessage[] = recent
    .reverse()
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [
        {
          type: m.role === "assistant" ? "output_text" : "input_text",
          text: m.content,
        },
      ] as InputPart[],
    }));

  const agentId = routeAgent(message, agent);
  const activeAgent = AGENTS[agentId];
  const instructions = `${activeAgent.system}\n\n--- ATHLETE CONTEXT (their real logged data) ---\n${context}`;
  const model = activeAgent.model(message);
  const userMessage = { role: "user", content: [{ type: "input_text", text: message }] };

  const chaining = config.ai.chaining;
  const storedResponseId = chaining
    ? (recent.find((m) => m.role === "assistant" && m.responseId)?.responseId ?? null)
    : null;

  // Without provider-side response storage we replay the whole conversation each
  // round; with chaining we send only the new bits + reference the last response.
  const convo: unknown[] = [...history, userMessage];
  let previousId: string | null = storedResponseId;
  let input: unknown[] = previousId ? [userMessage] : convo;

  let full = "";
  let lastResponseId: string | null = null;
  let totalInput = 0;
  let totalOutput = 0;
  const usedTools: string[] = [];
  const startedAt = Date.now();

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    if (signal?.aborted) break;
    const allowTools = round < MAX_TOOL_ROUNDS;
    const baseBody = {
      model,
      instructions,
      ...(config.ai.promptCache ? { prompt_cache_key: PROMPT_CACHE_KEY } : {}),
      ...(activeAgent.thinking ? {} : { thinking: { type: "disabled" } }),
      ...(allowTools ? { tools: activeAgent.tools, tool_choice: "auto" } : {}),
      stream: true,
      // Tool rounds must fit the tool-call arguments (e.g. a day's exercises),
      // so they get more room than the short final reply.
      max_output_tokens: allowTools ? config.ai.toolTokens : config.ai.replyTokens,
    };

    let result: StreamRound;
    try {
      result = await streamRound(
        baseUrl,
        apiKey,
        { ...baseBody, input, ...(previousId ? { previous_response_id: previousId } : {}) },
        signal,
        handlers.onDelta,
      );
    } catch (err) {
      // Chaining can fail if the stored response is gone — retry once from full history.
      if (round === 0 && previousId) {
        previousId = null;
        result = await streamRound(baseUrl, apiKey, { ...baseBody, input: convo }, signal, handlers.onDelta);
      } else {
        throw err;
      }
    }

    full += result.text;
    if (result.responseId) lastResponseId = result.responseId;
    if (result.usage) {
      totalInput += result.usage.inputTokens;
      totalOutput += result.usage.outputTokens;
    }

    if (result.incomplete) {
      console.warn("[coach] response incomplete (likely truncated)", {
        round,
        hadCalls: result.calls.length,
        textLen: result.text.length,
      });
      // Nothing usable came back — surface a clear error instead of a blank reply.
      if (result.calls.length === 0 && full.trim().length === 0) {
        throw new AppError(
          502,
          "COACH_TRUNCATED",
          "That change was too large for the coach to prepare. Try asking for one day at a time.",
        );
      }
    }

    if (!allowTools || result.calls.length === 0) break;

    const outputs: unknown[] = [];
    for (const call of result.calls) {
      handlers.onStatus?.(TOOL_LABELS[call.name] ?? "Looking that up…");
      usedTools.push(call.name);
      const output = await executeCoachTool(userId, call.name, call.args, today);
      const proposal = extractProposal(output);
      if (proposal) handlers.onProposal?.(proposal);
      outputs.push({
        type: "function_call_output",
        call_id: call.callId,
        output: proposal
          ? JSON.stringify({ ok: true, awaiting_confirmation: true })
          : JSON.stringify(output),
      });
    }

    if (chaining) {
      // Continue the tool loop by chaining from this response.
      if (!result.responseId) break;
      previousId = result.responseId;
      input = outputs;
    } else {
      // Replay mode: carry the model's function_call items then their outputs forward.
      convo.push(
        ...result.calls.map((c) => ({
          type: "function_call",
          call_id: c.callId,
          name: c.name,
          arguments: c.args,
        })),
        ...outputs,
      );
      input = convo;
    }
  }

  console.log(
    "[coach] turn",
    JSON.stringify({
      model,
      agent: agentId,
      ms: Date.now() - startedAt,
      chained: Boolean(storedResponseId),
      tools: usedTools,
      inputTokens: totalInput,
      outputTokens: totalOutput,
    }),
  );

  const answer = full.trim();
  if (answer.length > 0) {
    await prisma.coachMessage.create({
      data: {
        userId,
        sessionId: session.id,
        role: "assistant",
        content: answer,
        responseId: chaining ? lastResponseId : null,
      },
    });
  }

  // Refresh long-term memory in the background (at most every ~7 days).
  void maybeUpdateMemory(userId);

  return answer;
}

/** Generates a structured program from the athlete's profile + recent data. */
export async function generateCoachPlan(
  userId: string,
  goal?: string,
  notes?: string,
): Promise<ParsedPlan> {
  const context = await buildAthleteContext(userId);
  const instructions = [
    PLAN_SYSTEM,
    `--- ATHLETE CONTEXT ---\n${context}`,
    goal ? `Requested focus: ${goal}` : null,
    notes ? `Extra notes: ${notes}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await callModel(
    instructions,
    [{ role: "user", content: [{ type: "input_text", text: "Create the program as JSON." }] }],
    2500,
    { json: true, model: config.models.chatSmart, provider: "openai" },
  );

  try {
    return parsePlanOutput(raw);
  } catch (err) {
    if (err instanceof PlanParseError) {
      throw new AppError(422, "PLAN_GENERATION_FAILED", err.message);
    }
    throw err;
  }
}

/**
 * Transient physique-photo analysis. The image is sent to the model and the
 * buffer is discarded — it is never written to disk or the database.
 */
export async function analyzePhysique(
  imageBuffer: Buffer,
  mimeType: string,
  description?: string,
): Promise<string> {
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  const prompt =
    "Look at this physique photo and give a brief, respectful, constructive assessment: " +
    "current build, what's going well, and 2-3 concrete training/nutrition priorities. " +
    "Do not comment on attractiveness or make medical claims. Keep it under 120 words." +
    (description ? `\n\nThe user adds: ${description}` : "");

  return callModel(
    COACH_SYSTEM,
    [
      {
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
    400,
    { model: config.models.vision, provider: "openai" },
  );
}

const MEAL_SYSTEM = `You estimate the calories and protein of a meal from a photo and/or a short description.

Return ONLY a JSON object, no prose and no markdown fences, matching exactly:
{
  "title": "string",
  "items": [ { "name": "string", "quantity": "string", "calories": number, "protein_g": number } ],
  "calories": number,
  "protein_g": number,
  "confidence": "low" | "medium" | "high",
  "question": "string (optional)"
}

Accuracy rules:
- Estimate each item from a common, realistic portion and state the assumed portion in "quantity"
  (e.g. "1 cup cooked", "150 g", "2 medium", "1 tbsp").
- Keep estimates close to accurate: use standard reference values and do not wildly inflate or deflate.
- For regional/compound dishes, assume the most common home preparation.
- "calories" and "protein_g" must equal the sum of the items.
- If the portion or the dish itself is genuinely ambiguous, lower the confidence and put ONE short
  clarifying question in "question" (omit it when confident).`;

export interface MealAnalysis {
  title: string;
  items: MealItemDraft[];
  calories: number;
  protein_g: number;
  confidence: "low" | "medium" | "high";
  question?: string;
}

/**
 * Estimates a meal from a photo (+ optional description). The image is sent to
 * the model and the buffer is discarded — never stored.
 */
export async function analyzeMeal(
  imageBuffer: Buffer,
  mimeType: string,
  description?: string,
): Promise<MealAnalysis> {
  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  const raw = await callModel(
    MEAL_SYSTEM,
    [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: description ? `The athlete says: ${description}` : "Estimate this meal.",
          },
          { type: "input_image", image_url: dataUrl },
        ],
      },
    ],
    700,
    { json: true, model: config.models.meal },
  );

  let parsed: {
    title?: unknown;
    items?: unknown;
    calories?: unknown;
    protein_g?: unknown;
    confidence?: unknown;
    question?: unknown;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new AppError(502, "MEAL_ANALYZE_FAILED", "Couldn't read that meal. Try again, or type it instead.");
  }

  const items = mealItemsFromArgs(parsed.items);
  if (!items) {
    throw new AppError(422, "MEAL_ANALYZE_FAILED", "Couldn't identify any food. Try another photo or type the meal.");
  }

  const calories = items.reduce((a, i) => a + i.calories, 0);
  const protein_g = Math.round(items.reduce((a, i) => a + i.protein_g, 0));
  const confidence =
    parsed.confidence === "low" || parsed.confidence === "high" ? parsed.confidence : "medium";
  const question =
    typeof parsed.question === "string" && parsed.question.trim()
      ? parsed.question.trim().slice(0, 300)
      : undefined;
  const title =
    typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 120) : "Meal";

  return { title, items, calories, protein_g, confidence, ...(question ? { question } : {}) };
}
