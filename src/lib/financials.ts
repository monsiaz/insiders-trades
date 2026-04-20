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

// ── Symbol resolver ────────────────────────────────────────────────────────

/** Remove French legal suffixes from company name to improve search accuracy */
function cleanName(name: string): string {
  return name
    .replace(/\bS\.?A\.?S\.?\b|\bS\.?A\.?\b|\bS\.?E\.?\b|\bS\.?C\.?A\.?\b|\bS\.?N\.?C\.?\b/gi, "")
    .replace(/\bGROUPE\b/gi, "")
    .replace(/\bSOCIETE\b|\bSOCIÉTÉ\b/gi, "")
    .replace(/\bFRANCE\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Determine the preferred exchange suffix from ISIN country code */
function preferredSuffix(isin: string | null): string {
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

/** European exchange suffixes — only accept these for European ISINs to avoid false positives */
const EUROPEAN_SUFFIXES = [".PA", ".AS", ".BR", ".DE", ".L", ".MI", ".MC", ".SW", ".LS", ".ST", ".CO", ".OL", ".HE", ".WA", ".PR", ".EPA"];

async function searchYahoo(q: string, suffix: string, strictEuropean = false): Promise<string | null> {
  const UA = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
  ][Math.floor(Math.random() * 3)];
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&lang=fr&region=FR`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const quotes: Array<{ symbol?: string; quoteType?: string; exchange?: string }> = data?.quotes ?? [];
    const equities = quotes.filter((q) => q.quoteType === "EQUITY" && q.symbol);

    if (strictEuropean) {
      // For European ISINs (FR, NL, DE, etc.), only accept European exchange symbols
      return (
        equities.find((q) => q.symbol?.endsWith(suffix))?.symbol ??
        equities.find((q) => EUROPEAN_SUFFIXES.some(s => q.symbol?.endsWith(s)))?.symbol ??
        null
      );
    }
    // Default: prefer suffix match > .PA > other European exchanges
    return (
      equities.find((q) => q.symbol?.endsWith(suffix))?.symbol ??
      equities.find((q) => q.symbol?.endsWith(".PA"))?.symbol ??
      equities.find((q) => EUROPEAN_SUFFIXES.some(s => q.symbol?.endsWith(s)))?.symbol ??
      null
    );
  } catch {
    return null;
  }
}

export async function resolveSymbol(isin: string | null, name: string | null): Promise<string | null> {
  const suffix = preferredSuffix(isin);
  // European ISINs (FR, NL, DE, BE, GB, IT, ES, CH, PT, LU) → strict European-only matching
  const strictEuropean = !!(isin && /^(FR|NL|DE|BE|GB|IT|ES|CH|PT|LU|SE|DK|NO|FI|PL|AT|IE)/.test(isin));

  // Build a set of queries from most to least specific
  const queries: string[] = [];
  if (isin) queries.push(isin);                          // ISIN is most precise
  if (name) {
    queries.push(name);                                  // Full name
    const clean = cleanName(name);
    if (clean && clean !== name) queries.push(clean);   // Cleaned name
    const firstWord = clean.split(" ")[0];
    if (firstWord && firstWord.length > 3) queries.push(firstWord); // First word
    const twoWords = clean.split(" ").slice(0, 2).join(" ");
    if (twoWords !== clean && twoWords !== firstWord) queries.push(twoWords); // First 2 words
  }

  for (const q of queries) {
    const sym = await searchYahoo(q, suffix, strictEuropean);
    if (sym) return sym;
    await new Promise((r) => setTimeout(r, 150)); // gentle rate limiting
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
  // Include companies without ISIN — we'll try to find them by name
  const companies = await prisma.company.findMany({
    where: {
      OR: [{ financialsAt: null }, { financialsAt: { lt: cutoff } }],
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
