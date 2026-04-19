/**
 * scripts/pipeline.ts — Full local enrichment pipeline
 *
 * Steps:
 *  1. Financial enrichment  → Yahoo Finance for all companies (parallel)
 *  2. Signal scoring        → score all declarations with amounts
 *  3. Backtest computation  → Yahoo historical prices for buy declarations
 *
 * Run: npx tsx scripts/pipeline.ts [--step financials|signals|backtest|all]
 *
 * Crons on Vercel handle future live maintenance automatically.
 */

import { enrichCompanyFinancials } from "../src/lib/financials";
import { scoreDeclarations } from "../src/lib/signals";
import { prisma } from "../src/lib/prisma";

// ─── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const stepArg = args.find((a) => a.startsWith("--step="))?.split("=")[1] ?? "all";
const steps = stepArg === "all" ? ["financials", "signals", "backtest"] : [stepArg];

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function elapsed(start: number) {
  const s = Math.round((Date.now() - start) / 1000);
  return `${Math.floor(s / 60)}m${s % 60}s`;
}

// ─── Step 0: Populate company ISINs from declarations ───────────────────────

async function populateCompanyIsins() {
  // For each company, take the most recent ISIN from its declarations
  const rows = await prisma.$queryRaw<Array<{ companyId: string; isin: string }>>`
    SELECT DISTINCT ON ("companyId") "companyId", isin
    FROM "Declaration"
    WHERE isin IS NOT NULL
    ORDER BY "companyId", "pubDate" DESC
  `;

  if (rows.length === 0) return 0;

  let updated = 0;
  for (const row of rows) {
    const co = await prisma.company.findUnique({
      where: { id: row.companyId },
      select: { isin: true },
    });
    if (!co?.isin) {
      await prisma.company.update({
        where: { id: row.companyId },
        data: { isin: row.isin },
      });
      updated++;
    }
  }
  return updated;
}

// ─── Step 1: Financial enrichment ───────────────────────────────────────────

async function runFinancials() {
  log("━━━ Step 1: Financial enrichment (Yahoo Finance) ━━━");

  // First populate company ISINs from declarations
  log("  Populating company ISINs from declarations...");
  const isinUpdated = await populateCompanyIsins();
  log(`  → ${isinUpdated} company ISINs populated`);

  const [totalCompanies, withIsin] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { isin: { not: null } } }),
  ]);
  log(`Companies: ${totalCompanies} total, ${withIsin} with ISIN to enrich`);

  if (withIsin === 0) {
    log("  No companies with ISIN — skipping Yahoo enrichment");
    return;
  }

  const start = Date.now();
  let round = 0;
  let lastCount = -1;

  while (true) {
    const remaining = await prisma.company.count({
      where: {
        OR: [
          { financialsAt: null },
          { financialsAt: { lt: new Date(Date.now() - 7 * 86400_000) } },
        ],
        isin: { not: null },
      },
    });

    if (remaining === 0 || remaining === lastCount) break;
    lastCount = remaining;

    round++;
    log(`  Round ${round}: ${remaining} companies remaining...`);
    await enrichCompanyFinancials(50);

    const enriched = await prisma.company.count({ where: { financialsAt: { not: null } } });
    process.stdout.write(`\r  ✓ ${enriched} enriched | elapsed: ${elapsed(start)}`);
  }

  const withMcap = await prisma.company.count({ where: { marketCap: { not: null } } });
  console.log(`\n  ✅ Financials done in ${elapsed(start)} — ${withMcap} companies with market cap`);
}

// ─── Step 2: Signal scoring ──────────────────────────────────────────────────

async function runSignals() {
  log("━━━ Step 2: Signal scoring ━━━");

  const [total, scored, withAmount] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", scoredAt: { not: null } } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", totalAmount: { not: null } } }),
  ]);

  log(`Declarations: ${total} total | ${withAmount} with amount | ${scored} already scored`);

  if (withAmount === 0) {
    log("  No declarations with amount — skipping");
    return;
  }

  const start = Date.now();
  log(`  Scoring ${withAmount - scored} unscored declarations (batch size 500)...`);

  // Score in large batches — force=false means only unscored ones
  await scoreDeclarations(false, 500);

  // Force re-score all so cluster/pct calculations are up-to-date with new data
  log("  Re-scoring all to update cluster/flow calculations...");
  await scoreDeclarations(true, 500);

  const finalScored = await prisma.declaration.count({
    where: { type: "DIRIGEANTS", scoredAt: { not: null } },
  });
  log(`  ✅ Signals done in ${elapsed(start)} — ${finalScored} declarations scored`);
}

// ─── Step 3: Backtest computation ───────────────────────────────────────────

interface YahooPoint { ts: number; close: number }

async function fetchYahooChart(symbol: string): Promise<YahooPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5y&includePrePost=false`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    return timestamps
      .map((ts, i) => ({ ts: ts * 1000, close: closes[i] ?? 0 }))
      .filter((p) => p.close > 0);
  } catch {
    return [];
  }
}

function priceNear(points: YahooPoint[], targetTs: number, maxDays = 10): number | null {
  const maxDelta = maxDays * 86400_000;
  let best: number | null = null;
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

async function runBacktest() {
  log("━━━ Step 3: Backtest computation ━━━");

  // First ensure companies without Yahoo symbol get one assigned from ISIN
  await resolveYahooSymbols();

  const pendingCount = await prisma.declaration.count({
    where: {
      type: "DIRIGEANTS",
      transactionNature: { contains: "Acquisition", mode: "insensitive" },
      transactionDate: { not: null },
      isin: { not: null },
      totalAmount: { gt: 0 },
      backtestResult: null,
      company: { yahooSymbol: { not: null } },
    },
  });

  log(`  ${pendingCount} buy declarations to backtest`);

  if (pendingCount === 0) {
    log("  Nothing to compute.");
    return;
  }

  const start = Date.now();
  let computed = 0;
  let errors = 0;

  // Cache prices per symbol to avoid redundant Yahoo calls
  const priceCache = new Map<string, YahooPoint[]>();

  // Process in batches of 200
  while (true) {
    const batch = await prisma.declaration.findMany({
      where: {
        type: "DIRIGEANTS",
        transactionNature: { contains: "Acquisition", mode: "insensitive" },
        transactionDate: { not: null },
        isin: { not: null },
        totalAmount: { gt: 0 },
        backtestResult: null,
        company: { yahooSymbol: { not: null } },
      },
      take: 200,
      orderBy: { transactionDate: "desc" },
      select: {
        id: true,
        transactionDate: true,
        company: { select: { yahooSymbol: true } },
      },
    });

    if (batch.length === 0) break;

    // Group by symbol to batch Yahoo calls
    const bySymbol = new Map<string, typeof batch>();
    for (const d of batch) {
      const sym = d.company.yahooSymbol!;
      if (!bySymbol.has(sym)) bySymbol.set(sym, []);
      bySymbol.get(sym)!.push(d);
    }

    // Fetch Yahoo prices for all symbols concurrently (max 10 at a time)
    const symbols = [...bySymbol.keys()].filter((s) => !priceCache.has(s));
    for (let i = 0; i < symbols.length; i += 10) {
      const chunk = symbols.slice(i, i + 10);
      const results = await Promise.all(chunk.map((s) => fetchYahooChart(s)));
      chunk.forEach((s, j) => priceCache.set(s, results[j]));
    }

    // Compute backtest results
    const upserts: Promise<unknown>[] = [];
    for (const decl of batch) {
      const symbol = decl.company.yahooSymbol!;
      const points = priceCache.get(symbol) ?? [];
      const tradeDateTs = decl.transactionDate!.getTime();

      const priceAtTrade = priceNear(points, tradeDateTs, 10);
      if (!priceAtTrade) {
        errors++;
        // Mark as attempted so we don't loop forever on no-price declarations
        upserts.push(
          prisma.backtestResult.upsert({
            where: { declarationId: decl.id },
            create: { declarationId: decl.id, priceAtTrade: 0 },
            update: { computedAt: new Date() },
          })
        );
        continue;
      }

      const p30 = priceNear(points, tradeDateTs + 30 * 86400_000, 10);
      const p60 = priceNear(points, tradeDateTs + 60 * 86400_000, 10);
      const p90 = priceNear(points, tradeDateTs + 90 * 86400_000, 10);
      const p160 = priceNear(points, tradeDateTs + 160 * 86400_000, 10);
      const p365 = priceNear(points, tradeDateTs + 365 * 86400_000, 10);
      const p730 = priceNear(points, tradeDateTs + 730 * 86400_000, 10);
      const ret = (p: number | null) => p != null ? ((p - priceAtTrade) / priceAtTrade) * 100 : null;

      upserts.push(
        prisma.backtestResult.upsert({
          where: { declarationId: decl.id },
          create: {
            declarationId: decl.id,
            priceAtTrade,
            price30d: p30, price60d: p60, price90d: p90, price160d: p160, price365d: p365, price730d: p730,
            return30d: ret(p30), return60d: ret(p60), return90d: ret(p90), return160d: ret(p160), return365d: ret(p365), return730d: ret(p730),
          },
          update: {
            priceAtTrade,
            price30d: p30, price60d: p60, price90d: p90, price160d: p160, price365d: p365, price730d: p730,
            return30d: ret(p30), return60d: ret(p60), return90d: ret(p90), return160d: ret(p160), return365d: ret(p365), return730d: ret(p730),
            computedAt: new Date(),
          },
        })
      );
      computed++;
    }

    await Promise.all(upserts);
    process.stdout.write(`\r  ✓ ${computed}/${pendingCount} | errors: ${errors} | elapsed: ${elapsed(start)}`);
  }

  const finalCount = await prisma.backtestResult.count();
  console.log(`\n  ✅ Backtest done in ${elapsed(start)} — ${finalCount} results in DB`);
}

// ─── Resolve Yahoo symbols for companies without one ────────────────────────

async function resolveYahooSymbols() {
  const companies = await prisma.company.findMany({
    where: { yahooSymbol: null, isin: { not: null } },
    select: { id: true, name: true, isin: true },
    take: 500,
  });

  if (companies.length === 0) return;
  log(`  Resolving Yahoo symbols for ${companies.length} companies...`);

  const suffixMap: Record<string, string> = {
    FR: ".PA", LU: ".PA", NL: ".AS", DE: ".DE", GB: ".L",
    IT: ".MI", ES: ".MC", BE: ".BR", CH: ".SW", SE: ".ST",
  };

  let resolved = 0;
  for (let i = 0; i < companies.length; i += 10) {
    const chunk = companies.slice(i, i + 10);
    await Promise.all(
      chunk.map(async (co) => {
        const suffix = suffixMap[co.isin!.slice(0, 2)] ?? ".PA";
        const queries = [co.isin!, co.name, co.name?.split(" ")[0]].filter(Boolean);

        for (const q of queries) {
          try {
            const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q!)}&quotesCount=6&lang=fr&region=FR`;
            const res = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(6000),
            });
            if (!res.ok) continue;
            const data = await res.json();
            const quotes: Array<{ symbol?: string; quoteType?: string }> = data?.quotes ?? [];
            const equities = quotes.filter((q) => q.quoteType === "EQUITY" && q.symbol);
            const match =
              equities.find((q) => q.symbol?.endsWith(suffix)) ??
              equities.find((q) => q.symbol?.endsWith(".PA")) ??
              equities[0];
            if (match?.symbol) {
              await prisma.company.update({
                where: { id: co.id },
                data: { yahooSymbol: match.symbol },
              });
              resolved++;
              break;
            }
          } catch { /* continue */ }
        }
      })
    );
    await new Promise((r) => setTimeout(r, 300));
  }

  log(`  → ${resolved} symbols resolved`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const globalStart = Date.now();
  log(`🚀 Pipeline starting — steps: ${steps.join(", ")}`);

  try {
    if (steps.includes("financials")) await runFinancials();
    if (steps.includes("signals")) await runSignals();
    if (steps.includes("backtest")) await runBacktest();

    log(`\n🎉 Pipeline complete in ${elapsed(globalStart)}`);

    // Final summary
    const [decls, scored, backtests, companies, withMcap] = await Promise.all([
      prisma.declaration.count(),
      prisma.declaration.count({ where: { scoredAt: { not: null } } }),
      prisma.backtestResult.count(),
      prisma.company.count(),
      prisma.company.count({ where: { marketCap: { not: null } } }),
    ]);

    console.log("\n📊 Final DB stats:");
    console.log(`   Declarations: ${decls}`);
    console.log(`   Scored:       ${scored} (${Math.round(scored / decls * 100)}%)`);
    console.log(`   Backtest:     ${backtests}`);
    console.log(`   Companies:    ${companies} (${withMcap} with market cap)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
