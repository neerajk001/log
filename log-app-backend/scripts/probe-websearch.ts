/** Dev-only: does the provider support OpenAI's built-in web_search tool? */
import { config } from "../src/config";

const H = { "content-type": "application/json", authorization: `Bearer ${config.ai.apiKey}` };
const url = `${config.ai.baseUrl}/responses`;

async function probe(label: string, tools: unknown[]): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      model: config.models.meal,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: 'How many calories and grams of protein per 100g in Kellogg\'s Corn Flakes? Search the web.',
            },
          ],
        },
      ],
      tools,
      max_output_tokens: 400,
    }),
  });
  const text = await res.text();
  const hasSearch = /web_search|url_citation|search_results/i.test(text);
  console.log(`\n### ${label} -> ${res.status} (mentions search: ${hasSearch})`);
  console.log(text.slice(0, 500));
}

async function main(): Promise<void> {
  await probe("web_search", [{ type: "web_search" }]);
  await probe("web_search_preview", [{ type: "web_search_preview" }]);
}

void main();
