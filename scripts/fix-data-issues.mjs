/**
 * Fix the concrete data issues surfaced by audit-full.mjs:
 *
 *  1. 4 déclarations avec transactionDate dans le futur  → clamp à pubDate
 *  2. 659 backtests avec priceAtTrade ≤ 0               → delete (will be recomputed)
 *  3. 94 déclarations avec pctOfMarketCap > 500%        → nullify (nonsense, corp actions)
 *  4. 14 déclarations avec transactionDate < 2010       → clamp à pubDate if pubDate-tx > 5y
 *
 * DRY-RUN by default. Pass --apply to commit changes.
 *   node scripts/fix-data-issues.mjs          # preview
 *   node scripts/fix-data-issues.mjs --apply  # execute
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const DAY = 86400_000;
const now = Date.now();

const mode = APPLY ? "\x1b[31m[APPLY]\x1b[0m" : "\x1b[32m[DRY-RUN]\x1b[0m";
console.log(`\n${mode} fix-data-issues.mjs\n`);

async function fixFutureDates() {
  console.log("── 1. Fixing future transactionDate → pubDate");
  const records = await p.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      transactionDate: { gt: new Date(now + DAY) },
    },
    select: { id: true, amfId: true, pubDate: true, transactionDate: true, company: { select: { name: true } } },
  });
  console.log(`   ${records.length} record(s) found`);
  for (const r of records) {
    console.log(`   • ${r.amfId} ${r.company.name}: ${r.transactionDate.toISOString().slice(0,10)} → ${r.pubDate.toISOString().slice(0,10)}`);
  }
  if (APPLY && records.length > 0) {
    for (const r of records) {
      await p.declaration.update({
        where: { id: r.id },
        data: { transactionDate: r.pubDate, scoredAt: null }, // unscore so it'll be re-scored
      });
    }
    console.log(`   ✓ Updated ${records.length} rows`);
  }
}

async function fixAncientDates() {
  console.log("\n── 2. Fixing ancient transactionDate < 2010 (where gap > 5y) → pubDate");
  const records = await p.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      transactionDate: { lt: new Date("2010-01-01") },
    },
    select: { id: true, amfId: true, pubDate: true, transactionDate: true, company: { select: { name: true } } },
  });

  // Only fix where gap > 5 years (true parsing errors, not legit vesting)
  const toFix = records.filter((r) => r.pubDate.getTime() - r.transactionDate.getTime() > 5 * 365 * DAY);
  console.log(`   ${toFix.length}/${records.length} record(s) will be fixed (gap > 5y)`);
  for (const r of toFix) {
    console.log(`   • ${r.amfId} ${r.company.name}: ${r.transactionDate.toISOString().slice(0,10)} → ${r.pubDate.toISOString().slice(0,10)}`);
  }
  if (APPLY && toFix.length > 0) {
    for (const r of toFix) {
      await p.declaration.update({
        where: { id: r.id },
        data: { transactionDate: r.pubDate, scoredAt: null },
      });
    }
    console.log(`   ✓ Updated ${toFix.length} rows`);
  }
}

async function deleteBadBacktests() {
  console.log("\n── 3. Deleting backtests with priceAtTrade ≤ 0 (will recompute)");
  const count = await p.backtestResult.count({ where: { priceAtTrade: { lte: 0 } } });
  console.log(`   ${count} bad backtest record(s) found`);
  if (APPLY && count > 0) {
    const res = await p.backtestResult.deleteMany({ where: { priceAtTrade: { lte: 0 } } });
    console.log(`   ✓ Deleted ${res.count} rows`);
  }
}

async function nullifyCrazyPctMcap() {
  console.log("\n── 4. Nullifying pctOfMarketCap > 500% (corp actions / broken mcap)");
  const records = await p.declaration.findMany({
    where: { pctOfMarketCap: { gt: 500 } },
    select: { id: true, amfId: true, pctOfMarketCap: true, transactionNature: true, company: { select: { name: true } } },
    take: 100,
  });
  console.log(`   ${records.length} record(s) with %mcap > 500% (will be nullified)`);
  if (APPLY && records.length > 0) {
    const res = await p.declaration.updateMany({
      where: { pctOfMarketCap: { gt: 500 } },
      data: { pctOfMarketCap: null, scoredAt: null }, // unscore to recompute cleanly
    });
    console.log(`   ✓ Nullified ${res.count} rows (will be re-scored on next pass)`);
  }
}

async function auditInsidersWithoutLinks() {
  console.log("\n── 5. Audit: insiders without active companies links");
  const orphans = await p.insider.findMany({
    where: { companies: { none: {} } },
    select: { id: true, name: true, slug: true, _count: { select: { declarations: true } } },
    take: 10,
  });
  console.log(`   ${orphans.length} orphan insider(s) shown (limit 10):`);
  for (const o of orphans) {
    console.log(`   • ${o.name} (${o.slug}) — ${o._count.declarations} déclarations`);
  }
  // No fix here — informative only
}

async function summary() {
  console.log("\n── Summary after fixes");
  const [future, bad, crazy] = await Promise.all([
    p.declaration.count({ where: { type: "DIRIGEANTS", transactionDate: { gt: new Date(now + DAY) } } }),
    p.backtestResult.count({ where: { priceAtTrade: { lte: 0 } } }),
    p.declaration.count({ where: { pctOfMarketCap: { gt: 500 } } }),
  ]);
  console.log(`   future dates:        ${future}`);
  console.log(`   bad backtests:       ${bad}`);
  console.log(`   %mcap > 500%:        ${crazy}`);
}

async function main() {
  await fixFutureDates();
  await fixAncientDates();
  await deleteBadBacktests();
  await nullifyCrazyPctMcap();
  await auditInsidersWithoutLinks();
  if (APPLY) await summary();

  if (!APPLY) {
    console.log("\n\x1b[33m[DRY-RUN]\x1b[0m No changes applied. Re-run with --apply to commit.");
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
