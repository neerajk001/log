import { config } from "../config";
import { parsedPlanSchema, type ParsedPlan } from "../validation/schemas";

const SYSTEM_PROMPT = `You convert raw workout plan text into structured JSON.

Output ONLY a JSON object, with no surrounding text and no markdown code fences. The object must have exactly this shape:

{
  "days": [
    {
      "day_name": "string",
      "exercises": [
        { "name": "string", "sets": number, "reps": "string" }
      ]
    }
  ]
}

Rules:
- "day_name" is the training day label (e.g. "Push", "Pull", "Legs", "Upper", "Lower"). If the source has no day structure, group all exercises into a single day named "Day 1".
- "exercises" lists every exercise for that day, in the order given.
- "sets" is an integer count of working sets.
- "reps" is the rep scheme as a string (e.g. "5", "8-12", "3x5"), preserving the source notation when present.
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
    throw new PlanParseError("The AI returned invalid JSON");
  }

  return validatePlanOutput(parsed);
}

type OpenAIInput =
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string };

async function parsePlanParts(input: OpenAIInput[]): Promise<ParsedPlan> {
  if (!config.openai.apiKey) {
    throw new PlanParseError("Plan parsing is not configured");
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
        model: config.openai.model,
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
    });
  } catch {
    throw new PlanParseError("Could not reach the plan parsing service");
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    let apiError: { message?: string; code?: string } | undefined;
    try {
      apiError = (JSON.parse(errBody) as { error?: typeof apiError }).error;
    } catch {}
    const invalidApiKey =
      response.status === 401 ||
      apiError?.code === "invalid_api_key" ||
      /invalid api key|api key not valid/i.test(apiError?.message ?? errBody);
    console.error("[planParser] OpenAI error:", response.status, {
      model: config.openai.model,
      message: apiError?.message,
      body: errBody,
    });
    if (invalidApiKey) {
      throw new PlanParseError(
        "OpenAI rejected the API key. Check that OPENAI_API_KEY is a valid OpenAI secret key.",
      );
    }
    if (response.status === 404) {
      throw new PlanParseError(
        `OpenAI model not found or unavailable: ${config.openai.model}`,
      );
    }
    throw new PlanParseError(
      apiError?.message
        ? `OpenAI request failed: ${apiError.message}`
        : `OpenAI request failed with status ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  const rawText = data.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;

  if (!rawText || rawText.trim().length === 0) {
    throw new PlanParseError("The plan parsing service returned no content");
  }

  return parsePlanOutput(rawText);
}

export function parsePlanText(text: string): Promise<ParsedPlan> {
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
