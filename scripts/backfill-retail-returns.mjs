/**
 * Backfill priceAtPub, returnFromPub_30/90/365d, pubLeakPct for all
 * existing BacktestResult rows.
 *
 * For each backtest:
 *  1. Fetch Yahoo daily chart (cached per symbol)
 *  2. Find close at pubDate+1 (next trading day after publication)
 *  3. Find close at pubDate+1+30d, +90d, +365d
 *  4. Compute retail returns + leak pct
 *
 * Runs serially per symbol to avoid hammering Yahoo. ~5 min for 22k backtests.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const DAY = 86400_000;

const C = { reset: "\x1b[0m", dim: "\x1b[2m", cyan: "\x1b[36m", green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m" };

async function fetchChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=20y`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return [];
    const d = await r.json();
    const result = d?.chart?.result?.[0];
    if (!result) return [];
    const ts = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    return ts
      .map((t, i) => ({ ts: t * 1000, close: closes[i] ?? 0 }))
      .filter((p) => p.close > 0);
  } catch { return []; }
}

/**
 * Find the close price at the first trading day AT OR AFTER targetTs.
 * Max tolerance 12 days (weekends + holidays + suspensions).
 */
function priceNear(points, targetTs) {
  const maxDelta = 12 * DAY;
  let best = null, bestDelta = Infinity;
  for (const p of points) {
    const delta = p.ts - targetTs;
    if (delta >= 0 && delta < maxDelta && delta < bestDelta) {
      best = p.close;
      bestDelta = delta;
    }
  }
  return best;
}

async function main() {
  // Fetch all BacktestResult that are missing returnFromPub* fields
  console.log(`${C.cyan}Loading backtest rows to backfill…${C.reset}`);
  const rows = await p.backtestResult.findMany({
    where: { returnFromPub90d: null, priceAtTrade: { gt: 0 } },
    select: {
      id: true,
      priceAtTrade: true,
      declaration: {
        select: { pubDate: true, company: { select: { yahooSymbol: true } } },
      },
    },
  });
  console.log(`${C.dim}  ${rows.length} backtests to process${C.reset}\n`);

  // Group by symbol to minimise Yahoo API calls
  const bySymbol = new Map();
  for (const r of rows) {
    const sym = r.declaration.company.yahooSymbol;
    if (!sym) continue;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym).push(r);
  }
  console.log(`${C.dim}  ${bySymbol.size} unique symbols${C.reset}\n`);

  let processed = 0, errors = 0, skipped = 0;
  const t0 = Date.now();

  for (const [symbol, group] of bySymbol) {
    const points = await fetchChart(symbol);
    if (points.length === 0) {
      skipped += group.length;
      continue;
    }

    for (const r of group) {
      try {
        // Entry = pubDate + 1 day (simulate "user sees signal in the morning after")
        const pubTs = r.declaration.pubDate.getTime();
        const entryTs = pubTs + DAY;

        const priceAtPub = priceNear(points, entryTs);
        if (!priceAtPub) { errors++; continue; }

        const price30 = priceNear(points, entryTs + 30 * DAY);
        const price90 = priceNear(points, entryTs + 90 * DAY);
        const price365 = priceNear(points, entryTs + 365 * DAY);

        const ret30 = price30 ? ((price30 - priceAtPub) / priceAtPub) * 100 : null;
        const ret90 = price90 ? ((price90 - priceAtPub) / priceAtPub) * 100 : null;
        const ret365 = price365 ? ((price365 - priceAtPub) / priceAtPub) * 100 : null;
        const leakPct = r.priceAtTrade > 0
          ? ((priceAtPub - r.priceAtTrade) / r.priceAtTrade) * 100
          : null;

        await p.backtestResult.update({
          where: { id: r.id },
          data: {
            priceAtPub,
            returnFromPub30d: ret30,
            returnFromPub90d: ret90,
            returnFromPub365d: ret365,
            pubLeakPct: leakPct,
          },
        });
        processed++;
        if (processed % 200 === 0) {
          const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
          console.log(`  ${processed}/${rows.length} (${elapsed}s · ${(processed / ((Date.now() - t0) / 1000)).toFixed(0)}/s · ${bySymbol.size - [...bySymbol.keys()].indexOf(symbol)} symbols left)`);
        }
      } catch (e) {
        errors++;
      }
    }
    // Rate limit between symbols
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\n${C.green}Done${C.reset}  processed=${processed}  errors=${errors}  skipped=${skipped}  elapsed=${((Date.now() - t0) / 1000 / 60).toFixed(1)}min`);
  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
