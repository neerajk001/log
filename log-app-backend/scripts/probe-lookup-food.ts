/** Dev-only: exercise the real lookup_food tool against Open Food Facts. */
import { executeCoachTool } from "../src/services/coach";

async function main(): Promise<void> {
  for (const q of ["Kellogg's corn flakes", "Amul butter"]) {
    const out = await executeCoachTool("probe-user", "lookup_food", JSON.stringify({ query: q }), "2026-10-10");
    console.log(`\n=== ${q} ===`);
    console.log(JSON.stringify(out, null, 2).slice(0, 700));
  }
}

void main();
