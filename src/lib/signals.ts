/**
 * Signal scoring engine.
 * Computes analytics fields for declarations:
 *  - pctOfMarketCap:   totalAmount / company.marketCap * 100
 *  - pctOfInsiderFlow: totalAmount / SUM(all trades by same insider on same company) * 100
 *  - insiderCumNet:    cumulative buy-sell by this insider on this company up to this trade
 *  - isCluster:        ≥2 distinct insiders traded the same company within 30 days
 *  - signalScore:      composite 0-100 score
 *
 * ──────────── Budget ─────────────  total ≤ 100 pts
 *  28 pts  — % of market cap          (size of trade relative to company)
 *  16 pts  — % of insider own flow    (is this their biggest trade?)
 *  12 pts  — insider function         (CEO > Director > Admin)
 *   8 pts  — cluster strength         (multiple insiders within 30d)
 *   4 pts  — directional conviction   (net buyer on this stock)
 *  12 pts  — fundamentals             (analyst consensus + P/E + leverage)
 *  20 pts  — composite signals        (momentum + value + quality + …)
 */

import { prisma } from "./prisma";
import { roleFunctionScore } from "./role-utils";

// ────────────────────────────────────────────────────────────────────────────
// Core scoring helpers
// ────────────────────────────────────────────────────────────────────────────

function functionScore(fn: string | null): number {
  // roleFunctionScore returns 0–15; rescale to 0–12
  return Math.round((roleFunctionScore(fn) / 15) * 12);
}

function pctMcapScore(pct: number): number {
  // 0.001% → 1pt, 0.01% → 6pt, 0.1% → 16pt, 0.5% → 24pt, 1%+ → 28pt
  if (pct <= 0) return 0;
  const s = Math.min(28, Math.log10(pct + 0.001) * 9.5 + 22);
  return Math.max(0, Math.round(s));
}

function pctFlowScore(pct: number): number {
  if (pct <= 0) return 0;
  const s = Math.min(16, (pct / 100) * 19);
  return Math.max(0, Math.round(s));
}

/** Analyst + valuation + leverage fundamentals (0–12 pts, can go -4) */
function fundamentalsScore(
  analystScore: number | null,   // 1=strong buy → 5=strong sell
  trailingPE: number | null,
  debtToEquity: number | null,
): number {
  let pts = 0;
  if (analystScore != null) {
    // 1.0 → 6, 1.5 → 5, 2.0 → 4, 2.5 → 2, 3.0 → 0, >3 → negative
    pts += Math.max(-4, Math.round((3.5 - analystScore) * 2.2));
  }
  if (trailingPE != null && trailingPE > 0 && trailingPE < 100) {
    if (trailingPE < 10) pts += 3;
    else if (trailingPE < 15) pts += 2;
    else if (trailingPE < 20) pts += 1;
  }
  if (debtToEquity != null) {
    if (debtToEquity < 30) pts += 3;
    else if (debtToEquity < 80) pts += 2;
    else if (debtToEquity < 150) pts += 1;
  }
  return Math.min(12, Math.max(-4, pts));
}

/** Cluster strength bonus (0–8 pts): ≥4 → 8, 3 → 6, 2 → 4 */
function clusterStrengthScore(nearbyInsiderCount: number): number {
  if (nearbyInsiderCount >= 4) return 8;
  if (nearbyInsiderCount >= 3) return 6;
  if (nearbyInsiderCount >= 2) return 4;
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Composite signals (extended — 20 pts budget)
// Each emits a boolean flag + a small point value, and the UI shows the flag.
// ────────────────────────────────────────────────────────────────────────────

export interface CompositeInputs {
  currentPrice:   number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow:  number | null;
  twoHundredDayAverage: number | null;
  fiftyDayAverage:     number | null;
  targetMean:    number | null;
  targetHigh:    number | null;
  targetLow:     number | null;
  numAnalysts:   number | null;
  analystScore:  number | null;  // 1=strong buy
  trailingPE:    number | null;
  forwardPE:     number | null;
  priceToBook:   number | null;
  profitMargin:  number | null;  // decimal (0.12 = 12%)
  returnOnEquity: number | null; // decimal
  returnOnAssets: number | null; // decimal
  debtToEquity:  number | null;
  freeCashFlow:  bigint | number | null;
  heldByInstitutions: number | null; // decimal
  heldByInsiders:     number | null; // decimal
  shortRatio:    number | null;
}

export interface CompositeResult {
  points: number;    // 0–20
  flags: string[];   // machine-readable flag names
}

/** Compute the 20-pt composite bonus from Yahoo data. */
export function computeComposite(i: CompositeInputs): CompositeResult {
  const flags: string[] = [];
  let pts = 0;

  // ── 1. Momentum (position in 52w range) — up to 3 pts + flag
  //    NB: "contrarian near 52w low" flag when insider buys a falling stock
  if (i.currentPrice && i.fiftyTwoWeekHigh && i.fiftyTwoWeekLow
      && i.fiftyTwoWeekHigh > i.fiftyTwoWeekLow) {
    const range = i.fiftyTwoWeekHigh - i.fiftyTwoWeekLow;
    const pos = (i.currentPrice - i.fiftyTwoWeekLow) / range; // 0 (low) → 1 (high)
    if (pos <= 0.2) { pts += 3; flags.push("near-52w-low"); }        // contrarian buy
    else if (pos >= 0.85) { pts += 1; flags.push("near-52w-high"); } // momentum but weak signal on its own
  }

  // ── 2. Price vs 200-day MA (long-term trend) — up to 2 pts + flag
  if (i.currentPrice && i.twoHundredDayAverage && i.twoHundredDayAverage > 0) {
    const r = i.currentPrice / i.twoHundredDayAverage;
    if (r >= 1.05) { pts += 2; flags.push("above-ma200"); }
    else if (r <= 0.85) { pts += 1; flags.push("oversold"); } // price 15%+ below MA200 + insider buy = strong
  }

  // ── 3. Analyst upside to target price — up to 3 pts + flag
  if (i.currentPrice && i.targetMean && i.numAnalysts && i.numAnalysts >= 3) {
    const upside = (i.targetMean - i.currentPrice) / i.currentPrice;
    if (upside >= 0.25) { pts += 3; flags.push("upside-25pct"); }
    else if (upside >= 0.15) { pts += 2; flags.push("upside-15pct"); }
    else if (upside >= 0.05) { pts += 1; }
  }

  // ── 4. Analyst consensus Strong Buy — up to 2 pts + flag
  if (i.analystScore != null && i.numAnalysts && i.numAnalysts >= 3) {
    if (i.analystScore <= 1.75) { pts += 2; flags.push("analyst-strong-buy"); }
    else if (i.analystScore <= 2.25) { pts += 1; flags.push("analyst-buy"); }
  }

  // ── 5. Value combo (low P/E + low P/B + positive FCF) — up to 2 pts + flag
  const fcf = typeof i.freeCashFlow === "bigint" ? Number(i.freeCashFlow) : i.freeCashFlow;
  const lowPE = i.trailingPE != null && i.trailingPE > 0 && i.trailingPE < 15;
  const lowPB = i.priceToBook != null && i.priceToBook > 0 && i.priceToBook < 2;
  const posFCF = fcf != null && fcf > 0;
  if (lowPE && lowPB && posFCF) { pts += 2; flags.push("value-combo"); }
  else if (lowPE && posFCF) { pts += 1; flags.push("value"); }

  // ── 6. Quality combo (high ROE + high margin + low debt) — up to 3 pts + flag
  const hiROE = i.returnOnEquity != null && i.returnOnEquity >= 0.15;      // ≥15%
  const hiMargin = i.profitMargin != null && i.profitMargin >= 0.10;       // ≥10%
  const loDebt = i.debtToEquity != null && i.debtToEquity < 80;
  if (hiROE && hiMargin && loDebt) { pts += 3; flags.push("quality-combo"); }
  else if (hiROE && hiMargin) { pts += 2; flags.push("quality"); }
  else if (hiROE) { pts += 1; }

  // ── 7. Smart money (institutional ownership) — up to 1 pt + flag
  if (i.heldByInstitutions != null && i.heldByInstitutions >= 0.5) {
    pts += 1;
    flags.push("institutional-majority");
  }

  // ── 8. Insider alignment (insiders already hold material stake) — up to 2 pts + flag
  //    Ownership is a strong signal that the insider has skin in the game
  if (i.heldByInsiders != null && i.heldByInsiders >= 0.2) {
    pts += 2;
    flags.push("insider-owned-high");
  } else if (i.heldByInsiders != null && i.heldByInsiders >= 0.05) {
    pts += 1;
    flags.push("insider-owned");
  }

  // ── 9. Short-squeeze setup — up to 2 pts + flag
  if (i.shortRatio != null && i.shortRatio >= 5) {
    pts += 2;
    flags.push("short-squeeze");
  } else if (i.shortRatio != null && i.shortRatio >= 3) {
    pts += 1;
  }

  return { points: Math.min(20, pts), flags };
}

function computeScore(
  pctOfMarketCap: number | null,
  pctOfInsiderFlow: number | null,
  insiderFunction: string | null,
  isCluster: boolean,
  insiderCumNet: number | null,
  analystScore?: number | null,
  trailingPE?: number | null,
  debtToEquity?: number | null,
  nearbyInsiderCount?: number,
  compositePoints?: number,
): number {
  let score = 0;
  score += pctMcapScore(pctOfMarketCap ?? 0);
  score += pctFlowScore(pctOfInsiderFlow ?? 0);
  score += functionScore(insiderFunction);
  score += clusterStrengthScore(nearbyInsiderCount ?? (isCluster ? 2 : 0));
  if ((insiderCumNet ?? 0) > 0) score += 4;
  score += fundamentalsScore(analystScore ?? null, trailingPE ?? null, debtToEquity ?? null);
  score += compositePoints ?? 0;
  return Math.min(100, Math.max(0, score));
}

// ────────────────────────────────────────────────────────────────────────────
// Cluster detection helpers
// ────────────────────────────────────────────────────────────────────────────
const CLUSTER_WINDOW_DAYS = 30;

function withinDays(a: Date, b: Date, days: number) {
  return Math.abs(a.getTime() - b.getTime()) <= days * 86400_000;
}

// ────────────────────────────────────────────────────────────────────────────
// Main: score all unscored declarations (or re-score all if force=true)
// ────────────────────────────────────────────────────────────────────────────
export async function scoreDeclarations(force = false, batchSize = 200) {
  const where = force
    ? { totalAmount: { not: null }, pdfParsed: true }
    : { totalAmount: { not: null }, pdfParsed: true, scoredAt: null };

  const total = await prisma.declaration.count({ where });
  console.log(`[signals] scoring ${total} declarations…`);

  let processed = 0;
  let cursor: string | undefined;

  while (processed < total) {
    const decls = await prisma.declaration.findMany({
      where,
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        companyId: true,
        insiderName: true,
        insiderFunction: true,
        transactionNature: true,
        totalAmount: true,
        transactionDate: true,
        pubDate: true,
        company: {
          select: {
            marketCap: true,
            currentPrice: true,
            fiftyTwoWeekHigh: true, fiftyTwoWeekLow: true,
            fiftyDayAverage: true, twoHundredDayAverage: true,
            targetMean: true, targetHigh: true, targetLow: true, numAnalysts: true,
            analystScore: true,
            trailingPE: true, forwardPE: true, priceToBook: true,
            profitMargin: true, returnOnEquity: true, returnOnAssets: true,
            debtToEquity: true, freeCashFlow: true,
            heldByInstitutions: true, heldByInsiders: true, shortRatio: true,
          },
        },
      },
    });

    if (decls.length === 0) break;
    cursor = decls[decls.length - 1].id;

    // For each company in this batch, pre-load all trades (for flow/cluster calcs)
    const companyIds = [...new Set(decls.map((d) => d.companyId))];

    // All trades for these companies with amount
    const allTrades = await prisma.declaration.findMany({
      where: {
        companyId: { in: companyIds },
        totalAmount: { not: null },
        pdfParsed: true,
      },
      select: {
        id: true,
        companyId: true,
        insiderName: true,
        transactionNature: true,
        totalAmount: true,
        transactionDate: true,
        pubDate: true,
      },
      orderBy: { transactionDate: "asc" },
    });

    // Group by (companyId, insiderName) for flow calcs
    type TradeRow = (typeof allTrades)[number];
    const byInsiderCompany = new Map<string, TradeRow[]>();
    const byCompany = new Map<string, TradeRow[]>();

    for (const t of allTrades) {
      const cKey = `${t.companyId}::${t.insiderName ?? "__unknown"}`;
      if (!byInsiderCompany.has(cKey)) byInsiderCompany.set(cKey, []);
      byInsiderCompany.get(cKey)!.push(t);

      if (!byCompany.has(t.companyId)) byCompany.set(t.companyId, []);
      byCompany.get(t.companyId)!.push(t);
    }

    const updates: Promise<unknown>[] = [];

    for (const decl of decls) {
      const amount = decl.totalAmount ?? 0;
      const mcap = decl.company.marketCap ? Number(decl.company.marketCap) : null;

      // pctOfMarketCap
      const pctOfMarketCap = mcap && mcap > 0 ? (amount / mcap) * 100 : null;

      // pctOfInsiderFlow
      const insiderKey = `${decl.companyId}::${decl.insiderName ?? "__unknown"}`;
      const insiderTrades = byInsiderCompany.get(insiderKey) ?? [];
      const totalInsiderFlow = insiderTrades.reduce((s, t) => s + (t.totalAmount ?? 0), 0);
      const pctOfInsiderFlow = totalInsiderFlow > 0 ? (amount / totalInsiderFlow) * 100 : null;

      // insiderCumNet (running buy - sell up to this trade's date)
      const refDate = decl.transactionDate ?? decl.pubDate;
      const isBuy = (decl.transactionNature ?? "").toLowerCase().includes("acqui");
      const sorted = [...insiderTrades].sort((a, b) => {
        const da = a.transactionDate ?? a.pubDate;
        const db = b.transactionDate ?? b.pubDate;
        return da.getTime() - db.getTime();
      });
      let cumNet = 0;
      for (const t of sorted) {
        const tDate = t.transactionDate ?? t.pubDate;
        if (tDate > refDate) break;
        const buy = (t.transactionNature ?? "").toLowerCase().includes("acqui");
        cumNet += buy ? (t.totalAmount ?? 0) : -(t.totalAmount ?? 0);
      }

      // isCluster: ≥2 distinct insiders traded this company within CLUSTER_WINDOW_DAYS
      const companyTrades = byCompany.get(decl.companyId) ?? [];
      const nearbyInsiders = new Set<string>();
      for (const t of companyTrades) {
        if (!t.insiderName) continue;
        const tDate = t.transactionDate ?? t.pubDate;
        if (withinDays(tDate, refDate, CLUSTER_WINDOW_DAYS)) {
          nearbyInsiders.add(t.insiderName);
        }
      }
      const nearbyInsiderCount = nearbyInsiders.size;
      const isCluster = nearbyInsiderCount >= 2;

      // ── Composite signals (momentum + value + quality + …) ────────────
      const composite = computeComposite({
        currentPrice: decl.company.currentPrice,
        fiftyTwoWeekHigh: decl.company.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: decl.company.fiftyTwoWeekLow,
        twoHundredDayAverage: decl.company.twoHundredDayAverage,
        fiftyDayAverage: decl.company.fiftyDayAverage,
        targetMean: decl.company.targetMean,
        targetHigh: decl.company.targetHigh,
        targetLow: decl.company.targetLow,
        numAnalysts: decl.company.numAnalysts,
        analystScore: decl.company.analystScore,
        trailingPE: decl.company.trailingPE,
        forwardPE: decl.company.forwardPE,
        priceToBook: decl.company.priceToBook,
        profitMargin: decl.company.profitMargin,
        returnOnEquity: decl.company.returnOnEquity,
        returnOnAssets: decl.company.returnOnAssets,
        debtToEquity: decl.company.debtToEquity,
        freeCashFlow: decl.company.freeCashFlow,
        heldByInstitutions: decl.company.heldByInstitutions,
        heldByInsiders: decl.company.heldByInsiders,
        shortRatio: decl.company.shortRatio,
      });

      const signalScore = computeScore(
        pctOfMarketCap,
        pctOfInsiderFlow,
        decl.insiderFunction,
        isCluster,
        cumNet,
        decl.company.analystScore,
        decl.company.trailingPE,
        decl.company.debtToEquity,
        nearbyInsiderCount,
        composite.points,
      );

      updates.push(
        prisma.declaration.update({
          where: { id: decl.id },
          data: {
            pctOfMarketCap,
            pctOfInsiderFlow,
            insiderCumNet: cumNet,
            isCluster,
            signalScore,
            scoredAt: new Date(),
          },
        })
      );
    }

    // Flush in parallel (Prisma handles connection pooling)
    await Promise.all(updates);

    processed += decls.length;
    console.log(`[signals] ${processed}/${total} scored`);
  }

  console.log("[signals] done.");
}

// ────────────────────────────────────────────────────────────────────────────
// Market cap enrichment (legacy — now use enrichCompanyFinancials from financials.ts)
// ────────────────────────────────────────────────────────────────────────────
export async function enrichMarketCaps(limit = 50) {
  const cutoff = new Date(Date.now() - 7 * 86400_000);
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { financialsAt: null },
        { financialsAt: { lt: cutoff } },
      ],
      isin: { not: null },
    },
    take: limit,
    orderBy: { financialsAt: "asc" },
    select: { id: true, name: true, isin: true, yahooSymbol: true },
  });

  console.log(`[mcap] enriching ${companies.length} companies`);

  for (const co of companies) {
    try {
      const symbol = co.yahooSymbol ?? (await resolveSymbol(co.isin, co.name));
      if (!symbol) {
        await prisma.company.update({ where: { id: co.id }, data: { financialsAt: new Date() } });
        continue;
      }

      const fin = await fetchYahooTimeseries(symbol);

      await prisma.company.update({
        where: { id: co.id },
        data: {
          yahooSymbol: symbol,
          marketCap: fin?.marketCap ? BigInt(Math.round(fin.marketCap)) : undefined,
          sharesOut: fin?.sharesOut ? BigInt(Math.round(fin.sharesOut)) : undefined,
          revenue: fin?.revenue ? BigInt(Math.round(fin.revenue)) : undefined,
          netIncome: fin?.netIncome ? BigInt(Math.round(fin.netIncome)) : undefined,
          ebitda: fin?.ebitda ? BigInt(Math.round(fin.ebitda)) : undefined,
          totalDebt: fin?.totalDebt ? BigInt(Math.round(fin.totalDebt)) : undefined,
          freeCashFlow: fin?.freeCashFlow ? BigInt(Math.round(fin.freeCashFlow)) : undefined,
          fiscalYearEnd: fin?.asOfDate ?? undefined,
          financialsAt: new Date(),
          marketCapAt: new Date(),
        },
      });
      console.log(`[mcap] ${co.name} → ${symbol} mcap=${fin?.marketCap?.toLocaleString() ?? "n/a"}`);
    } catch (err) {
      console.error(`[mcap] error for ${co.name}:`, err);
    }

    await new Promise((r) => setTimeout(r, 200));
  }
}

async function resolveSymbol(isin: string | null, name: string | null): Promise<string | null> {
  const queries = [isin, name, name?.split(" ")[0]].filter(Boolean) as string[];
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
      const suffix = isin ? preferredSuffixFromIsin(isin) : ".PA";
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

function preferredSuffixFromIsin(isin: string): string {
  if (isin.startsWith("FR") || isin.startsWith("LU")) return ".PA";
  if (isin.startsWith("NL")) return ".AS";
  if (isin.startsWith("DE")) return ".DE";
  if (isin.startsWith("GB")) return ".L";
  if (isin.startsWith("IT")) return ".MI";
  if (isin.startsWith("ES")) return ".MC";
  if (isin.startsWith("BE")) return ".BR";
  return ".PA";
}

interface YahooFinancials {
  marketCap?: number;
  sharesOut?: number;
  revenue?: number;
  netIncome?: number;
  ebitda?: number;
  totalDebt?: number;
  freeCashFlow?: number;
  asOfDate?: string;
}

// Yahoo Finance fundamentals-timeseries — no crumb required, works in serverless
async function fetchYahooTimeseries(symbol: string): Promise<YahooFinancials | null> {
  const types = [
    "annualMarketCap",
    "annualTotalRevenue",
    "annualNetIncome",
    "annualEbitda",
    "annualTotalDebt",
    "annualFreeCashFlow",
    "annualSharesOutstanding",
  ].join(",");
  const p1 = Math.floor(Date.now() / 1000) - 4 * 365 * 86400;
  const p2 = Math.floor(Date.now() / 1000) + 86400;

  try {
    const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${types}&period1=${p1}&period2=${p2}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const results: Array<{ meta: { type: string[] }; [key: string]: unknown }> =
      data?.timeseries?.result ?? [];

    const out: YahooFinancials = {};
    let latestDate: string | undefined;

    for (const r of results) {
      const type = r.meta?.type?.[0];
      if (!type) continue;
      const vals = r[type] as Array<{ reportedValue?: { raw?: number }; asOfDate?: string }> | undefined;
      if (!vals?.length) continue;
      const latest = vals[vals.length - 1];
      const raw = latest?.reportedValue?.raw;
      if (raw == null) continue;
      if (!latestDate && latest.asOfDate) latestDate = latest.asOfDate;

      if (type === "annualMarketCap") out.marketCap = raw;
      else if (type === "annualTotalRevenue") out.revenue = raw;
      else if (type === "annualNetIncome") out.netIncome = raw;
      else if (type === "annualEbitda") out.ebitda = raw;
      else if (type === "annualTotalDebt") out.totalDebt = raw;
      else if (type === "annualFreeCashFlow") out.freeCashFlow = raw;
      else if (type === "annualSharesOutstanding") out.sharesOut = raw;
    }
    out.asOfDate = latestDate;
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}
