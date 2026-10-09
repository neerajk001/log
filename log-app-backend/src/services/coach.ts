import { config } from "../config";
import { prisma } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import { parsePlanOutput, PlanParseError } from "./planParser";
import { resolvePlanDayForDate } from "./planRotation";
import type { ParsedPlan } from "../validation/schemas";

const CONTEXT_WINDOW_DAYS = 28;
const HISTORY_TURNS = 12;
const PROMPT_CACHE_KEY = "log-coach-v1";

const COACH_SYSTEM = `You are an evidence-based strength and fat-loss coach inside a tracking app.

You are given TODAY's date, the units in use, and a bounded summary of the athlete's real data under
"ATHLETE CONTEXT". Use only that data — never invent numbers or history.

Rules:
- Be honest and specific, not motivational fluff. Reference the athlete's actual logged numbers.
- Ground every claim in the given data and quote the values you cite. Say plainly when there is not
  enough data instead of guessing.
- What you CAN see: profile/goal, ~4 weeks of weight and nutrition (averages plus recent daily
  weights), top sets and weekly volume per exercise, this-vs-last-week lift trend, activity minutes,
  recent weekly verdicts, and the active plan's days.
- What you CANNOT see: individual sets beyond the top set, individual meals, or anything older than
  ~4 weeks. If asked about those, say so.
- You also have tools to look up the user's data on demand (get_lift_history, get_daily_logs,
  get_weekly_verdicts, get_plan_vs_actual, get_activity_logs). Prefer calling a tool over guessing,
  and don't call one for facts already in the context above.
- Keep replies short: a few sentences or a short list, plain language, no jargon dumps.
- End with 2-4 concrete, specific actions when advice is requested.
- You are not a doctor: never diagnose or give medical advice. For injuries or medical concerns, tell
  the user to consult a professional.
- If a key detail is missing (goal, training days, equipment, diet), ask one clarifying question.`;

const PLAN_SYSTEM = `You design structured workout programs and return them as JSON only.

Output ONLY a JSON object, no surrounding text and no markdown fences, matching exactly:
{
  "days": [
    { "day_name": "string", "exercises": [ { "name": "string", "sets": number, "reps": "string" } ] }
  ]
}

Rules:
- Respect the athlete's available training days, experience, and equipment.
- "day_name" is a label like "Push", "Pull", "Legs", "Upper", "Lower", "Full Body".
- "reps" preserves notation as a string (e.g. "5", "8-12").
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
 */
export async function buildAthleteContext(userId: string): Promise<string> {
  const now = new Date();
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - CONTEXT_WINDOW_DAYS);

  const [profile, daily, lifts, verdicts, plan, activities] = await Promise.all([
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
  return [`TODAY: ${fmtDate(now)} (units: kg, kcal, g, hours)`, ...lines].join("\n");
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

async function callModel(
  instructions: string,
  input: InputMessage[],
  maxOutputTokens: number,
  options: { json?: boolean; model: string },
): Promise<string> {
  if (!config.openai.apiKey) {
    throw new AppError(503, "COACH_UNAVAILABLE", "The AI coach is not configured");
  }

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openai.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        instructions,
        input,
        prompt_cache_key: PROMPT_CACHE_KEY,
        ...(options.json ? { text: { format: { type: "json_object" } } } : {}),
        max_output_tokens: maxOutputTokens,
      }),
    });
  } catch {
    throw new AppError(502, "COACH_UNREACHABLE", "Could not reach the AI service");
  }

  if (!res.ok) {
    console.error("[coach] OpenAI error:", res.status);
    throw new AppError(502, "COACH_ERROR", `The AI service returned ${res.status}`);
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
    700,
    { model: routeChatModel(message) },
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
];

const TOOL_LABELS: Record<string, string> = {
  get_lift_history: "Checking your lift history…",
  get_daily_logs: "Reading your daily logs…",
  get_weekly_verdicts: "Reviewing your weekly verdicts…",
  get_plan_vs_actual: "Comparing your plan with what you logged…",
  get_activity_logs: "Checking your activities…",
};

function clampDays(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(MAX_TOOL_DAYS, Math.floor(n)));
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

/**
 * Runs one coach tool, scoped to `userId`. Always resolves — a failure becomes
 * an `{ error }` payload so the model can recover instead of the stream dying.
 */
export async function executeCoachTool(
  userId: string,
  name: string,
  rawArgs: string,
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
        const where: Record<string, unknown> = { userId, date: { gte: daysAgo(clampDays(args.days, 28)) } };
        if (typeof args.exercise === "string" && args.exercise.trim()) {
          where.exerciseName = args.exercise.trim();
        }
        const rows = await prisma.liftLog.findMany({
          where,
          orderBy: { date: "desc" },
          take: 100,
          select: { date: true, exerciseName: true, weightKg: true, reps: true },
        });
        return rows.map((r) => ({
          date: fmtDate(r.date),
          exercise: r.exerciseName,
          weight_kg: Number(r.weightKg),
          reps: r.reps,
        }));
      }

      case "get_daily_logs": {
        const rows = await prisma.dailyLog.findMany({
          where: { userId, date: { gte: daysAgo(clampDays(args.days, 28)) } },
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
        const dateStr = typeof args.date === "string" ? args.date : fmtDate(new Date());
        const plan = await prisma.workoutPlan.findFirst({
          where: { userId, isActive: true },
          include: { planDays: { orderBy: { dayOrder: "asc" } } },
        });
        if (!plan) return { date: dateStr, day: null };
        const day = resolvePlanDayForDate(plan.createdAt, plan.planDays, new Date(`${dateStr}T00:00:00Z`));
        if (!day) return { date: dateStr, day: null };
        const prescribed = day.exercises as unknown as { name: string; sets: number; reps: string }[];
        const logs = await prisma.liftLog.findMany({
          where: { userId, date: new Date(`${dateStr}T00:00:00Z`), exerciseName: { in: prescribed.map((e) => e.name) } },
          select: { exerciseName: true, weightKg: true, reps: true },
        });
        return {
          date: dateStr,
          day: day.dayName,
          exercises: prescribed.map((e) => {
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
        };
      }

      case "get_activity_logs": {
        const rows = await prisma.activityLog.findMany({
          where: { userId, date: { gte: daysAgo(clampDays(args.days, 28)) } },
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

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool failed" };
  }
}

type ToolCall = { callId: string; name: string; args: string };

interface StreamRound {
  text: string;
  calls: ToolCall[];
  responseId: string | null;
  usage: CoachUsage | null;
}

/** One streaming Responses call; forwards text deltas and collects function calls. */
async function streamRound(
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  onDelta: (delta: string) => void,
): Promise<StreamRound> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openai.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { text: "", calls: [], responseId: null, usage: null };
    }
    throw new AppError(502, "COACH_UNREACHABLE", "Could not reach the AI service");
  }

  if (!res.ok || !res.body) {
    console.error("[coach] OpenAI stream error:", res.status);
    throw new AppError(502, "COACH_ERROR", `The AI service returned ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let responseId: string | null = null;
  let usage: CoachUsage | null = null;
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
        }
      }
    }
  } catch (err) {
    // Client disconnected (Stop) — keep whatever we streamed so far.
    if (!(err instanceof Error && err.name === "AbortError")) throw err;
  }

  return { text, calls, responseId, usage };
}

/**
 * Streaming variant of {@link runCoachChat} with tool calling. Persists the user
 * message up front, runs a bounded tool loop, forwards each text delta and tool
 * status, and stores whatever text was produced (so a Stop keeps the partial answer).
 *
 * Cost control: when the previous turn's response id is stored we continue that
 * thread with `previous_response_id` and send only the new message (instead of
 * replaying the whole history), and each tool round chains from the previous one.
 */
export async function runCoachChatStream(
  userId: string,
  message: string,
  handlers: { onDelta: (delta: string) => void; onStatus?: (status: string) => void },
  signal?: AbortSignal,
): Promise<string> {
  const [context, recent] = await Promise.all([
    buildAthleteContext(userId),
    prisma.coachMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
      select: { role: true, content: true, responseId: true },
    }),
  ]);

  await prisma.coachMessage.create({ data: { userId, role: "user", content: message } });

  if (!config.openai.apiKey) {
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

  const instructions = `${COACH_SYSTEM}\n\n--- ATHLETE CONTEXT (their real logged data) ---\n${context}`;
  const model = routeChatModel(message);
  const userMessage = { role: "user", content: [{ type: "input_text", text: message }] };

  const storedResponseId =
    recent.find((m) => m.role === "assistant" && m.responseId)?.responseId ?? null;
  let previousId: string | null = storedResponseId;
  let input: unknown[] = previousId ? [userMessage] : [...history, userMessage];

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
      prompt_cache_key: PROMPT_CACHE_KEY,
      ...(allowTools ? { tools: COACH_TOOLS, tool_choice: "auto" } : {}),
      stream: true,
      max_output_tokens: 700,
    };

    let result: StreamRound;
    try {
      result = await streamRound(
        { ...baseBody, input, ...(previousId ? { previous_response_id: previousId } : {}) },
        signal,
        handlers.onDelta,
      );
    } catch (err) {
      // Chaining can fail if the stored response is gone — retry once from full history.
      if (round === 0 && previousId) {
        previousId = null;
        result = await streamRound(
          { ...baseBody, input: [...history, userMessage] },
          signal,
          handlers.onDelta,
        );
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

    if (!allowTools || result.calls.length === 0) break;
    // Continue the tool loop by chaining from this response.
    if (!result.responseId) break;
    previousId = result.responseId;

    input = [];
    for (const call of result.calls) {
      handlers.onStatus?.(TOOL_LABELS[call.name] ?? "Looking that up…");
      usedTools.push(call.name);
      const output = await executeCoachTool(userId, call.name, call.args);
      input.push({
        type: "function_call_output",
        call_id: call.callId,
        output: JSON.stringify(output),
      });
    }
  }

  console.log(
    "[coach] turn",
    JSON.stringify({
      model,
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
      data: { userId, role: "assistant", content: answer, responseId: lastResponseId },
    });
  }
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
    { json: true, model: config.models.chatSmart },
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
    { model: config.models.vision },
  );
}
