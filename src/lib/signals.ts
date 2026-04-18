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
// Score weights
// ────────────────────────────────────────────────────────────────────────────
const W_PCT_MCAP = 45;   // % of market cap is the strongest signal
const W_PCT_FLOW = 25;   // relative to this insider's own history
const W_FUNCTION = 15;   // seniority of insider
const W_CLUSTER = 10;    // cluster bonus
const W_CUMNET = 5;      // directional conviction (cumulative position)

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
  // 0.001% → 1pt, 0.01% → 5pt, 0.1% → 20pt, 0.5% → 35pt, 1%+ → 45pt
  if (pct <= 0) return 0;
  const s = Math.min(45, Math.log10(pct + 0.001) * 14 + 35);
  return Math.max(0, Math.round(s));
}

function pctFlowScore(pct: number): number {
  // 5% → 5pt, 20% → 12pt, 50% → 20pt, 80%+ → 25pt
  if (pct <= 0) return 0;
  const s = Math.min(25, (pct / 100) * 30);
  return Math.max(0, Math.round(s));
}

function computeScore(
  pctOfMarketCap: number | null,
  pctOfInsiderFlow: number | null,
  insiderFunction: string | null,
  isCluster: boolean,
  insiderCumNet: number | null,
): number {
  let score = 0;
  score += pctMcapScore(pctOfMarketCap ?? 0);
  score += pctFlowScore(pctOfInsiderFlow ?? 0);
  score += functionScore(insiderFunction);
  if (isCluster) score += W_CLUSTER;
  // Conviction bonus: if insider has been consistently buying (cumNet > 0) and this is a buy
  if ((insiderCumNet ?? 0) > 0) score += W_CUMNET;
  return Math.min(100, Math.max(0, score));
}

// ────────────────────────────────────────────────────────────────────────────
// Cluster detection helpers
// ────────────────────────────────────────────────────────────────────────────
const CLUSTER_WINDOW_DAYS = 5;

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
        company: { select: { marketCap: true } },
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
      const isCluster = nearbyInsiders.size >= 2;

      const signalScore = computeScore(
        pctOfMarketCap,
        pctOfInsiderFlow,
        decl.insiderFunction,
        isCluster,
        cumNet,
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
// Market cap enrichment via Yahoo Finance chart API
// ────────────────────────────────────────────────────────────────────────────
export async function enrichMarketCaps(limit = 50) {
  // Companies that haven't been enriched yet (or enriched > 7 days ago)
  const cutoff = new Date(Date.now() - 7 * 86400_000);
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { marketCapAt: null },
        { marketCapAt: { lt: cutoff } },
      ],
      isin: { not: null },
    },
    take: limit,
    orderBy: { marketCapAt: "asc" },
    select: { id: true, name: true, isin: true, yahooSymbol: true },
  });

  console.log(`[mcap] enriching ${companies.length} companies`);

  for (const co of companies) {
    try {
      const symbol = co.yahooSymbol ?? (await resolveSymbol(co.isin, co.name));
      if (!symbol) {
        await prisma.company.update({ where: { id: co.id }, data: { marketCapAt: new Date() } });
        continue;
      }

      const info = await fetchYahooInfo(symbol);
      if (!info) {
        await prisma.company.update({
          where: { id: co.id },
          data: { yahooSymbol: symbol, marketCapAt: new Date() },
        });
        continue;
      }

      await prisma.company.update({
        where: { id: co.id },
        data: {
          yahooSymbol: symbol,
          marketCap: info.marketCap ? BigInt(Math.round(info.marketCap)) : undefined,
          sharesOut: info.sharesOutstanding
            ? BigInt(Math.round(info.sharesOutstanding))
            : undefined,
          marketCapAt: new Date(),
        },
      });
      console.log(`[mcap] ${co.name} → ${symbol} mcap=${info.marketCap?.toLocaleString() ?? "n/a"}`);
    } catch (err) {
      console.error(`[mcap] error for ${co.name}:`, err);
    }

    // Respect Yahoo rate limits
    await new Promise((r) => setTimeout(r, 300));
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

interface YahooInfo {
  marketCap?: number;
  sharesOutstanding?: number;
}

async function fetchYahooInfo(symbol: string): Promise<YahooInfo | null> {
  try {
    // yahoo-finance2 handles crumb/cookie negotiation automatically
    const yf = require("yahoo-finance2") as { default?: { quote: (s: string, f: object, o: object) => Promise<{ marketCap?: number; sharesOutstanding?: number }> }; quote?: (s: string, f: object, o: object) => Promise<{ marketCap?: number; sharesOutstanding?: number }> };
    const lib = yf.default ?? yf;
    if (!lib.quote) return null;
    const q = await lib.quote(symbol, {}, { validateResult: false });
    return {
      marketCap: (q as { marketCap?: number }).marketCap ?? undefined,
      sharesOutstanding: (q as { sharesOutstanding?: number }).sharesOutstanding ?? undefined,
    };
  } catch {
    return null;
  }
}
