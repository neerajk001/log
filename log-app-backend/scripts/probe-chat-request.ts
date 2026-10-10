/** Dev-only: replay the coach's exact request shapes to see which one 401s. */
import { config } from "../src/config";

const H = { "content-type": "application/json", authorization: `Bearer ${config.ai.apiKey}` };
const url = `${config.ai.baseUrl}/responses`;

async function show(label: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: H, body: JSON.stringify(body) });
  const text = await res.text();
  console.log(`\n### ${label} -> ${res.status}`);
  console.log(text.slice(0, 300));
}

async function main(): Promise<void> {
  // 1. Streaming chat with tools + thinking disabled (the coach's exact shape)
  await show("chat/stream+tools", {
    model: config.models.chatSmart,
    instructions: "You are a coach. Use get_meals when asked.",
    input: [{ role: "user", content: [{ type: "input_text", text: "What did I eat today?" }] }],
    thinking: { type: "disabled" },
    tools: [
      {
        type: "function",
        name: "get_meals",
        description: "List meals for a day",
        parameters: { type: "object", properties: { date: { type: "string" } } },
      },
    ],
    tool_choice: "auto",
    stream: true,
    max_output_tokens: config.ai.toolTokens,
  });

  // 2. Meal analyze: json_object format + image + instructions (no input_text-only)
  await show("meal/analyze (json)", {
    model: config.models.meal,
    instructions: "Return only a JSON object.",
    input: [
      { role: "user", content: [{ type: "input_text", text: "Estimate this meal: 2 rotis and dal." }] },
    ],
    text: { format: { type: "json_object" } },
    max_output_tokens: 700,
  });
}

void main();
