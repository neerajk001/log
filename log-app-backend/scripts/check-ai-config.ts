/** Dev-only: print the AI provider config the server resolves, then call it. */
import { config } from "../src/config";

const mask = (s: string) => (s ? `${s.slice(0, 6)}…${s.slice(-4)} (len ${s.length})` : "(empty)");
const keySource = process.env.AI_API_KEY
  ? "AI_API_KEY"
  : process.env.COMMANDCODE_API_KEY
    ? "COMMANDCODE_API_KEY"
    : process.env.OPENAI_API_KEY
      ? "OPENAI_API_KEY"
      : "none";

async function main(): Promise<void> {
  console.log("ai.baseUrl    :", config.ai.baseUrl);
  console.log("ai.apiKey     :", mask(config.ai.apiKey), " from", keySource);
  console.log("openai.apiKey :", mask(config.openai.apiKey));
  console.log("chaining      :", config.ai.chaining, "| promptCache:", config.ai.promptCache, "| thinking:", config.ai.thinking || "(on)");
  console.log("models        :", JSON.stringify(config.models));

  const res = await fetch(`${config.ai.baseUrl}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.ai.apiKey}` },
    body: JSON.stringify({
      model: config.models.meal,
      input: [{ role: "user", content: [{ type: "input_text", text: "Say ok." }] }],
      thinking: { type: "disabled" },
      max_output_tokens: 40,
    }),
  });
  const body = await res.text();
  console.log("\nprobe status  :", res.status);
  console.log("probe body    :", body.slice(0, 400));
}

void main();
