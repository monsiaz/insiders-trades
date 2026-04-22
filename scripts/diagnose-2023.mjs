import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const rows = await p.backtestResult.findMany({
  where: {
    direction: "BUY",
    returnFromPub90d: { not: null },
    declaration: { type: "DIRIGEANTS", pubDate: { gte: new Date("2022-01-01"), lte: new Date("2026-12-31") } },
  },
  select: {
    declaration: { select: { pubDate: true, signalScore: true, totalAmount: true, isCluster: true } },
  },
});

const byYear = {};
for (const r of rows) {
  const y = r.declaration.pubDate.getUTCFullYear();
  if (!byYear[y]) byYear[y] = { total: 0, score50: 0, score50Amt100k: 0, score50Amt100kCluster: 0 };
  byYear[y].total++;
  if ((r.declaration.signalScore ?? 0) >= 50) byYear[y].score50++;
  if ((r.declaration.signalScore ?? 0) >= 50 && (r.declaration.totalAmount ?? 0) >= 100_000) byYear[y].score50Amt100k++;
  if ((r.declaration.signalScore ?? 0) >= 50 && (r.declaration.totalAmount ?? 0) >= 100_000 && r.declaration.isCluster) byYear[y].score50Amt100kCluster++;
}
console.log("Year | total | score≥50 | score≥50+amt≥100k | +cluster");
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const d = byYear[y] ?? { total: 0, score50: 0, score50Amt100k: 0, score50Amt100kCluster: 0 };
  console.log(`${y}   | ${String(d.total).padStart(5)} | ${String(d.score50).padStart(8)} | ${String(d.score50Amt100k).padStart(17)} | ${String(d.score50Amt100kCluster).padStart(8)}`);
}

// Also count months where each strategy has ≥ 3 picks in each year
console.log("\nMonths with ≥ 3 picks per year (for score≥50 + amt≥100k + T+90):");
const byMonth = {};
for (const r of rows) {
  if ((r.declaration.signalScore ?? 0) < 50) continue;
  if ((r.declaration.totalAmount ?? 0) < 100_000) continue;
  const pd = r.declaration.pubDate;
  const key = `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, "0")}`;
  byMonth[key] = (byMonth[key] ?? 0) + 1;
}
const monthsByYear = {};
for (const [k, n] of Object.entries(byMonth)) {
  if (n < 3) continue;
  const y = Number(k.slice(0, 4));
  monthsByYear[y] = (monthsByYear[y] ?? 0) + 1;
}
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  console.log(`  ${y} : ${monthsByYear[y] ?? 0} mois avec ≥ 3 picks`);
}

await p.$disconnect();
