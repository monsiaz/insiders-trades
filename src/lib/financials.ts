/**
 * Yahoo Finance financial data fetcher.
 *
 * Two-layer approach:
 *  1. fundamentals-timeseries (no crumb) → income statement, balance sheet
 *  2. quoteSummary via yahoo-finance2 (crumb managed by lib) → valuation, analyst consensus
 *
 * Results are persisted to Company row and returned as a unified object.
 */

import { prisma } from "./prisma";

// ── Types ─────────────────────────────────────────────────────────────────

export interface CompanyFinancials {
  // Identity
  symbol: string;
  currentPrice?: number;
  currency?: string;
  // Taille / bilan
  marketCap?: number;
  sharesOut?: number;
  revenue?: number;
  grossProfit?: number;
  ebitda?: number;
  netIncome?: number;
  totalDebt?: number;
  freeCashFlow?: number;
  dilutedEps?: number;
  fiscalYearEnd?: string;
  // Marges / rentabilité
  profitMargin?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  // Valorisation
  trailingPE?: number;
  forwardPE?: number;
  priceToBook?: number;
  beta?: number;
  debtToEquity?: number;
  // Actionnariat
  heldByInsiders?: number;
  heldByInstitutions?: number;
  shortRatio?: number;
  // Analysts
  analystReco?: string;
  analystScore?: number;
  targetMean?: number;
  targetHigh?: number;
  targetLow?: number;
  numAnalysts?: number;
  // Technicals
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  // Meta
  fetchedAt: string;
  source: string[];
}

// ── Layer 1: Yahoo timeseries (no crumb, always works) ────────────────────

const TIMESERIES_TYPES = [
  "annualMarketCap",
  "annualTotalRevenue",
  "annualGrossProfit",
  "annualEbitda",
  "annualNetIncome",
  "annualTotalDebt",
  "annualFreeCashFlow",
  "annualDilutedEps",
  "annualSharesOutstanding",
  "annualTotalDebtToEquity",
  "annualReturnOnEquity",
  "annualReturnOnAssets",
  "annualNetIncomeCommonStockholders",
].join(",");

async function fetchTimeseries(
  symbol: string
): Promise<Partial<CompanyFinancials> & { source: string[] }> {
  const p1 = Math.floor(Date.now() / 1000) - 5 * 365 * 86400;
  const p2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${TIMESERIES_TYPES}&period1=${p1}&period2=${p2}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return { source: [] };
    const data = await res.json();
    const results: Array<{ meta: { type: string[] }; [k: string]: unknown }> =
      data?.timeseries?.result ?? [];

    const out: Partial<CompanyFinancials> = {};
    let latestDate: string | undefined;

    for (const r of results) {
      const type = r.meta?.type?.[0];
      if (!type) continue;
      const vals = r[type] as Array<{
        reportedValue?: { raw?: number };
        asOfDate?: string;
      }> | undefined;
      if (!vals?.length) continue;
      const latest = vals[vals.length - 1];
      const raw = latest?.reportedValue?.raw;
      if (raw == null) continue;
      if (!latestDate && latest.asOfDate) latestDate = latest.asOfDate;

      if (type === "annualMarketCap") out.marketCap = raw;
      else if (type === "annualTotalRevenue") out.revenue = raw;
      else if (type === "annualGrossProfit") out.grossProfit = raw;
      else if (type === "annualEbitda") out.ebitda = raw;
      else if (type === "annualNetIncome" || type === "annualNetIncomeCommonStockholders")
        out.netIncome ??= raw;
      else if (type === "annualTotalDebt") out.totalDebt = raw;
      else if (type === "annualFreeCashFlow") out.freeCashFlow = raw;
      else if (type === "annualDilutedEps") out.dilutedEps = raw;
      else if (type === "annualSharesOutstanding") out.sharesOut = raw;
      else if (type === "annualTotalDebtToEquity") out.debtToEquity = raw;
      else if (type === "annualReturnOnEquity") out.returnOnEquity = raw;
      else if (type === "annualReturnOnAssets") out.returnOnAssets = raw;
    }
    out.fiscalYearEnd = latestDate;
    return { ...out, source: ["timeseries"] };
  } catch {
    return { source: [] };
  }
}

// ── Layer 2: v8 chart meta (price, 52w, no crumb) ─────────────────────────

async function fetchChartMeta(
  symbol: string
): Promise<Partial<CompanyFinancials> & { source: string[] }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { source: [] };
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return { source: [] };
    return {
      currentPrice: meta.regularMarketPrice,
      currency: meta.currency,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      source: ["chart"],
    };
  } catch {
    return { source: [] };
  }
}

// ── Layer 3: quoteSummary via yahoo-finance2 (crumb auto, best-effort) ────

async function fetchQuoteSummary(
  symbol: string
): Promise<Partial<CompanyFinancials> & { source: string[] }> {
  try {
    // Dynamic require so the module is only loaded when needed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const yf = require("yahoo-finance2") as {
      default?: {
        quoteSummary: (s: string, opts: object, cfg?: object) => Promise<Record<string, unknown>>;
      };
      quoteSummary?: (s: string, opts: object, cfg?: object) => Promise<Record<string, unknown>>;
    };
    const lib = (yf.default ?? yf) as {
      quoteSummary: (s: string, opts: object, cfg?: object) => Promise<Record<string, unknown>>;
    };
    if (!lib.quoteSummary) return { source: [] };

    const result = await lib.quoteSummary(
      symbol,
      { modules: ["financialData", "defaultKeyStatistics", "summaryDetail"] },
      { validateResult: false }
    );

    const fd = result.financialData as Record<string, number | string | null> | undefined;
    const ks = result.defaultKeyStatistics as Record<string, number | null> | undefined;
    const sd = result.summaryDetail as Record<string, number | null> | undefined;

    const out: Partial<CompanyFinancials> = {};
    if (fd) {
      if (fd.profitMargins != null) out.profitMargin = fd.profitMargins as number;
      if (fd.debtToEquity != null) out.debtToEquity = fd.debtToEquity as number;
      if (fd.returnOnEquity != null) out.returnOnEquity = fd.returnOnEquity as number;
      if (fd.returnOnAssets != null) out.returnOnAssets = fd.returnOnAssets as number;
      if (fd.recommendationKey) out.analystReco = fd.recommendationKey as string;
      if (fd.recommendationMean != null) out.analystScore = fd.recommendationMean as number;
      if (fd.targetMeanPrice != null) out.targetMean = fd.targetMeanPrice as number;
      if (fd.targetHighPrice != null) out.targetHigh = fd.targetHighPrice as number;
      if (fd.targetLowPrice != null) out.targetLow = fd.targetLowPrice as number;
      if (fd.numberOfAnalystOpinions != null) out.numAnalysts = fd.numberOfAnalystOpinions as number;
    }
    if (ks) {
      if (ks.forwardPE != null) out.forwardPE = ks.forwardPE as number;
      if (ks.trailingEps != null) out.dilutedEps ??= ks.trailingEps as number;
      if (ks.priceToBook != null) out.priceToBook = ks.priceToBook as number;
      if (ks.beta != null) out.beta = ks.beta as number;
      if (ks.heldPercentInsiders != null) out.heldByInsiders = ks.heldPercentInsiders as number;
      if (ks.heldPercentInstitutions != null) out.heldByInstitutions = ks.heldPercentInstitutions as number;
      if (ks.shortRatio != null) out.shortRatio = ks.shortRatio as number;
      if (ks.sharesOutstanding != null) out.sharesOut ??= ks.sharesOutstanding as number;
    }
    if (sd) {
      if (sd.trailingPE != null) out.trailingPE = sd.trailingPE as number;
      if (sd.marketCap != null) out.marketCap ??= sd.marketCap as number;
      if (sd.fiftyTwoWeekHigh != null) out.fiftyTwoWeekHigh ??= sd.fiftyTwoWeekHigh as number;
      if (sd.fiftyTwoWeekLow != null) out.fiftyTwoWeekLow ??= sd.fiftyTwoWeekLow as number;
      if (sd.fiftyDayAverage != null) out.fiftyDayAverage = sd.fiftyDayAverage as number;
      if (sd.twoHundredDayAverage != null) out.twoHundredDayAverage = sd.twoHundredDayAverage as number;
    }
    return { ...out, source: ["quoteSummary"] };
  } catch {
    return { source: [] };
  }
}

// ── Symbol resolver (reused from signals.ts logic) ────────────────────────

async function resolveSymbol(isin: string | null, name: string | null): Promise<string | null> {
  const suffix =
    isin?.startsWith("FR") || isin?.startsWith("LU") ? ".PA" :
    isin?.startsWith("NL") ? ".AS" :
    isin?.startsWith("DE") ? ".DE" :
    isin?.startsWith("GB") ? ".L" :
    isin?.startsWith("IT") ? ".MI" :
    isin?.startsWith("ES") ? ".MC" : ".PA";

  const queries = [isin, name, name?.split(" ").slice(0, 2).join(" ")].filter(Boolean) as string[];
  for (const q of queries) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&lang=fr&region=FR`;
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
      if (match?.symbol) return match.symbol;
    } catch { /* continue */ }
  }
  return null;
}

// ── Compute derived metrics ───────────────────────────────────────────────

function deriveMetrics(fin: Partial<CompanyFinancials>): Partial<CompanyFinancials> {
  // Trailing PE from price + EPS if not provided by quoteSummary
  if (!fin.trailingPE && fin.currentPrice && fin.dilutedEps && fin.dilutedEps > 0) {
    fin.trailingPE = fin.currentPrice / fin.dilutedEps;
  }
  // Net margin from income + revenue
  if (!fin.profitMargin && fin.netIncome && fin.revenue && fin.revenue > 0) {
    fin.profitMargin = fin.netIncome / fin.revenue;
  }
  return fin;
}

// ── Main public function ──────────────────────────────────────────────────

/**
 * Fetch and merge all available financial data for a company.
 * Persists to DB if companyId is provided.
 */
export async function fetchAndStoreFinancials(
  symbol: string,
  companyId?: string
): Promise<CompanyFinancials> {
  const [ts, chart, qs] = await Promise.all([
    fetchTimeseries(symbol),
    fetchChartMeta(symbol),
    fetchQuoteSummary(symbol),
  ]);

  // Merge: timeseries < chart < quoteSummary (later wins for overlapping fields)
  const merged: Partial<CompanyFinancials> = {
    ...ts,
    ...chart,
    ...qs,
    source: [...new Set([...ts.source, ...chart.source, ...qs.source])],
  };

  deriveMetrics(merged);

  const fin: CompanyFinancials = {
    ...merged,
    symbol,
    fetchedAt: new Date().toISOString(),
    source: merged.source ?? [],
  };

  // Persist to DB
  if (companyId) {
    await prisma.company.update({
      where: { id: companyId },
      data: {
        yahooSymbol: symbol,
        currentPrice: fin.currentPrice,
        marketCap: fin.marketCap ? BigInt(Math.round(fin.marketCap)) : undefined,
        sharesOut: fin.sharesOut ? BigInt(Math.round(fin.sharesOut)) : undefined,
        revenue: fin.revenue ? BigInt(Math.round(fin.revenue)) : undefined,
        grossProfit: fin.grossProfit ? BigInt(Math.round(fin.grossProfit)) : undefined,
        netIncome: fin.netIncome ? BigInt(Math.round(fin.netIncome)) : undefined,
        ebitda: fin.ebitda ? BigInt(Math.round(fin.ebitda)) : undefined,
        totalDebt: fin.totalDebt ? BigInt(Math.round(fin.totalDebt)) : undefined,
        freeCashFlow: fin.freeCashFlow ? BigInt(Math.round(fin.freeCashFlow)) : undefined,
        dilutedEps: fin.dilutedEps,
        fiscalYearEnd: fin.fiscalYearEnd,
        financialsAt: new Date(),
        marketCapAt: new Date(),
        trailingPE: fin.trailingPE,
        forwardPE: fin.forwardPE,
        priceToBook: fin.priceToBook,
        beta: fin.beta,
        debtToEquity: fin.debtToEquity,
        returnOnEquity: fin.returnOnEquity,
        returnOnAssets: fin.returnOnAssets,
        profitMargin: fin.profitMargin,
        heldByInsiders: fin.heldByInsiders,
        heldByInstitutions: fin.heldByInstitutions,
        shortRatio: fin.shortRatio,
        analystReco: fin.analystReco,
        analystScore: fin.analystScore,
        targetMean: fin.targetMean,
        targetHigh: fin.targetHigh,
        targetLow: fin.targetLow,
        numAnalysts: fin.numAnalysts,
        analystAt: new Date(),
      },
    }).catch(() => { /* non-fatal */ });
  }

  return fin;
}

/**
 * Resolve and cache Yahoo symbol for a company (used by API route).
 */
export async function resolveAndCache(
  isin: string | null,
  name: string | null,
  companyId: string
): Promise<string | null> {
  const symbol = await resolveSymbol(isin, name);
  if (symbol) {
    await prisma.company.update({ where: { id: companyId }, data: { yahooSymbol: symbol } }).catch(() => {});
  }
  return symbol;
}

/**
 * Batch enrich companies missing financial data.
 * Called by cron and /api/enrich-mcap.
 */
export async function enrichCompanyFinancials(limit = 60) {
  const cutoff = new Date(Date.now() - 7 * 86400_000);
  const companies = await prisma.company.findMany({
    where: {
      OR: [{ financialsAt: null }, { financialsAt: { lt: cutoff } }],
      isin: { not: null },
    },
    take: limit,
    orderBy: { financialsAt: "asc" },
    select: { id: true, name: true, isin: true, yahooSymbol: true },
  });

  console.log(`[fin] enriching ${companies.length} companies`);
  let ok = 0;

  for (const co of companies) {
    try {
      const symbol = co.yahooSymbol ?? (await resolveSymbol(co.isin, co.name));
      if (!symbol) {
        await prisma.company.update({ where: { id: co.id }, data: { financialsAt: new Date() } });
        continue;
      }
      const fin = await fetchAndStoreFinancials(symbol, co.id);
      if (fin.marketCap) ok++;
      console.log(
        `[fin] ${co.name} → ${symbol} mcap=${fin.marketCap ? (fin.marketCap / 1e9).toFixed(2) + "B" : "n/a"} reco=${fin.analystReco ?? "n/a"}`
      );
    } catch (err) {
      console.error(`[fin] ${co.name}:`, err);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`[fin] done. ${ok}/${companies.length} with market cap.`);
}
