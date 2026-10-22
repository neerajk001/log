import { prisma } from "../src/db/client";

/**
 * Repairs days where meals were logged into a daily row whose macros were NULL.
 *
 * Before the COALESCE fix in `applyDailyDelta`, a weight/sleep-only day had
 * NULL calories/protein, and `NULL + meal` stayed NULL. The Today card masked
 * it by summing meals client-side; Insights, trends, and the weekly verdict
 * read `daily_logs` and showed blanks.
 *
 * Only NULL fields are filled — manual daily totals are never overwritten.
 * Dry-run by default; pass `--apply` to write.
 */

const APPLY = process.argv.includes("--apply");
const iso = (d: Date) => d.toISOString().slice(0, 10);

type FieldRepair = {
  userId: string;
  date: string;
  field: "calories" | "proteinG";
  to: number;
};

type RowCreate = {
  userId: string;
  date: Date;
  calories: number | null;
  proteinG: number | null;
};

async function main(): Promise<void> {
  const totals = await prisma.mealLog.groupBy({
    by: ["userId", "date"],
    _sum: { calories: true, proteinG: true },
  });

  if (totals.length === 0) {
    console.log("No meal rows found.");
    return;
  }

  const dates = [...new Map(totals.map((t) => [t.date.getTime(), t.date])).values()];
  const daily = await prisma.dailyLog.findMany({
    where: { date: { in: dates } },
    select: { userId: true, date: true, calories: true, proteinG: true },
  });
  const byKey = new Map(daily.map((d) => [`${d.userId}:${iso(d.date)}`, d]));

  const repairs: FieldRepair[] = [];
  const creates: RowCreate[] = [];

  for (const total of totals) {
    const date = iso(total.date);
    const calories = total._sum.calories ?? null;
    const proteinG = total._sum.proteinG ?? null;
    const row = byKey.get(`${total.userId}:${date}`);

    if (!row) {
      if (calories != null || proteinG != null) {
        creates.push({ userId: total.userId, date: total.date, calories, proteinG });
      }
      continue;
    }
    if (row.calories == null && calories != null) {
      repairs.push({ userId: total.userId, date, field: "calories", to: calories });
    }
    if (row.proteinG == null && proteinG != null) {
      repairs.push({ userId: total.userId, date, field: "proteinG", to: proteinG });
    }
  }

  console.log(
    `Meal days: ${totals.length} · null fields to repair: ${repairs.length} · missing daily rows: ${creates.length}`,
  );
  for (const r of repairs) {
    console.log(`${r.date} ${r.userId} ${r.field}: null -> ${r.to}`);
  }
  for (const c of creates) {
    console.log(
      `${iso(c.date)} ${c.userId} create daily row: ${c.calories ?? "-"} kcal / ${c.proteinG ?? "-"} g`,
    );
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const r of repairs) {
      await tx.dailyLog.update({
        where: { userId_date: { userId: r.userId, date: new Date(r.date) } },
        data: r.field === "calories" ? { calories: r.to } : { proteinG: r.to },
      });
    }
    for (const c of creates) {
      await tx.dailyLog.create({
        data: {
          userId: c.userId,
          date: c.date,
          calories: c.calories,
          proteinG: c.proteinG,
        },
      });
    }
  });

  console.log(`\nApplied ${repairs.length} field repairs and ${creates.length} daily rows.`);
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
