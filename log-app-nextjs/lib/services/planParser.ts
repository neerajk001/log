import OpenAI from 'openai';
import { z } from 'zod';
import { ApiError } from '@/lib/error';

export const exerciseSchema = z.object({
  name: z.string().min(1),
  sets: z.coerce.number().int().positive(),
  reps: z.string().min(1),
});

export const planDaySchema = z.object({
  day_name: z.string().min(1),
  exercises: z.array(exerciseSchema).min(1),
});

export const planParseSchema = z.object({
  days: z.array(planDaySchema).min(1),
});

export type ParsedPlan = z.infer<typeof planParseSchema>;

const SYSTEM_PROMPT = `You are a workout-plan parser. The user will paste a training program as free text.
Extract it into strict JSON only (the entire response must be a single JSON object, no commentary, no markdown fences).
The JSON must match this shape exactly:
{
  "days": [
    {
      "day_name": "Push",           // a short label, e.g. Push / Pull / Legs / Upper / Lower / Day 1
      "exercises": [
        { "name": "Barbell Bench Press", "sets": 5, "reps": "5" }   // reps may be a range like "8-12"
      ]
    }
  ]
}
Rules:
- One object per training day; preserve the order they appear.
- "sets" must be an integer; "reps" is a string (single number or range).
- Do not invent exercises that are not in the text.
- If the text is not a workout plan, return {"days": []}.`;

/**
 * Validate raw model output. Throws ApiError PARSE_FAILED (422) on any
 * structural mismatch — never silently guess-fills (see docs/security.md).
 */
export function validatePlanParse(raw: unknown): ParsedPlan {
  const parsed = planParseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      'PARSE_FAILED',
      'Could not understand that plan. Try pasting plain text, or add exercises manually.',
      422,
    );
  }
  return parsed.data;
}

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/**
 * Send plan text to OpenAI and return validated structured days.
 * Server-side only — the API key never reaches the client.
 */
export async function parsePlanWithOpenAI(text: string): Promise<ParsedPlan> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ApiError('SERVER_ERROR', 'Plan parsing is not configured', 500);
  }
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: text },
    ],
  });

  const response = completion.choices[0]?.message?.content ?? '';
  if (!response) {
    throw new ApiError('PARSE_FAILED', 'The model returned an empty response.', 422);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(response));
  } catch {
    throw new ApiError('PARSE_FAILED', 'The model did not return valid JSON.', 422);
  }

  return validatePlanParse(raw);
}
