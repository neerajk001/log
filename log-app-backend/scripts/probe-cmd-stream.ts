/** Dev-only probe: streamed event types + previous_response_id chaining. */
import dotenv from "dotenv";

dotenv.config();

const BASE = process.env.CMD_BASE_URL ?? "https://api.commandcode.ai/provider/v1";
const KEY = process.env.CMD_API_KEY ?? process.env.COMMANDCODE_API_KEY ?? "";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek/deepseek-v4-flash";
const H = { "content-type": "application/json", authorization: `Bearer ${KEY}` };

async function main(): Promise<void> {
  // 1. Which SSE event types come back on a streamed turn?
  const res = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: "Count from 1 to 3." }] }],
      stream: true,
      max_output_tokens: 80,
    }),
  });
  const body = await res.text();
  const types = [...body.matchAll(/"type":"([a-z_.]+)"/g)].map((m) => m[1]);
  console.log(`stream HTTP ${res.status}`);
  console.log("event types:", JSON.stringify([...new Set(types)]));

  // 2. Does previous_response_id chaining work?
  const first = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: "My name is Sam." }] }],
      max_output_tokens: 40,
    }),
  });
  const firstJson = (await first.json()) as { id?: string };
  console.log(`\nfirst id: ${firstJson.id ?? "(none)"}`);

  const second = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: MODEL,
      input: [{ role: "user", content: [{ type: "input_text", text: "What is my name?" }] }],
      previous_response_id: firstJson.id,
      max_output_tokens: 60,
    }),
  });
  const secondBody = await second.text();
  console.log(`chain HTTP ${second.status}`);
  console.log("chain body:", secondBody.slice(0, 400));
}

void main();
