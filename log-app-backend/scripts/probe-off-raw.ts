/** Dev-only: raw Open Food Facts responses to debug the lookup. */
import { config } from "../src/config";

async function main(): Promise<void> {
  for (const q of ["Kellogg's corn flakes", "Kelloggs corn flakes", "Amul butter"]) {
    const term = q.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    const url =
      "https://world.openfoodfacts.org/cgi/search.pl?" +
      new URLSearchParams({
        search_terms: term,
        search_simple: "1",
        action: "process",
        json: "1",
        page_size: "3",
        fields: "product_name,brands",
      }).toString();
    const res = await fetch(url, {
      headers: { "User-Agent": config.food.offUserAgent, Accept: "application/json" },
    });
    const text = await res.text();
    let count = "?";
    try {
      count = String((JSON.parse(text) as { products?: unknown[] }).products?.length ?? 0);
    } catch {
      /* not json */
    }
    console.log(`\n${q}  (term="${term}") -> HTTP ${res.status}, products: ${count}`);
    console.log(text.slice(0, 160).replace(/\s+/g, " "));
  }
}

void main();
