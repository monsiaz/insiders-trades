/**
 * scripts/recompute-backtest.mjs
 *
 * Computes backtest results for ALL transaction types:
 *   BUY  → Acquisition, Souscription, Exercice, Actions gratuites
 *   SELL → Cession
 *
 * 6 time horizons: T+30, T+60, T+90, T+160, T+365, T+730
 * Yahoo Finance 10y data to cover all horizons.
 *
 * Run: node scripts/recompute-backtest.mjs [--reset]
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CONCURRENCY = 8;
const BATCH_SIZE = 300;
const HORIZONS = [30, 60, 90, 160, 365, 730];

const args = process.argv.slice(2);
const RESET = args.includes("--reset");

// ── Direction classifier ───────────────────────────────────────────────────

function getDirection(transactionNature) {
  if (!transactionNature) return "OTHER";
  const n = transactionNature.toLowerCase();
  if (n.includes("cession")) return "SELL";
  if (n.includes("acquisition") || n.includes("souscription") || n.includes("exercice")) return "BUY";
  return "BUY"; // actions gratuites, attribution etc → treated as BUY signal
}

// ── Yahoo Finance ───────────────────────────────────────────────────────────

async function fetchChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=10y&includePrePost=false`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    return timestamps
      .map((ts, i) => ({ ts: ts * 1000, close: closes[i] ?? 0 }))
      .filter((p) => p.close > 0);
  } catch {
    return [];
  }
}

function priceNear(points, targetTs, maxDays = 12) {
  const maxDelta = maxDays * 86400_000;
  let best = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const delta = p.ts - targetTs;
    if (delta >= 0 && delta < maxDelta && delta < bestDelta) {
      best = p.close;
      bestDelta = delta;
    }
  }
  return best;
}

function ret(p, base) {
  if (p == null || base == null || base === 0) return null;
  return ((p - base) / base) * 100;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();

  if (RESET) {
    console.log("🗑️  Deleting all existing BacktestResult rows…");
    const { count } = await prisma.backtestResult.deleteMany({});
    console.log(`   Deleted ${count} rows.\n`);
  } else {
    // Only remove failed rows so they get another chance
    await prisma.backtestResult.deleteMany({ where: { priceAtTrade: 0 } });
  }

  // Count ALL eligible: any transaction nature (except null), with ISIN + Yahoo symbol
  const total = await prisma.declaration.count({
    where: {
      type: "DIRIGEANTS",
      transactionNature: { not: null },
      isin: { not: null },
      company: { yahooSymbol: { not: null } },
    },
  });

  // Count by direction
  const [buys, sells] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: { not: null }, isin: { not: null }, company: { yahooSymbol: { not: null } }, NOT: { transactionNature: { contains: "Cession", mode: "insensitive" } } } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: { contains: "Cession", mode: "insensitive" }, isin: { not: null }, company: { yahooSymbol: { not: null } } } }),
  ]);

  console.log(`📊 ${total} declarations to backtest`);
  console.log(`   → ${buys} achats · ${sells} ventes`);
  console.log(`⏱️  Horizons: ${HORIZONS.join(", ")} jours\n`);

  const priceCache = new Map();
  let computed = 0;
  let noPrice = 0;
  let batchNum = 0;

  while (true) {
    const batch = await prisma.declaration.findMany({
      where: {
        type: "DIRIGEANTS",
        transactionNature: { not: null },
        isin: { not: null },
        company: { yahooSymbol: { not: null } },
        backtestResult: null,
      },
      take: BATCH_SIZE,
      orderBy: { pubDate: "desc" },
      select: {
        id: true,
        transactionDate: true,
        pubDate: true,
        transactionNature: true,
        company: { select: { yahooSymbol: true } },
      },
    });

    if (batch.length === 0) break;
    batchNum++;

    // Group by Yahoo symbol
    const bySymbol = new Map();
    for (const d of batch) {
      const sym = d.company.yahooSymbol;
      if (!bySymbol.has(sym)) bySymbol.set(sym, []);
      bySymbol.get(sym).push(d);
    }

    // Fetch uncached symbols in parallel
    const uncachedSymbols = [...bySymbol.keys()].filter((s) => !priceCache.has(s));
    for (let i = 0; i < uncachedSymbols.length; i += CONCURRENCY) {
      const chunk = uncachedSymbols.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map((s) => fetchChart(s)));
      chunk.forEach((s, j) => priceCache.set(s, results[j]));
    }

    // Compute all horizons for each declaration
    const upserts = [];
    for (const decl of batch) {
      const sym = decl.company.yahooSymbol;
      const points = priceCache.get(sym) ?? [];
      const tradeDate = decl.transactionDate ?? decl.pubDate;
      const tradeDateTs = tradeDate.getTime();
      const direction = getDirection(decl.transactionNature);

      const priceAtTrade = priceNear(points, tradeDateTs, 12);

      if (!priceAtTrade) {
        noPrice++;
        upserts.push(
          prisma.backtestResult.upsert({
            where: { declarationId: decl.id },
            create: { declarationId: decl.id, direction, priceAtTrade: 0 },
            update: { computedAt: new Date() },
          })
        );
        continue;
      }

      const prices = {};
      for (const h of HORIZONS) {
        prices[`price${h}d`] = priceNear(points, tradeDateTs + h * 86400_000, 12);
      }

      const returns = {};
      for (const h of HORIZONS) {
        returns[`return${h}d`] = ret(prices[`price${h}d`], priceAtTrade);
      }

      computed++;
      upserts.push(
        prisma.backtestResult.upsert({
          where: { declarationId: decl.id },
          create: { declarationId: decl.id, direction, priceAtTrade, ...prices, ...returns },
          update: { direction, priceAtTrade, ...prices, ...returns, computedAt: new Date() },
        })
      );
    }

    await Promise.all(upserts);

    const pct = Math.round(((computed + noPrice) / total) * 100);
    const elapsed = Math.round((Date.now() - t0) / 1000);
    process.stdout.write(
      `\r  Batch ${batchNum}: ${computed + noPrice}/${total} (${pct}%) | ✓ ${computed} | ✗ ${noPrice} | ${elapsed}s`
    );
  }

  console.log("\n");

  // Final stats
  const [total_rows, with_price, with365, buys_done, sells_done] = await Promise.all([
    prisma.backtestResult.count(),
    prisma.backtestResult.count({ where: { priceAtTrade: { gt: 0 } } }),
    prisma.backtestResult.count({ where: { return365d: { not: null } } }),
    prisma.backtestResult.count({ where: { direction: "BUY", priceAtTrade: { gt: 0 } } }),
    prisma.backtestResult.count({ where: { direction: "SELL", priceAtTrade: { gt: 0 } } }),
  ]);

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`✅ Done in ${Math.floor(elapsed / 60)}m${elapsed % 60}s`);
  console.log(`   Total rows        : ${total_rows}`);
  console.log(`   Avec données prix : ${with_price}`);
  console.log(`   Dont ACHATS       : ${buys_done}`);
  console.log(`   Dont VENTES       : ${sells_done}`);
  console.log(`   Avec T+365        : ${with365}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
