/** Dev-only probe: does the Command Code provider support the Responses API
 *  features the coach relies on (tools, image input, streaming)? */
import dotenv from "dotenv";

dotenv.config();

const BASE = process.env.CMD_BASE_URL ?? "https://api.commandcode.ai/provider/v1";
const KEY = process.env.CMD_API_KEY ?? process.env.COMMANDCODE_API_KEY ?? "";
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek/deepseek-v4-flash";

async function post(label: string, path: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(`\n### ${label} -> ${path}  HTTP ${res.status}`);
    console.log(text.slice(0, 900));
  } catch (err) {
    console.log(`\n### ${label} -> ${path}  ERROR ${err instanceof Error ? err.message : err}`);
  }
}

async function main(): Promise<void> {
  console.log(`base=${BASE} model=${MODEL} key=${KEY ? "set" : "MISSING"}`);

  await post("responses/text", "/responses", {
    model: MODEL,
    instructions: "Reply in exactly three words.",
    input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
    max_output_tokens: 60,
  });

  await post("responses/tool", "/responses", {
    model: MODEL,
    input: [{ role: "user", content: [{ type: "input_text", text: "Weather in Paris? Use the tool." }] }],
    tools: [
      {
        type: "function",
        name: "get_weather",
        description: "Get the weather for a city",
        parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
      },
    ],
    max_output_tokens: 200,
  });

  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  await post("responses/image", "/responses", {
    model: MODEL,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "What colour is this pixel?" },
          { type: "input_image", image_url: `data:image/png;base64,${png}` },
        ],
      },
    ],
    max_output_tokens: 100,
  });

  await post("responses/stream", "/responses", {
    model: MODEL,
    input: [{ role: "user", content: [{ type: "input_text", text: "Count 1 to 3." }] }],
    stream: true,
    max_output_tokens: 60,
  });
}

void main();
