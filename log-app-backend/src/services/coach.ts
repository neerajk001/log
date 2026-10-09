import { config } from "../config";
import { prisma } from "../db/client";
import { AppError } from "../middleware/errorHandler";
import { parsePlanOutput, PlanParseError } from "./planParser";
import type { ParsedPlan } from "../validation/schemas";

const CONTEXT_WINDOW_DAYS = 28;
const HISTORY_TURNS = 12;

const COACH_SYSTEM = `You are an evidence-based strength and fat-loss coach inside a tracking app.

Rules:
- Be honest and specific, not motivational fluff. Reference the athlete's actual logged data.
- Ground advice in the data you are given; say when there is not enough data instead of guessing.
- Keep replies short and actionable (a few sentences or a short list). Plain language, no jargon dumps.
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

/**
 * A compact, token-bounded summary of the athlete's profile and last ~4 weeks
 * of data. Deliberately aggregates rather than dumping raw logs so the coach
 * call stays cheap and fast.
 */
export async function buildAthleteContext(userId: string): Promise<string> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - CONTEXT_WINDOW_DAYS);

  const [profile, daily, lifts, verdict, plan] = await Promise.all([
    prisma.coachProfile.findUnique({ where: { userId } }),
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: since } },
      orderBy: { date: "asc" },
      select: { date: true, weightKg: true, calories: true, proteinG: true, sleepHours: true },
    }),
    prisma.liftLog.findMany({
      where: { userId, date: { gte: since } },
      select: { exerciseName: true, weightKg: true, reps: true },
    }),
    prisma.weeklyVerdict.findFirst({ where: { userId }, orderBy: { weekStartDate: "desc" } }),
    prisma.workoutPlan.findFirst({
      where: { userId, isActive: true },
      include: { planDays: { orderBy: { dayOrder: "asc" } } },
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

  if (verdict) {
    const trend =
      verdict.weightTrendKgPerWeek == null ? "n/a" : Number(verdict.weightTrendKgPerWeek).toFixed(2);
    const reasoning = (verdict.reasoning as unknown as string[] | null) ?? [];
    lines.push(
      `WEEKLY VERDICT (week of ${fmtDate(verdict.weekStartDate)}): ${verdict.verdict}, weight trend ${trend} kg/wk, strength ${verdict.strengthTrend ?? "n/a"}, adherence ${verdict.adherencePct ?? "n/a"}%. Reasoning: ${reasoning.join(" | ")}`,
    );
  }

  if (plan) {
    lines.push(
      `ACTIVE PLAN "${plan.name}": ${plan.planDays.map((d) => d.dayName).join(", ")}`,
    );
  }

  return lines.length > 0 ? lines.join("\n") : "No logged data yet.";
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
    output?: { content?: { type?: string; text?: string }[] }[];
  };
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

/**
 * Pulls the text delta out of one OpenAI Responses SSE `data:` payload.
 * Returns null for events we don't care about (start, completed, [DONE], …).
 */
export function parseOpenAIDelta(payload: string): string | null {
  if (!payload || payload === "[DONE]") return null;
  let event: { type?: string; delta?: unknown };
  try {
    event = JSON.parse(payload) as { type?: string; delta?: unknown };
  } catch {
    return null;
  }
  if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
    return event.delta;
  }
  return null;
}

/**
 * Streaming variant of {@link runCoachChat}. Persists the user message up
 * front, forwards each text delta through `onDelta`, and stores whatever text
 * was produced (so a Stop mid-reply keeps the partial answer).
 */
export async function runCoachChatStream(
  userId: string,
  message: string,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const [context, recent] = await Promise.all([
    buildAthleteContext(userId),
    prisma.coachMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: HISTORY_TURNS,
      select: { role: true, content: true },
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

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openai.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: routeChatModel(message),
        instructions: `${COACH_SYSTEM}\n\n--- ATHLETE CONTEXT (their real logged data) ---\n${context}`,
        input: [...history, { role: "user", content: [{ type: "input_text", text: message }] }],
        stream: true,
        max_output_tokens: 700,
      }),
      signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return "";
    throw new AppError(502, "COACH_UNREACHABLE", "Could not reach the AI service");
  }

  if (!res.ok || !res.body) {
    console.error("[coach] OpenAI stream error:", res.status);
    throw new AppError(502, "COACH_ERROR", `The AI service returned ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

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
        const delta = parseOpenAIDelta(trimmed.slice(5).trim());
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      }
    }
  } catch (err) {
    // Client disconnected (Stop) — keep whatever we streamed so far.
    if (!(err instanceof Error && err.name === "AbortError")) throw err;
  }

  const text = full.trim();
  if (text.length > 0) {
    await prisma.coachMessage.create({ data: { userId, role: "assistant", content: text } });
  }
  return text;
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
