/** Step-0 probe: does store:true unlock previous_response_id? Plus a thinking toggle. */
import dotenv from "dotenv";

dotenv.config();

const BASE = process.env.CMD_BASE_URL ?? "https://api.commandcode.ai/provider/v1";
const KEY = process.env.CMD_API_KEY ?? process.env.COMMANDCODE_API_KEY ?? "";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek/deepseek-v4-flash";
const H = { "content-type": "application/json", authorization: `Bearer ${KEY}` };

async function call(body: unknown): Promise<{ status: number; json: any; raw: string }> {
  const res = await fetch(`${BASE}/responses`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const raw = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* streamed */
  }
  return { status: res.status, json, raw };
}

function textOf(json: any): string {
  return (json?.output ?? [])
    .flatMap((o: any) => o?.content ?? [])
    .filter((c: any) => c?.type === "output_text")
    .map((c: any) => c.text)
    .join(" ");
}

async function main(): Promise<void> {
  // A) store:true + chaining
  const first = await call({
    model: MODEL,
    store: true,
    input: [{ role: "user", content: [{ type: "input_text", text: "My name is Sam." }] }],
    max_output_tokens: 80,
  });
  console.log("A1 store:true ->", first.status, "id:", first.json?.id ? "yes" : "no", "| store:", first.json?.store);

  if (first.status === 200 && first.json?.id) {
    const second = await call({
      model: MODEL,
      store: true,
      previous_response_id: first.json.id,
      input: [{ role: "user", content: [{ type: "input_text", text: "What is my name? One word." }] }],
      max_output_tokens: 80,
    });
    console.log("A2 chain ->", second.status, "| reply:", JSON.stringify(textOf(second.json)) || second.raw.slice(0, 200));
  }

  // B) thinking disabled?
  const b = await call({
    model: MODEL,
    input: [{ role: "user", content: [{ type: "input_text", text: "Say hi." }] }],
    thinking: { type: "disabled" },
    max_output_tokens: 60,
  });
  console.log("B thinking:disabled ->", b.status, "| reply:", JSON.stringify(textOf(b.json)) || b.raw.slice(0, 200));
}

void main();
