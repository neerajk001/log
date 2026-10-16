import { config } from "../config";
import { parsedPlanSchema, type ParsedPlan } from "../validation/schemas";

const SYSTEM_PROMPT = `You convert raw workout plan text into structured JSON.

Output ONLY a JSON object, with no surrounding text and no markdown code fences. The object must have exactly this shape:

{
  "days": [
    {
      "day_name": "string",
      "exercises": [
        { "name": "string", "sets": number, "reps": "string", "weight_kg": number }
      ]
    }
  ]
}

Rules:
- "day_name" is the training day label (e.g. "Push", "Pull", "Legs", "Upper", "Lower"). If the source has no day structure, group all exercises into a single day named "Day 1".
- "exercises" lists every exercise for that day, in the order given.
- "sets" is an integer count of working sets.
- "reps" is the rep scheme as a string (e.g. "5", "8-12", "3x5"), preserving the source notation when present.
- Include "weight_kg" only when the source states a target weight; otherwise omit it.
- Never invent exercises that are not present in the source text. If a field is ambiguous, make your single best guess.`;

export class PlanParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanParseError";
  }
}

export type { ParsedPlan };

export function validatePlanOutput(raw: unknown): ParsedPlan {
  const result = parsedPlanSchema.safeParse(raw);
  if (!result.success) {
    throw new PlanParseError(
      "The AI output did not match the expected plan structure",
    );
  }
  return result.data;
}

export function parsePlanOutput(rawText: string): ParsedPlan {
  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("[planParser] model returned invalid JSON", { chars: cleaned.length });
    throw new PlanParseError("Couldn't read that plan — try pasting the text instead.");
  }

  return validatePlanOutput(parsed);
}

type OpenAIInput =
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string };

async function parsePlanParts(input: OpenAIInput[]): Promise<ParsedPlan> {
  if (!config.openai.apiKey) {
    console.error("[planParser] no OPENAI_API_KEY configured");
    throw new PlanParseError("Plan import is unavailable right now — try again later.");
  }

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openai.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.models.parsing,
        instructions: SYSTEM_PROMPT,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Return the extracted workout plan as valid JSON.",
              },
              ...input,
            ],
          },
        ],
        text: { format: { type: "json_object" } },
        max_output_tokens: 2000,
      }),
      // Bound the wait: a slow provider must fail fast (friendly copy below),
      // not hold the /parse request indefinitely.
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    console.error("[planParser] could not reach api.openai.com");
    throw new PlanParseError("Plan import is unavailable right now — try again later.");
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    let apiError: { message?: string; code?: string } | undefined;
    try {
      apiError = (JSON.parse(errBody) as { error?: typeof apiError }).error;
    } catch {}
    console.error("[planParser] OpenAI error:", response.status, {
      model: config.openai.model,
      code: apiError?.code,
      message: apiError?.message,
    });
    // The status, model and API message above are the diagnosis; the athlete gets plain
    // copy rather than an operator's error text.
    throw new PlanParseError("Plan import is unavailable right now — try again later.");
  }

  const data = (await response.json()) as {
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  const rawText = data.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;

  if (!rawText || rawText.trim().length === 0) {
    console.error("[planParser] model returned no content");
    throw new PlanParseError("Couldn't read that plan — try pasting the text instead.");
  }

  return parsePlanOutput(rawText);
}

export function parsePlanText(text: string): Promise<ParsedPlan> {
  // NOTE: AI strings are shape-validated by zod but stored verbatim. Clients
  // must render them as plain text (React Native <Text>), never as HTML, or
  // stored payloads become stored-XSS.
  return parsePlanParts([{ type: "input_text", text }]);
}

export function parsePlanPdf(
  buffer: Buffer,
  mimeType = "application/pdf",
): Promise<ParsedPlan> {
  return parsePlanParts([
    {
      type: "input_file",
      filename: "workout-plan.pdf",
      file_data: `data:${mimeType};base64,${buffer.toString("base64")}`,
    },
  ]);
}
