/**
 * scripts/enrich-all-yahoo.mjs
 *
 * Bulk Yahoo Finance enrichment for ALL companies missing a symbol or price data.
 * Runs locally — processes in batches with rate limiting.
 *
 * Usage:
 *   node scripts/enrich-all-yahoo.mjs            # all missing
 *   node scripts/enrich-all-yahoo.mjs --reset    # retry all companies
 *   node scripts/enrich-all-yahoo.mjs --stale    # also refresh data >7 days old
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const RESET  = args.includes("--reset");
const STALE  = args.includes("--stale");
const DELAY  = 300; // ms between requests (Yahoo rate limit: ~200req/min max)
const BATCH  = 5;   // concurrent companies per wave

// ── Name cleaning ─────────────────────────────────────────────────────────────

function cleanName(name) {
  return name
    .replace(/\bS\.?A\.?S\.?\b|\bS\.?A\.?\b|\bS\.?E\.?\b|\bS\.?C\.?A\.?\b|\bS\.?N\.?C\.?\b/gi, "")
    .replace(/\bGROUPE\b/gi, "")
    .replace(/\bSOCIETE\b|\bSOCIÉTÉ\b/gi, "")
    .replace(/\bFRANCE\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function preferredSuffix(isin) {
  if (!isin) return ".PA";
  if (isin.startsWith("FR") || isin.startsWith("LU")) return ".PA";
  if (isin.startsWith("NL")) return ".AS";
  if (isin.startsWith("BE")) return ".BR";
  if (isin.startsWith("DE")) return ".DE";
  if (isin.startsWith("GB")) return ".L";
  if (isin.startsWith("IT")) return ".MI";
  if (isin.startsWith("ES")) return ".MC";
  if (isin.startsWith("CH")) return ".SW";
  if (isin.startsWith("PT")) return ".LS";
  return ".PA";
}

const UAs = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
];
const ua = () => UAs[Math.floor(Math.random() * UAs.length)];

async function searchYahoo(q, suffix) {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&lang=fr&region=FR`;
    const res = await fetch(url, {
      headers: { "User-Agent": ua(), Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const quotes = (data?.quotes ?? []).filter(q => ["EQUITY", "ETF"].includes(q.quoteType) && q.symbol);
    return (
      quotes.find(q => q.symbol?.endsWith(suffix))?.symbol ??
      quotes.find(q => q.symbol?.endsWith(".PA"))?.symbol ??
      quotes.find(q => !q.symbol?.match(/^[A-Z]{1,5}$/) || !["NMS","NYQ","PCX","ASE"].includes(q.exchange))?.symbol ??
      quotes[0]?.symbol ??
      null
    );
  } catch { return null; }
}

async function resolveSymbol(isin, name) {
  const suffix = preferredSuffix(isin);
  const queries = [];
  if (isin) queries.push(isin);
  if (name) {
    queries.push(name);
    const clean = cleanName(name);
    if (clean && clean !== name) queries.push(clean);
    const firstWord = clean.split(" ")[0];
    if (firstWord?.length > 3) queries.push(firstWord);
    const twoWords = clean.split(" ").slice(0, 2).join(" ");
    if (twoWords !== clean && twoWords !== firstWord) queries.push(twoWords);
  }
  for (const q of queries) {
    const sym = await searchYahoo(q, suffix);
    if (sym) return sym;
    await sleep(150);
  }
  return null;
}

// ── Yahoo data fetchers ───────────────────────────────────────────────────────

async function fetchChartMeta(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": ua() }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return { currentPrice: meta.regularMarketPrice, currency: meta.currency };
  } catch { return null; }
}

async function fetchTimeseries(symbol) {
  const TYPES = [
    "annualMarketCap","annualTotalRevenue","annualGrossProfit","annualEbitda",
    "annualNetIncome","annualTotalDebt","annualFreeCashFlow","annualDilutedEps",
    "annualSharesOutstanding","annualReturnOnEquity","annualReturnOnAssets",
  ].join(",");
  const p1 = Math.floor(Date.now() / 1000) - 5 * 365 * 86400;
  const p2 = Math.floor(Date.now() / 1000) + 86400;
  try {
    const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${TYPES}&period1=${p1}&period2=${p2}`;
    const res = await fetch(url, { headers: { "User-Agent": ua(), Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return {};
    const data = await res.json();
    const results = data?.timeseries?.result ?? [];
    const out = {};
    for (const r of results) {
      const type = r.meta?.type?.[0];
      const vals = r[type];
      if (!type || !vals?.length) continue;
      const raw = vals[vals.length - 1]?.reportedValue?.raw;
      if (raw == null) continue;
      if (type === "annualMarketCap")       out.marketCap = raw;
      if (type === "annualTotalRevenue")    out.revenue = raw;
      if (type === "annualGrossProfit")     out.grossProfit = raw;
      if (type === "annualEbitda")          out.ebitda = raw;
      if (type === "annualNetIncome")       out.netIncome ??= raw;
      if (type === "annualTotalDebt")       out.totalDebt = raw;
      if (type === "annualFreeCashFlow")    out.freeCashFlow = raw;
      if (type === "annualDilutedEps")      out.dilutedEps = raw;
      if (type === "annualSharesOutstanding") out.sharesOut = raw;
      if (type === "annualReturnOnEquity")  out.returnOnEquity = raw;
      if (type === "annualReturnOnAssets")  out.returnOnAssets = raw;
    }
    return out;
  } catch { return {}; }
}

async function fetchQuoteSummary(symbol) {
  try {
    const yf = await import("yahoo-finance2");
    const lib = yf.default?.default ?? yf.default ?? yf;
    if (!lib.quoteSummary) return {};
    const result = await lib.quoteSummary(
      symbol,
      { modules: ["financialData", "defaultKeyStatistics", "summaryDetail"] },
      { validateResult: false }
    );
    const fd = result.financialData ?? {};
    const ks = result.defaultKeyStatistics ?? {};
    const sd = result.summaryDetail ?? {};
    const out = {};
    if (fd.profitMargins) out.profitMargin = fd.profitMargins;
    if (fd.returnOnEquity) out.returnOnEquity = fd.returnOnEquity;
    if (fd.returnOnAssets) out.returnOnAssets = fd.returnOnAssets;
    if (fd.debtToEquity) out.debtToEquity = fd.debtToEquity;
    if (fd.recommendationKey) out.analystReco = fd.recommendationKey;
    if (fd.recommendationMean) out.analystScore = fd.recommendationMean;
    if (fd.targetMeanPrice) out.targetMean = fd.targetMeanPrice;
    if (fd.targetHighPrice) out.targetHigh = fd.targetHighPrice;
    if (fd.targetLowPrice)  out.targetLow  = fd.targetLowPrice;
    if (fd.numberOfAnalystOpinions) out.numAnalysts = fd.numberOfAnalystOpinions;
    if (ks.forwardPE) out.forwardPE = ks.forwardPE;
    if (ks.priceToBook) out.priceToBook = ks.priceToBook;
    if (ks.beta) out.beta = ks.beta;
    if (ks.heldPercentInsiders) out.heldByInsiders = ks.heldPercentInsiders;
    if (ks.heldPercentInstitutions) out.heldByInstitutions = ks.heldPercentInstitutions;
    if (ks.shortRatio) out.shortRatio = ks.shortRatio;
    if (ks.sharesOutstanding) out.sharesOut ??= ks.sharesOutstanding;
    if (sd.trailingPE) out.trailingPE = sd.trailingPE;
    if (sd.marketCap) out.marketCap ??= sd.marketCap;
    return out;
  } catch { return {}; }
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function storeFinancials(companyId, symbol, data) {
  const safe = v => (v != null && isFinite(v) && !isNaN(v)) ? v : undefined;
  const safeBig = v => safe(v) != null ? BigInt(Math.round(v)) : undefined;
  await prisma.company.update({
    where: { id: companyId },
    data: {
      yahooSymbol:    symbol,
      currentPrice:  safe(data.currentPrice),
      marketCap:     safeBig(data.marketCap),
      sharesOut:     safeBig(data.sharesOut),
      revenue:       safeBig(data.revenue),
      grossProfit:   safeBig(data.grossProfit),
      netIncome:     safeBig(data.netIncome),
      ebitda:        safeBig(data.ebitda),
      totalDebt:     safeBig(data.totalDebt),
      freeCashFlow:  safeBig(data.freeCashFlow),
      dilutedEps:    safe(data.dilutedEps),
      trailingPE:    safe(data.trailingPE),
      forwardPE:     safe(data.forwardPE),
      priceToBook:   safe(data.priceToBook),
      beta:          safe(data.beta),
      debtToEquity:  safe(data.debtToEquity),
      returnOnEquity: safe(data.returnOnEquity),
      returnOnAssets: safe(data.returnOnAssets),
      profitMargin:  safe(data.profitMargin),
      heldByInsiders: safe(data.heldByInsiders),
      heldByInstitutions: safe(data.heldByInstitutions),
      shortRatio:    safe(data.shortRatio),
      analystReco:   data.analystReco ?? null,
      analystScore:  safe(data.analystScore),
      targetMean:    safe(data.targetMean),
      targetHigh:    safe(data.targetHigh),
      targetLow:     safe(data.targetLow),
      numAnalysts:   data.numAnalysts ? Math.round(data.numAnalysts) : undefined,
      financialsAt:  new Date(),
      analystAt:     new Date(),
      marketCapAt:   new Date(),
    },
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────

async function processCompany(co, idx, total) {
  const label = `[${idx}/${total}] ${co.name}`;
  try {
    // 1. Resolve symbol if not already cached
    let symbol = co.yahooSymbol;
    if (!symbol) {
      symbol = await resolveSymbol(co.isin, co.name);
      if (!symbol) {
        console.log(`${label} → ✗ no symbol found`);
        // Mark as attempted so we don't retry every time
        await prisma.company.update({ where: { id: co.id }, data: { financialsAt: new Date() } });
        return { ok: false, noSymbol: true };
      }
      console.log(`${label} → resolved: ${symbol}`);
    }

    // 2. Fetch all data in parallel
    const [chart, ts, qs] = await Promise.all([
      fetchChartMeta(symbol),
      fetchTimeseries(symbol),
      fetchQuoteSummary(symbol),
    ]);

    if (!chart?.currentPrice && !ts?.marketCap && !qs?.marketCap) {
      console.log(`${label} → ${symbol} — no data (delisted?)`);
      await prisma.company.update({ where: { id: co.id }, data: { yahooSymbol: symbol, financialsAt: new Date() } });
      return { ok: false, noData: true };
    }

    const merged = { ...ts, ...chart, ...qs };
    await storeFinancials(co.id, symbol, merged);

    const mcap = merged.marketCap ? `${(merged.marketCap / 1e9).toFixed(2)}Md€` : "n/a";
    const price = merged.currentPrice ? `${merged.currentPrice.toFixed(2)}€` : "n/a";
    console.log(`${label} → ${symbol} ✓  price=${price} mcap=${mcap} reco=${merged.analystReco ?? "—"}`);
    return { ok: true };
  } catch (err) {
    console.error(`${label} → ERROR: ${err.message}`);
    return { ok: false, error: true };
  }
}

async function main() {
  const cutoff = new Date(Date.now() - 7 * 86400_000);

  let whereClause = {};
  if (RESET) {
    whereClause = {}; // process all
    console.log("Mode: RESET — processing all companies");
  } else if (STALE) {
    whereClause = {
      OR: [
        { yahooSymbol: null },
        { financialsAt: null },
        { financialsAt: { lt: cutoff } },
      ],
    };
    console.log("Mode: STALE — processing missing + outdated");
  } else {
    whereClause = { yahooSymbol: null };
    console.log("Mode: DEFAULT — processing only companies without Yahoo symbol");
  }

  const companies = await prisma.company.findMany({
    where: whereClause,
    orderBy: { financialsAt: "asc" },
    select: { id: true, name: true, isin: true, yahooSymbol: true },
  });

  console.log(`\n📊 Companies to process: ${companies.length}\n${"─".repeat(60)}`);

  const stats = { ok: 0, noSymbol: 0, noData: 0, error: 0 };
  const startTime = Date.now();

  for (let i = 0; i < companies.length; i += BATCH) {
    const batch = companies.slice(i, Math.min(i + BATCH, companies.length));
    const results = await Promise.all(
      batch.map((co, j) => processCompany(co, i + j + 1, companies.length))
    );
    for (const r of results) {
      if (r.ok)           stats.ok++;
      else if (r.noSymbol) stats.noSymbol++;
      else if (r.noData)   stats.noData++;
      else                 stats.error++;
    }

    // Progress report every 50 companies
    if ((i + BATCH) % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const pct = ((i + BATCH) / companies.length * 100).toFixed(0);
      console.log(`\n⏱  ${elapsed}s — ${pct}% — ✓${stats.ok} ✗noSym:${stats.noSymbol} ✗noData:${stats.noData} err:${stats.error}\n`);
    }

    if (i + BATCH < companies.length) await sleep(DELAY);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ Done in ${elapsed}s`);
  console.log(`   Enriched with data:    ${stats.ok}`);
  console.log(`   No symbol found:       ${stats.noSymbol}`);
  console.log(`   Symbol found, no data: ${stats.noData}`);
  console.log(`   Errors:                ${stats.error}`);

  // Final coverage check
  const [total, withPrice, withMcap] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { currentPrice: { not: null } } }),
    prisma.company.count({ where: { marketCap: { not: null } } }),
  ]);
  console.log(`\n📈 Final coverage: ${withPrice}/${total} with price (${(withPrice/total*100).toFixed(0)}%),  ${withMcap}/${total} with mcap (${(withMcap/total*100).toFixed(0)}%)`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
