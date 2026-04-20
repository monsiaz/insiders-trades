/**
 * Recommendation Engine — InsiderTrades
 *
 * Scores recent BUY (and optionally SELL) insider declarations to produce
 * actionable top-N recommendations. The composite score blends:
 *
 *   [30pts] Signal score         — existing pipeline score (0-100)
 *   [25pts] Historical win rate  — from BacktestResult for the same role+size bucket
 *   [20pts] Expected return T+90 — avg return from backtest for the bucket
 *   [15pts] Recency              — exponential decay from pubDate (half-life 21d)
 *   [10pts] Conviction bonus     — cluster / cascade / high % of market cap
 *
 * Total: 100 pts max.
 */

import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { normalizeRole } from "./role-utils";

// ── Helpers (mirrored from backtest stats route) ──────────────────────────────

export function roleLabelForReco(fn: string | null): string {
  return normalizeRole(fn);
}

function sizeLabelForReco(mcap: bigint | number | null | undefined): string {
  if (mcap == null) return "Unknown";
  const mc = Number(mcap);
  if (!mc) return "Unknown";
  if (mc < 50_000_000)    return "Micro";
  if (mc < 300_000_000)   return "Small";
  if (mc < 2_000_000_000) return "Mid";
  if (mc < 10_000_000_000) return "Large";
  return "Mega";
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecoItem {
  declarationId: string;
  action: "BUY" | "SELL";
  company: { name: string; slug: string; yahooSymbol: string | null; logoUrl: string | null };
  insider: { name: string | null; function: string | null; role: string };
  totalAmount: number | null;
  pctOfMarketCap: number | null;
  signalScore: number | null;
  pubDate: string;
  transactionDate: string | null;
  isin: string | null;
  isCluster: boolean;
  amfLink: string;

  // Scoring
  recoScore: number;           // 0–100
  scoreBreakdown: {
    signalPts:    number;
    winRatePts:   number;
    returnPts:    number;
    recencyPts:   number;
    convictionPts: number;
  };
  expectedReturn90d: number | null;   // from backtest bucket
  historicalWinRate90d: number | null;
  historicalAvgReturn365d: number | null;
  sampleSize: number;                 // how many historical trades underpinned the stats

  // Company context
  marketCap: number | null;
  size: string;
  analystReco: string | null;
  targetMean: number | null;
  currentPrice: number | null;

  // Badges surfaced in the UI
  badges: string[];
}

interface BucketStats {
  winRate90d: number | null;
  avgReturn90d: number | null;
  avgReturn365d: number | null;
  count: number;
}

// ── Build historical lookup from BacktestResult ───────────────────────────────

// Cached heavy query — revalidates every 30 min. Backtest data moves slowly.
const getBacktestRows = unstable_cache(
  async () =>
    prisma.backtestResult.findMany({
      where: { priceAtTrade: { gt: 0 }, direction: "BUY" },
      select: {
        return90d: true,
        return365d: true,
        declaration: {
          select: {
            insiderFunction: true,
            company: { select: { marketCap: true } },
          },
        },
      },
    }),
  ["reco-backtest-rows"],
  { revalidate: 1800 }
);

async function buildHistoricalLookup(): Promise<Map<string, BucketStats>> {
  const rows = await getBacktestRows();

  // Bucket by role+size
  const buckets = new Map<string, { r90: number[]; r365: number[] }>();
  const addTo = (key: string, r90: number | null, r365: number | null) => {
    if (!buckets.has(key)) buckets.set(key, { r90: [], r365: [] });
    const b = buckets.get(key)!;
    if (r90 != null) b.r90.push(r90);
    if (r365 != null) b.r365.push(r365);
  };

  for (const row of rows) {
    const role = roleLabelForReco(row.declaration.insiderFunction);
    const size = sizeLabelForReco(row.declaration.company.marketCap);
    addTo(`${role}::${size}`, row.return90d, row.return365d);
    addTo(role, row.return90d, row.return365d);           // role-only fallback
    addTo("overall", row.return90d, row.return365d);      // global fallback
  }

  const result = new Map<string, BucketStats>();
  for (const [key, { r90, r365 }] of buckets) {
    const wr = r90.length > 0 ? r90.filter((v) => v > 0).length / r90.length : null;
    const avgR90 = r90.length > 0 ? r90.reduce((a, b) => a + b, 0) / r90.length : null;
    const avgR365 = r365.length > 0 ? r365.reduce((a, b) => a + b, 0) / r365.length : null;
    result.set(key, { winRate90d: wr ? wr * 100 : null, avgReturn90d: avgR90, avgReturn365d: avgR365, count: r90.length });
  }
  return result;
}

// ── Core scoring function ─────────────────────────────────────────────────────

function scoreDeclaration(
  decl: {
    signalScore: number | null;
    isCluster: boolean;
    pctOfMarketCap: number | null;
    pubDate: Date;
    totalAmount: number | null;
    insiderFunction: string | null;
    company: { marketCap: bigint | null };
  },
  hist: Map<string, BucketStats>
): {
  recoScore: number;
  scoreBreakdown: RecoItem["scoreBreakdown"];
  expectedReturn90d: number | null;
  historicalWinRate90d: number | null;
  historicalAvgReturn365d: number | null;
  sampleSize: number;
} {
  const role = roleLabelForReco(decl.insiderFunction);
  const size = sizeLabelForReco(decl.company.marketCap);
  const bucket =
    hist.get(`${role}::${size}`) ??
    hist.get(role) ??
    hist.get("overall") ??
    { winRate90d: 55, avgReturn90d: 4, avgReturn365d: 8, count: 0 };

  // [30pts] Signal score
  const signalPts = ((decl.signalScore ?? 30) / 100) * 30;

  // [25pts] Historical win rate (normalised to 0–25, ref: 50%=12.5, 80%=25)
  const wr = bucket.winRate90d ?? 55;
  const winRatePts = Math.min(Math.max((wr - 30) / 50, 0), 1) * 25;

  // [20pts] Expected return T+90 (ref: 0%=0, 20%=20)
  const avgR = bucket.avgReturn90d ?? 4;
  const returnPts = Math.min(Math.max(avgR / 20, 0), 1) * 20;

  // [15pts] Recency — half-life 21 days
  const daysSince = (Date.now() - decl.pubDate.getTime()) / 86400_000;
  const recencyPts = Math.exp((-daysSince * Math.LN2) / 21) * 15;

  // [10pts] Conviction: cluster > high mcap% > large amount
  let convictionPts = 0;
  if (decl.isCluster)                         convictionPts = 10;
  else if ((decl.pctOfMarketCap ?? 0) >= 2)   convictionPts = 9;
  else if ((decl.pctOfMarketCap ?? 0) >= 0.5) convictionPts = 6;
  else if ((decl.totalAmount ?? 0) >= 500_000) convictionPts = 4;
  else if ((decl.totalAmount ?? 0) >= 100_000) convictionPts = 2;

  const total = signalPts + winRatePts + returnPts + recencyPts + convictionPts;
  return {
    recoScore: Math.min(total, 100),
    scoreBreakdown: { signalPts, winRatePts, returnPts, recencyPts, convictionPts },
    expectedReturn90d: bucket.avgReturn90d,
    historicalWinRate90d: bucket.winRate90d,
    historicalAvgReturn365d: bucket.avgReturn365d,
    sampleSize: bucket.count,
  };
}

// ── Badge builder ─────────────────────────────────────────────────────────────

function buildBadges(decl: {
  isCluster: boolean;
  signalScore: number | null;
  pctOfMarketCap: number | null;
  totalAmount: number | null;
  insiderFunction: string | null;
  company: {
    marketCap: bigint | null;
    currentPrice: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    twoHundredDayAverage: number | null;
    targetMean: number | null;
    numAnalysts: number | null;
    analystScore: number | null;
    trailingPE: number | null;
    priceToBook: number | null;
    profitMargin: number | null;
    returnOnEquity: number | null;
    debtToEquity: number | null;
    freeCashFlow: bigint | null;
    heldByInstitutions: number | null;
    heldByInsiders: number | null;
    shortRatio: number | null;
  };
}): string[] {
  const badges: string[] = [];
  const role = roleLabelForReco(decl.insiderFunction);
  const size = sizeLabelForReco(decl.company.marketCap);
  const c = decl.company;

  // ── Primary signals (trade itself) ────────────────────────────
  if (decl.isCluster)                         badges.push("Cluster");
  if ((decl.signalScore ?? 0) >= 80)          badges.push("Score ≥80");
  else if ((decl.signalScore ?? 0) >= 65)     badges.push("Score ≥65");
  if (role === "PDG/DG")                      badges.push("PDG/DG");
  else if (role === "CFO/DAF")                badges.push("CFO/DAF");
  if ((decl.pctOfMarketCap ?? 0) >= 2)        badges.push(">2% mcap");
  else if ((decl.pctOfMarketCap ?? 0) >= 0.5) badges.push(">0.5% mcap");
  if ((decl.totalAmount ?? 0) >= 1_000_000)   badges.push(">1M€");
  else if ((decl.totalAmount ?? 0) >= 200_000) badges.push(">200k€");
  if (size === "Small" || size === "Micro")   badges.push(size + "-cap");

  // ── Composite signals (Yahoo fundamentals) ────────────────────
  // Upside to analyst target
  if (c.currentPrice && c.targetMean && (c.numAnalysts ?? 0) >= 3) {
    const upside = (c.targetMean - c.currentPrice) / c.currentPrice;
    if (upside >= 0.25) badges.push("Upside ≥25%");
    else if (upside >= 0.15) badges.push("Upside ≥15%");
  }
  // Analyst consensus
  if (c.analystScore != null && (c.numAnalysts ?? 0) >= 3 && c.analystScore <= 1.75) {
    badges.push("Strong Buy");
  }
  // 52-week position (contrarian near low, momentum near high)
  if (c.currentPrice && c.fiftyTwoWeekHigh && c.fiftyTwoWeekLow
      && c.fiftyTwoWeekHigh > c.fiftyTwoWeekLow) {
    const pos = (c.currentPrice - c.fiftyTwoWeekLow) / (c.fiftyTwoWeekHigh - c.fiftyTwoWeekLow);
    if (pos <= 0.2) badges.push("Près plus bas 52s");
  }
  // Above 200-day MA = momentum
  if (c.currentPrice && c.twoHundredDayAverage && c.twoHundredDayAverage > 0
      && c.currentPrice / c.twoHundredDayAverage >= 1.05) {
    badges.push("Momentum");
  }
  // Quality combo
  const hiROE = c.returnOnEquity != null && c.returnOnEquity >= 0.15;
  const hiMargin = c.profitMargin != null && c.profitMargin >= 0.10;
  const loDebt = c.debtToEquity != null && c.debtToEquity < 80;
  if (hiROE && hiMargin && loDebt) badges.push("Qualité");
  // Value combo
  const lowPE = c.trailingPE != null && c.trailingPE > 0 && c.trailingPE < 15;
  const lowPB = c.priceToBook != null && c.priceToBook > 0 && c.priceToBook < 2;
  const posFCF = c.freeCashFlow != null && Number(c.freeCashFlow) > 0;
  if (lowPE && lowPB && posFCF) badges.push("Value");
  // Institutional majority
  if (c.heldByInstitutions != null && c.heldByInstitutions >= 0.5) {
    badges.push("Institutionnels >50%");
  }
  // Insider ownership material
  if (c.heldByInsiders != null && c.heldByInsiders >= 0.2) {
    badges.push("Dirigeants ≥20%");
  }
  // Short-squeeze potential
  if (c.shortRatio != null && c.shortRatio >= 5) {
    badges.push("Short squeeze");
  }

  return badges.slice(0, 6); // max 6 badges (3 primary + 3 composite)
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RecoOptions {
  mode: "general" | "personal";
  limit?: number;
  lookbackDays?: number;
  portfolioIsins?: string[];  // for personal mode: user's current holdings
}

// Cached wrapper for general mode (no user state) — revalidates every 10 min.
// Declarations + backtest move slowly; caching eliminates 1–2s of latency per hit.
export const getGeneralRecommendations = unstable_cache(
  async (opts: { limit?: number; lookbackDays?: number }) =>
    _computeRecommendations({ mode: "general", ...opts }),
  ["reco-general-v2"], // v2: composite signals (momentum / value / quality / …)
  { revalidate: 600 }
);

export async function getRecommendations(opts: RecoOptions): Promise<RecoItem[]> {
  // Fast path: general mode is user-agnostic → use the cached version
  if (opts.mode === "general") {
    return getGeneralRecommendations({ limit: opts.limit, lookbackDays: opts.lookbackDays });
  }
  return _computeRecommendations(opts);
}

async function _computeRecommendations(opts: RecoOptions): Promise<RecoItem[]> {
  const { mode, limit = 10, lookbackDays = 90, portfolioIsins = [] } = opts;
  const since = new Date(Date.now() - lookbackDays * 86400_000);
  const isBuy = mode === "general"; // general = BUY only

  const whereBase = {
    type: "DIRIGEANTS" as const,
    pdfParsed: true,
    signalScore: { gte: 35 },
    pubDate: { gte: since },
  };

  // For personal mode (user with portfolio): include SELL on their holdings + all BUYs
  const declarations = await prisma.declaration.findMany({
    where: isBuy
      ? { ...whereBase, transactionNature: { contains: "Acquisition", mode: "insensitive" as const } }
      : {
          ...whereBase,
          OR: [
            { transactionNature: { contains: "Acquisition", mode: "insensitive" as const } },
            ...(portfolioIsins.length > 0
              ? [{ transactionNature: { contains: "Cession", mode: "insensitive" as const }, isin: { in: portfolioIsins } }]
              : []),
          ],
        },
    orderBy: { pubDate: "desc" },
    take: limit * 12, // over-fetch, we'll rank + filter (weak returns) and trim
    select: {
      id: true, amfId: true, link: true,
      pubDate: true, transactionDate: true,
      transactionNature: true,
      insiderName: true, insiderFunction: true,
      totalAmount: true, pctOfMarketCap: true,
      signalScore: true, isCluster: true, isin: true,
      company: {
        select: {
          name: true, slug: true, yahooSymbol: true, logoUrl: true,
          marketCap: true, analystReco: true, targetMean: true, currentPrice: true,
          // Composite-signal inputs
          fiftyTwoWeekHigh: true, fiftyTwoWeekLow: true,
          twoHundredDayAverage: true, numAnalysts: true, analystScore: true,
          trailingPE: true, priceToBook: true, freeCashFlow: true,
          profitMargin: true, returnOnEquity: true, debtToEquity: true,
          heldByInstitutions: true, heldByInsiders: true, shortRatio: true,
        },
      },
    },
  });

  if (declarations.length === 0) return [];

  const hist = await buildHistoricalLookup();

  const scored: RecoItem[] = declarations.map((decl) => {
    const co = decl.company;
    const isSell = (decl.transactionNature ?? "").toLowerCase().includes("cession");
    const action: "BUY" | "SELL" = isSell ? "SELL" : "BUY";
    const role = roleLabelForReco(decl.insiderFunction);
    const size = sizeLabelForReco(co.marketCap);

    const scoring = scoreDeclaration(
      {
        signalScore: decl.signalScore,
        isCluster: decl.isCluster,
        pctOfMarketCap: decl.pctOfMarketCap,
        pubDate: decl.pubDate,
        totalAmount: decl.totalAmount ? Number(decl.totalAmount) : null,
        insiderFunction: decl.insiderFunction,
        company: { marketCap: co.marketCap },
      },
      hist
    );

    // Sell signals get a recency-only boost; win rate is inverted (price drop = success)
    // We slightly discount sell scores to surface buys first in mixed lists.
    const finalScore = action === "SELL" ? scoring.recoScore * 0.85 : scoring.recoScore;

    return {
      declarationId: decl.id,
      action,
      company: {
        name: co.name,
        slug: co.slug,
        yahooSymbol: co.yahooSymbol,
        logoUrl: co.logoUrl ?? null,
      },
      insider: {
        name: decl.insiderName,
        function: decl.insiderFunction,
        role,
      },
      totalAmount: decl.totalAmount ? Number(decl.totalAmount) : null,
      pctOfMarketCap: decl.pctOfMarketCap,
      signalScore: decl.signalScore,
      pubDate: decl.pubDate.toISOString(),
      transactionDate: decl.transactionDate?.toISOString() ?? null,
      isin: decl.isin,
      isCluster: decl.isCluster,
      amfLink: decl.link,

      recoScore: finalScore,
      scoreBreakdown: scoring.scoreBreakdown,
      expectedReturn90d: scoring.expectedReturn90d,
      historicalWinRate90d: scoring.historicalWinRate90d,
      historicalAvgReturn365d: scoring.historicalAvgReturn365d,
      sampleSize: scoring.sampleSize,

      marketCap: co.marketCap ? Number(co.marketCap) : null,
      size,
      analystReco: co.analystReco,
      targetMean: co.targetMean,
      currentPrice: co.currentPrice,

      badges: buildBadges({
        isCluster: decl.isCluster,
        signalScore: decl.signalScore,
        pctOfMarketCap: decl.pctOfMarketCap,
        totalAmount: decl.totalAmount ? Number(decl.totalAmount) : null,
        insiderFunction: decl.insiderFunction,
        company: {
          marketCap: co.marketCap,
          currentPrice: co.currentPrice,
          fiftyTwoWeekHigh: co.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: co.fiftyTwoWeekLow,
          twoHundredDayAverage: co.twoHundredDayAverage,
          targetMean: co.targetMean,
          numAnalysts: co.numAnalysts,
          analystScore: co.analystScore,
          trailingPE: co.trailingPE,
          priceToBook: co.priceToBook,
          profitMargin: co.profitMargin,
          returnOnEquity: co.returnOnEquity,
          debtToEquity: co.debtToEquity,
          freeCashFlow: co.freeCashFlow,
          heldByInstitutions: co.heldByInstitutions,
          heldByInsiders: co.heldByInsiders,
          shortRatio: co.shortRatio,
        },
      }),
    };
  });

  // Minimum expected return filter — we don't surface recos under 4% T+90
  // SELL signals bypass this (they're warnings, not performance picks)
  const MIN_EXPECTED_RETURN = 4;

  // Sort by score desc, filter weak returns, then take top N (dedup by company — keep best per company)
  const seen = new Set<string>();
  return scored
    .sort((a, b) => b.recoScore - a.recoScore)
    .filter((r) => {
      if (seen.has(r.company.slug)) return false;
      seen.add(r.company.slug);
      // SELL is always kept (they're sell-warnings, not buy-recos)
      if (r.action === "SELL") return true;
      // BUY must have a credible expected return
      if (r.expectedReturn90d == null) return false;
      if (r.expectedReturn90d < MIN_EXPECTED_RETURN) return false;
      return true;
    })
    .slice(0, limit);
}
