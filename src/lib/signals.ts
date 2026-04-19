/**
 * Signal scoring engine.
 * Computes analytics fields for declarations:
 *  - pctOfMarketCap:   totalAmount / company.marketCap * 100
 *  - pctOfInsiderFlow: totalAmount / SUM(all trades by same insider on same company) * 100
 *  - insiderCumNet:    cumulative buy-sell by this insider on this company up to this trade
 *  - isCluster:        ≥2 distinct insiders traded the same company within 5 calendar days
 *  - signalScore:      composite 0-100 score
 */

import { prisma } from "./prisma";

// ────────────────────────────────────────────────────────────────────────────
// Score weights  (total budget: 100 pts)
// ────────────────────────────────────────────────────────────────────────────
//  35 pts — % of market cap        (size of trade relative to company)
//  20 pts — % of insider own flow  (is this their biggest trade?)
//  15 pts — insider function       (CEO > Director > Admin)
//  10 pts — cluster                (multiple insiders same week)
//   5 pts — directional conviction (net buyer on this stock)
//  15 pts — company fundamentals   (analyst consensus + PE + leverage)

function functionScore(fn: string | null): number {
  if (!fn) return 0;
  const f = fn.toLowerCase();
  if (f.includes("président") || f.includes("directeur général") || f.includes("ceo") || f.includes("pdg")) return 15;
  if (f.includes("directeur") || f.includes("chief")) return 12;
  if (f.includes("administrateur") || f.includes("conseil") || f.includes("board")) return 8;
  if (f.includes("dirigeant")) return 6;
  return 3;
}

function pctMcapScore(pct: number): number {
  // 0.001% → 2pt, 0.01% → 8pt, 0.1% → 20pt, 0.5% → 30pt, 1%+ → 35pt
  if (pct <= 0) return 0;
  const s = Math.min(35, Math.log10(pct + 0.001) * 12 + 28);
  return Math.max(0, Math.round(s));
}

function pctFlowScore(pct: number): number {
  if (pct <= 0) return 0;
  const s = Math.min(20, (pct / 100) * 24);
  return Math.max(0, Math.round(s));
}

/** Analyst + valuation bonus (0–15 pts) */
function fundamentalsScore(
  analystScore: number | null,   // 1=strong buy → 5=strong sell
  trailingPE: number | null,
  debtToEquity: number | null,
): number {
  let pts = 0;
  // Analyst consensus (0–8 pts)
  if (analystScore != null) {
    // 1.0 → 8, 1.5 → 7, 2.0 → 5, 2.5 → 3, 3.0 → 0, >3 → negative
    pts += Math.max(-4, Math.round((3.5 - analystScore) * 3));
  }
  // Valuation: low PE = potential upside (0–4 pts)
  if (trailingPE != null && trailingPE > 0 && trailingPE < 100) {
    if (trailingPE < 10) pts += 4;
    else if (trailingPE < 15) pts += 3;
    else if (trailingPE < 20) pts += 2;
    else if (trailingPE < 30) pts += 1;
  }
  // Leverage: low D/E = safer (0–3 pts)
  if (debtToEquity != null) {
    if (debtToEquity < 30) pts += 3;
    else if (debtToEquity < 80) pts += 2;
    else if (debtToEquity < 150) pts += 1;
  }
  return Math.min(15, Math.max(-4, pts));
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
): number {
  let score = 0;
  score += pctMcapScore(pctOfMarketCap ?? 0);
  score += pctFlowScore(pctOfInsiderFlow ?? 0);
  score += functionScore(insiderFunction);
  // Use clusterStrength instead of flat +10 for cluster
  score += clusterStrengthScore(nearbyInsiderCount ?? (isCluster ? 2 : 0));
  if ((insiderCumNet ?? 0) > 0) score += 5;
  score += fundamentalsScore(analystScore ?? null, trailingPE ?? null, debtToEquity ?? null);
  return Math.min(100, Math.max(0, score));
}

/** Cluster strength bonus (0–10 pts): ≥3 distinct insiders → 10, 2 → 5 */
function clusterStrengthScore(nearbyInsiderCount: number): number {
  if (nearbyInsiderCount >= 3) return 10;
  if (nearbyInsiderCount >= 2) return 5;
  return 0;
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
        company: { select: { marketCap: true, analystScore: true, trailingPE: true, debtToEquity: true } },
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
