/**
 * Dev-only A/B harness: estimate the SAME meal with two providers and print
 * both JSON results side by side. Not part of the build (tsconfig only
 * compiles src/), so it is safe to delete.
 *
 *   npx tsx scripts/compare-meal-models.ts "2 rotis, a bowl of dal and curd"
 *   npx tsx scripts/compare-meal-models.ts "thali" ./plate.jpg
 *
 * Env (loaded from log-app-backend/.env, or your shell):
 *   OPENAI_API_KEY   - OpenAI key (already in .env)
 *   CMD_API_KEY      - Command Code provider key (from the provider page)
 *   COACH_MEAL_MODEL - OpenAI side model (default gpt-4.1)
 *   CMD_BASE_URL     - default https://api.commandcode.ai/provider/v1
 *   DEEPSEEK_MODEL   - default deepseek/deepseek-v4-flash
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

// Keep this identical to MEAL_SYSTEM in src/services/coach.ts.
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

type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
  keyEnv: string;
}

const providers: Provider[] = [
  {
    name: "openai",
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.COACH_MEAL_MODEL ?? "gpt-4.1",
    keyEnv: "OPENAI_API_KEY",
  },
  {
    name: "commandcode",
    baseUrl: process.env.CMD_BASE_URL ?? "https://api.commandcode.ai/provider/v1",
    apiKey: process.env.CMD_API_KEY ?? process.env.COMMANDCODE_API_KEY,
    model: process.env.DEEPSEEK_MODEL ?? "deepseek/deepseek-v4-flash",
    keyEnv: "CMD_API_KEY or COMMANDCODE_API_KEY",
  },
];

function toDataUrl(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function estimate(p: Provider, text: string, imagePath?: string): Promise<unknown> {
  if (!p.apiKey) return { skipped: `no API key — set ${p.keyEnv}` };

  const content: ContentPart[] = [{ type: "text", text: text || "Estimate this meal." }];
  if (imagePath) content.push({ type: "image_url", image_url: { url: toDataUrl(imagePath) } });

  const started = Date.now();
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({
        model: p.model,
        messages: [
          { role: "system", content: MEAL_SYSTEM },
          { role: "user", content },
        ],
        response_format: { type: "json_object" },
        max_tokens: 700,
      }),
    });
    const ms = Date.now() - started;
    const raw = await res.text();
    if (!res.ok) return { ms, error: `HTTP ${res.status}`, body: raw.slice(0, 600) };

    const body = JSON.parse(raw) as {
      choices?: { message?: { content?: string } }[];
      usage?: unknown;
    };
    const out = body.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(out);
    } catch {
      parsed = out;
    }
    return { ms, usage: body.usage, parsed };
  } catch (err) {
    return { ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  const [text, imagePath] = process.argv.slice(2);
  const input = text ?? "2 rotis, a bowl of dal and a bowl of curd";
  console.log(`Meal: ${input}${imagePath ? `   [image: ${imagePath}]` : ""}\n`);

  for (const p of providers) {
    const out = await estimate(p, input, imagePath);
    console.log(`===== ${p.name} · ${p.model} =====`);
    console.log(JSON.stringify(out, null, 2));
    console.log("");
  }
}

void main();
