/** Dev-only: confirm the generated Prisma client and the DB schema agree. */
import { prisma } from "../src/db/client";

async function main(): Promise<void> {
  try {
    const session = await prisma.coachSession.findFirst({ select: { id: true, agent: true } });
    console.log("coachSession.agent  OK:", session ? `row agent=${session.agent}` : "(no rows)");
  } catch (err) {
    console.log("coachSession.agent  FAIL:", err instanceof Error ? err.message.split("\n")[0] : err);
  }

  try {
    const meal = await prisma.mealLog.findFirst({ select: { id: true, date: true } });
    console.log("mealLog             OK:", meal ? `row ${meal.date.toISOString().slice(0, 10)}` : "(no rows)");
  } catch (err) {
    console.log("mealLog             FAIL:", err instanceof Error ? err.message.split("\n")[0] : err);
  }

  await prisma.$disconnect();
}

void main();
