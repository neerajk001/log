/** Dev-only probe: validate the no-chaining tool round (function_call replay). */
import dotenv from "dotenv";

dotenv.config();

const BASE = process.env.AI_BASE_URL ?? "https://api.commandcode.ai/provider/v1";
const KEY = process.env.AI_API_KEY ?? process.env.COMMANDCODE_API_KEY ?? "";
const MODEL = process.env.COACH_MODEL ?? "deepseek/deepseek-v4-flash";
const H = { "content-type": "application/json", authorization: `Bearer ${KEY}` };

type AnyRec = Record<string, any>;

async function post(input: unknown[], withTools: boolean): Promise<AnyRec> {
  const res = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: MODEL,
      instructions: "You are a test assistant. Use get_meals when asked about meals.",
      input,
      ...(withTools
        ? {
            tools: [
              {
                type: "function",
                name: "get_meals",
                description: "List meals for a given day",
                parameters: {
                  type: "object",
                  properties: { date: { type: "string" } },
                  required: ["date"],
                },
              },
            ],
            tool_choice: "auto",
          }
        : {}),
      thinking: { type: "disabled" },
      max_output_tokens: 800,
    }),
  });
  return (await res.json()) as AnyRec;
}

function textOf(json: AnyRec): string {
  return (json?.output ?? [])
    .flatMap((o: AnyRec) => o?.content ?? [])
    .filter((c: AnyRec) => c?.type === "output_text")
    .map((c: AnyRec) => c.text)
    .join(" ");
}

async function main(): Promise<void> {
  const userMsg = {
    role: "user",
    content: [{ type: "input_text", text: "What did I eat on 2026-10-10? Use the tool." }],
  };

  const r1 = await post([userMsg], true);
  const call = (r1.output ?? []).find((o: AnyRec) => o?.type === "function_call");
  console.log("round1 text:", JSON.stringify(textOf(r1)) || "(none)");
  console.log("round1 function_call:", call ? `${call.name}(${call.arguments})` : "(none)");
  if (!call) return;

  const r2 = await post(
    [
      userMsg,
      { type: "function_call", call_id: call.call_id, name: call.name, arguments: call.arguments },
      {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify({ date: "2026-10-10", meals: [{ title: "Breakfast", calories: 360 }] }),
      },
    ],
    true,
  );
  console.log("round2 text:", JSON.stringify(textOf(r2)) || "(none)");
}

void main();
