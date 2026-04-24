/**
 * Recommendation Engine · InsiderTrades Sigma
 *
 * Composite reco score (0–100 pts):
 *   [30pts] Signal score          – from the scored declaration
 *   [25pts] Historical win rate   – per role×size bucket from BacktestResult
 *   [20pts] Expected return T+90  – per bucket
 *   [15pts] Recency               – exponential decay, 21-day half-life
 *   [10pts] Conviction bonus      – cluster / %mcap / ticket size
 *
 * Public API:
 *   getRecommendations(opts: RecoOptions): Promise<RecoItem[]>
 */

import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { normalizeRole } from "./role-utils";

// ── Public types ─────────────────────────────────────────────────────────────

export interface RecoItem {
  declarationId: string;
  action: "BUY" | "SELL";
  company: { name: string; slug: string; yahooSymbol: string | null; logoUrl: string | null };
  /** Primary insider (highest signal score declaration) */
  insider: { name: string | null; slug: string | null; function: string | null; role: string };
  /** All insiders involved when multiple declarations are merged into one card */
  allInsiders: Array<{ name: string | null; slug: string | null; role: string }>;
  totalAmount: number | null;
  /** Number of declarations merged into this card (1 = single declaration) */
  declarationCount: number;
  pctOfMarketCap: number | null;
  signalScore: number | null;
  pubDate: string;
  transactionDate: string | null;
  isin: string | null;
  isCluster: boolean;
  amfLink: string;

  recoScore: number;
  scoreBreakdown: {
    signalPts:     number;
    winRatePts:    number;
    returnPts:     number;
    recencyPts:    number;
    convictionPts: number;
  };
  expectedReturn90d: number | null;
  historicalWinRate90d: number | null;
  historicalAvgReturn365d: number | null;
  sampleSize: number;

  marketCap: number | null;
  size: string;
  analystReco: string | null;
  targetMean: number | null;
  currentPrice: number | null;

  badges: string[];
}

export interface RecoOptions {
  mode: "general" | "sells" | "personal";
  limit?: number;
  lookbackDays?: number;
  portfolioIsins?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function roleLabelForReco(fn: string | null): string {
  return normalizeRole(fn);
}

// v3: refined buckets. The 300M-1B sweet spot is where the grid search found the
// winning strategy's edge lives (liquid enough to trade, small enough to be
// under-covered by sell-side). Splitting it out gives cleaner bucket stats.
function sizeLabel(mcap: bigint | number | null | undefined): string {
  if (mcap == null) return "Unknown";
  const mc = Number(mcap);
  if (!mc) return "Unknown";
  if (mc < 50_000_000)        return "Micro";     // <50M
  if (mc < 300_000_000)       return "Small";     // 50-300M
  if (mc < 1_000_000_000)     return "Sweet";     // 300M-1B (★ alpha zone)
  if (mc < 3_000_000_000)     return "Mid";       // 1-3B
  if (mc < 15_000_000_000)    return "Large";     // 3-15B
  return "Mega";                                  // 15B+
}

const NON_MARKET_KW = [
  "apport en nature", "reclassement", "nantissement", "conversion",
  "souscription", "reprise de la dotation", "prêt", "pret",
  "transfert", "donation", "succession",
];
function isNonMarket(nature: string | null): boolean {
  if (!nature) return false;
  const n = nature.toLowerCase();
  return NON_MARKET_KW.some((kw) => n.includes(kw));
}

// ── Bucket stats (cached 30 min) ─────────────────────────────────────────────

interface BucketStat {
  count: number;
  winRate90d: number | null;
  avgReturn90d: number | null;
  avgReturn365d: number | null;
}

interface BucketCatalog {
  buy: Record<string, BucketStat>;
  sell: Record<string, BucketStat>;
  /**
   * Overall BUY priors used for Bayesian shrinkage when a specific bucket has
   * too few observations (F4). overallBuyWinRate/return replace the hard-coded
   * 40% prior from v2 (F9).
   */
  overallBuyWinRate: number | null;
  overallBuyReturn90d: number | null;
  overallSellWinRate: number | null;
  overallSellReturn90d: number | null;
}

async function _buildBucketStats(): Promise<BucketCatalog> {
  const results = await prisma.backtestResult.findMany({
    where: { returnFromPub90d: { not: null } },
    select: {
      returnFromPub90d: true,
      returnFromPub365d: true,
      direction: true,
      declaration: {
        select: {
          insiderFunction: true,
          company: { select: { marketCap: true } },
        },
      },
    },
  });

  type Acc = Record<string, { r90: number[]; r365: number[] }>;
  const buyAcc: Acc = {};
  const sellAcc: Acc = {};

  function add(acc: Acc, key: string, r90: number | null, r365: number | null) {
    if (!acc[key]) acc[key] = { r90: [], r365: [] };
    if (r90 != null) acc[key].r90.push(r90);
    if (r365 != null) acc[key].r365.push(r365);
  }

  for (const r of results) {
    const role = normalizeRole(r.declaration.insiderFunction);
    const size = sizeLabel(r.declaration.company.marketCap);
    const acc = r.direction === "SELL" ? sellAcc : buyAcc;
    add(acc, `${role}::${size}`, r.returnFromPub90d, r.returnFromPub365d);
    add(acc, role, r.returnFromPub90d, r.returnFromPub365d);
    add(acc, "__overall", r.returnFromPub90d, r.returnFromPub365d);
  }

  function summarize(acc: Acc): Record<string, BucketStat> {
    const out: Record<string, BucketStat> = {};
    for (const [key, b] of Object.entries(acc)) {
      out[key] = {
        count: b.r90.length,
        winRate90d: b.r90.length > 0
          ? (b.r90.filter((v) => v > 0).length / b.r90.length) * 100 : null,
        avgReturn90d: b.r90.length > 0
          ? b.r90.reduce((a, v) => a + v, 0) / b.r90.length : null,
        avgReturn365d: b.r365.length > 0
          ? b.r365.reduce((a, v) => a + v, 0) / b.r365.length : null,
      };
    }
    return out;
  }

  const buy  = summarize(buyAcc);
  const sell = summarize(sellAcc);

  return {
    buy, sell,
    overallBuyWinRate:   buy["__overall"]?.winRate90d ?? null,
    overallBuyReturn90d: buy["__overall"]?.avgReturn90d ?? null,
    overallSellWinRate:  sell["__overall"]?.winRate90d ?? null,
    overallSellReturn90d:sell["__overall"]?.avgReturn90d ?? null,
  };
}

const getBucketStats = unstable_cache(
  _buildBucketStats,
  ["reco-bucket-stats-v4"],
  { revalidate: 1800 },
);

// ────────────────────────────────────────────────────────────────────────────
// v3 shrinkage helpers
// Bayesian shrinkage: a bucket with n observations and mean m gets pulled
// toward the prior with strength k. Effective = (n·m + k·prior) / (n + k).
// ────────────────────────────────────────────────────────────────────────────
const SHRINKAGE_K = 20;          // soft prior strength · ~20 trades
const RECENCY_HALFLIFE_DAYS = 45; // v3: aligned with 90-day hold (was 21 in v2)
const STALENESS_THRESHOLDS = [   // display-time only, in days
  { maxDays: 7,  penalty:  0 },
  { maxDays: 14, penalty: -1 },
  { maxDays: 30, penalty: -3 },
  { maxDays: Infinity, penalty: -5 },
] as const;

function shrinkMean(
  sampleMean: number | null,
  sampleN: number,
  priorMean: number | null,
  k: number = SHRINKAGE_K,
): number | null {
  if (priorMean == null && sampleMean == null) return null;
  if (priorMean == null) return sampleMean;
  if (sampleMean == null || sampleN === 0) return priorMean;
  return (sampleN * sampleMean + k * priorMean) / (sampleN + k);
}

function displayStalenessPenalty(daysOld: number): number {
  for (const t of STALENESS_THRESHOLDS) if (daysOld <= t.maxDays) return t.penalty;
  return -5;
}

// ── Prisma select shared by all queries ──────────────────────────────────────

const DECL_SELECT = {
  id: true,
  link: true,
  isin: true,
  insiderName: true,
  insiderFunction: true,
  transactionNature: true,
  totalAmount: true,
  pctOfMarketCap: true,
  pctOfInsiderFlow: true,
  insiderCumNet: true,
  signalScore: true,
  isCluster: true,
  pubDate: true,
  transactionDate: true,
  company: {
    select: {
      name: true,
      slug: true,
      isin: true,
      yahooSymbol: true,
      logoUrl: true,
      marketCap: true,
      currentPrice: true,
      targetMean: true,
      analystReco: true,
    },
  },
  insider: { select: { slug: true } },
} as const;

// ── RecoItem builder ──────────────────────────────────────────────────────────

type DeclRow = Awaited<ReturnType<typeof prisma.declaration.findMany<{
  select: typeof DECL_SELECT
}>>>[number];

function buildRecoItem(
  decl: DeclRow,
  action: "BUY" | "SELL",
  bucket: BucketStat | null,
  priors: { winRate: number | null; return90d: number | null },
): RecoItem {
  const role = normalizeRole(decl.insiderFunction);
  const size = sizeLabel(decl.company.marketCap);
  const rawBucketReturn = bucket?.avgReturn90d ?? null;
  const rawBucketWinRate = bucket?.winRate90d ?? null;
  const bucketN = bucket?.count ?? 0;
  const daysOld = (Date.now() - decl.pubDate.getTime()) / 86400_000;

  // v3: Bayesian shrinkage against overall priors (F4 + F9).
  // A bucket with n=5 trades no longer over-rewards noise; it's pulled toward
  // the global BUY/SELL average until enough data accumulates (k=20).
  const shrunkWinRate  = shrinkMean(rawBucketWinRate,  bucketN, priors.winRate);
  const shrunkReturn   = shrinkMean(rawBucketReturn,   bucketN, priors.return90d);

  // Display-visible expected stats use the SHRUNK versions (honest numbers).
  const expectedReturn90d = shrunkReturn;
  const winRate = shrunkWinRate;

  // Score breakdown
  const signalPts = Math.round(((decl.signalScore ?? 0) / 100) * 30);
  const winRatePts = winRate != null
    ? Math.round((winRate / 100) * 25)
    : 12; // neutral prior (~50% cold start)
  const returnPts = expectedReturn90d != null
    ? Math.min(20, Math.max(0, Math.round(expectedReturn90d * 1.5)))
    : 8;
  // v3: half-life aligned with 90-day hold. A 45-day-old trade keeps ~50% weight.
  const rawRecencyPts = 15 * Math.pow(0.5, daysOld / RECENCY_HALFLIFE_DAYS);
  // v3: staleness penalty applied HERE (display time), not baked into signalScore.
  const stalenessPen = displayStalenessPenalty(daysOld);
  const recencyPts = Math.max(0, Math.round(rawRecencyPts + stalenessPen));

  let convictionPts = 0;
  if (decl.isCluster) convictionPts += 5;
  if ((decl.pctOfMarketCap ?? 0) > 0.5) convictionPts += 3;
  if ((decl.totalAmount ?? 0) > 500_000) convictionPts += 2;
  convictionPts = Math.min(10, convictionPts);

  const recoScore = signalPts + winRatePts + returnPts + recencyPts + convictionPts;

  // Badges
  const badges: string[] = [];
  if (decl.isCluster) badges.push("cluster");
  const roleLc = role.toLowerCase();
  if (roleLc.includes("pdg") || roleLc.includes("directeur général") || roleLc.includes("president"))
    badges.push("pdg");
  if (roleLc.includes("financier") || roleLc.includes("cfo") || roleLc.includes("daf"))
    badges.push("cfo");
  if ((decl.pctOfMarketCap ?? 0) > 1) badges.push("high-conviction");
  if (daysOld <= 7) badges.push("fresh");

  return {
    declarationId: decl.id,
    action,
    company: {
      name: decl.company.name,
      slug: decl.company.slug,
      yahooSymbol: decl.company.yahooSymbol ?? null,
      logoUrl: decl.company.logoUrl ?? null,
    },
    insider: {
      name: decl.insiderName,
      slug: decl.insider?.slug ?? null,
      function: decl.insiderFunction,
      role,
    },
    allInsiders: [{ name: decl.insiderName, slug: decl.insider?.slug ?? null, role }],
    declarationCount: 1,
    totalAmount: decl.totalAmount,
    pctOfMarketCap: decl.pctOfMarketCap,
    signalScore: decl.signalScore,
    pubDate: decl.pubDate.toISOString(),
    transactionDate: decl.transactionDate?.toISOString() ?? null,
    isin: decl.isin ?? decl.company.isin ?? null,
    isCluster: decl.isCluster,
    amfLink: decl.link,
    recoScore,
    scoreBreakdown: { signalPts, winRatePts, returnPts, recencyPts, convictionPts },
    expectedReturn90d,
    historicalWinRate90d: winRate,
    historicalAvgReturn365d: bucket?.avgReturn365d ?? null,
    sampleSize: bucket?.count ?? 0,
    marketCap: decl.company.marketCap ? Number(decl.company.marketCap) : null,
    size,
    analystReco: decl.company.analystReco ?? null,
    targetMean: decl.company.targetMean ?? null,
    currentPrice: decl.company.currentPrice ?? null,
    badges,
  };
}

// ── Merge duplicate company cards ─────────────────────────────────────────────
// Groups recommendations by company slug. When multiple declarations exist for
// the same company, keeps the best score as the primary and aggregates amounts.

function mergeByCompany(items: RecoItem[]): RecoItem[] {
  const map = new Map<string, RecoItem>();

  for (const item of items) {
    const key = item.company.slug;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...item });
    } else {
      // Accumulate amount
      existing.totalAmount = (existing.totalAmount ?? 0) + (item.totalAmount ?? 0) || null;
      existing.declarationCount += 1;

      // Add insider to allInsiders if not already listed
      const already = existing.allInsiders.some(
        (i) => i.name === item.insider.name
      );
      if (!already) {
        existing.allInsiders = [...existing.allInsiders, {
          name: item.insider.name,
          slug: item.insider.slug,
          role: item.insider.role,
        }];
      }

      // Mark as cluster if multiple declarations
      if (!existing.isCluster) existing.isCluster = true;
      if (!existing.badges.includes("cluster")) existing.badges = ["cluster", ...existing.badges];
    }
  }

  return Array.from(map.values());
}

// ── Lookup helper ─────────────────────────────────────────────────────────────

function lookupBucket(
  buckets: Record<string, BucketStat>,
  role: string,
  size: string,
): BucketStat | null {
  return buckets[`${role}::${size}`] ?? buckets[role] ?? buckets["__overall"] ?? null;
}

// ── Cross-trade detection + per-company directional dominance ────────────────
// Two rules to avoid showing the same company in both BUY and SELL tabs:
//
// 1) Cross-trade filter: on the same day / same company, if the sum of BUY
//    amounts matches the sum of SELL amounts within ±5%, these are family
//    transmissions / cessions de gré à gré (e.g. Joël Séché president → Maxime
//    Séché CEO, same amount same day). They carry no directional signal and
//    are excluded from both tabs entirely.
//
// 2) After cross-trade removal, each company is classified into exactly ONE
//    side: whichever direction has the larger residual amount wins. No more
//    "MIXED" state — a company is BUY_DOM or SELL_DOM, period.
//
// Together with the strict startsWith nature filter, this guarantees that the
// same company can never appear in both the Buy and Sell recommendation tabs.

type Dominance = "BUY_DOM" | "SELL_DOM";
const CROSS_TRADE_TOLERANCE = 0.05;

function directionOf(nature: string | null): "BUY" | "SELL" | null {
  const n = (nature ?? "").toLowerCase();
  if (n.startsWith("acqui")) return "BUY";
  if (n.startsWith("cession")) return "SELL";
  return null;
}

async function _buildDominance(lookbackDays: number): Promise<{
  dominance: Record<string, Dominance>;
  crossTradeDeclIds: string[];
}> {
  const cutoff = new Date(Date.now() - lookbackDays * 86400_000);
  const rows = await prisma.declaration.findMany({
    where: {
      pubDate: { gte: cutoff },
      pdfParsed: true,
      totalAmount: { gt: 0 },
      OR: [
        { transactionNature: { startsWith: "acqui", mode: "insensitive" } },
        { transactionNature: { startsWith: "cession", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      pubDate: true,
      totalAmount: true,
      transactionNature: true,
      company: { select: { slug: true } },
    },
  });

  // Step 1: group by (slug, YYYY-MM-DD) to find same-day cross-trades
  type DayBucket = {
    buy: number;
    sell: number;
    buyIds: string[];
    sellIds: string[];
  };
  const byDay = new Map<string, DayBucket>();
  const cleanRows = rows.filter((r) => !isNonMarket(r.transactionNature));

  for (const r of cleanRows) {
    const dir = directionOf(r.transactionNature);
    if (!dir) continue;
    const dayKey = `${r.company.slug}::${r.pubDate.toISOString().slice(0, 10)}`;
    const cur = byDay.get(dayKey) ?? { buy: 0, sell: 0, buyIds: [], sellIds: [] };
    if (dir === "BUY") { cur.buy += r.totalAmount ?? 0; cur.buyIds.push(r.id); }
    else               { cur.sell += r.totalAmount ?? 0; cur.sellIds.push(r.id); }
    byDay.set(dayKey, cur);
  }

  const crossTradeIds = new Set<string>();
  for (const b of byDay.values()) {
    if (b.buy === 0 || b.sell === 0) continue;
    const ratio = Math.min(b.buy, b.sell) / Math.max(b.buy, b.sell);
    // Within ±5% → treat as cross-trade (symmetric transfer, no directional info)
    if (ratio >= 1 - CROSS_TRADE_TOLERANCE) {
      for (const id of b.buyIds)  crossTradeIds.add(id);
      for (const id of b.sellIds) crossTradeIds.add(id);
    }
  }

  // Step 2: aggregate residual buy/sell per company (excluding cross-trades)
  const agg = new Map<string, { buy: number; sell: number }>();
  for (const r of cleanRows) {
    if (crossTradeIds.has(r.id)) continue;
    const dir = directionOf(r.transactionNature);
    if (!dir) continue;
    const cur = agg.get(r.company.slug) ?? { buy: 0, sell: 0 };
    if (dir === "BUY") cur.buy += r.totalAmount ?? 0;
    else               cur.sell += r.totalAmount ?? 0;
    agg.set(r.company.slug, cur);
  }

  // Step 3: assign each company to exactly one side (whichever has more volume)
  const dominance: Record<string, Dominance> = {};
  for (const [slug, { buy, sell }] of agg) {
    if (buy === 0 && sell === 0) continue;
    dominance[slug] = buy >= sell ? "BUY_DOM" : "SELL_DOM";
  }

  return { dominance, crossTradeDeclIds: Array.from(crossTradeIds) };
}

const getDominanceCached = unstable_cache(
  _buildDominance,
  ["reco-dominance-v2"],
  { revalidate: 1800 },
);

async function getCompanyDominance(_cutoff: Date, lookbackDays = 90): Promise<{
  dominance: Map<string, Dominance>;
  crossTradeDeclIds: Set<string>;
}> {
  const { dominance, crossTradeDeclIds } = await getDominanceCached(lookbackDays);
  return {
    dominance: new Map(Object.entries(dominance)),
    crossTradeDeclIds: new Set(crossTradeDeclIds),
  };
}

// ── Buy recommendations ───────────────────────────────────────────────────────

async function getBuyRecommendations(cutoff: Date, limit: number): Promise<RecoItem[]> {
  const [stats, { dominance, crossTradeDeclIds }] = await Promise.all([
    getBucketStats(),
    getCompanyDominance(cutoff),
  ]);
  const buyBuckets = stats.buy;
  const buyPriors = { winRate: stats.overallBuyWinRate, return90d: stats.overallBuyReturn90d };

  const decls = await prisma.declaration.findMany({
    where: {
      pubDate: { gte: cutoff },
      pdfParsed: true,
      signalScore: { not: null, gt: 0 },
      totalAmount: { gt: 0 },
      // Strict: nature must START with "acqui" (avoids "cession d'actions acquises…")
      transactionNature: { startsWith: "acqui", mode: "insensitive" },
    },
    orderBy: { signalScore: "desc" },
    take: limit * 8,
    select: DECL_SELECT,
  });

  const seen = new Set<string>();
  const items: RecoItem[] = [];

  for (const decl of decls) {
    if (isNonMarket(decl.transactionNature)) continue;
    if (seen.has(decl.id)) continue;
    seen.add(decl.id);

    // Exclude cross-trades (same-day matched buy/sell — family transmissions etc.)
    if (crossTradeDeclIds.has(decl.id)) continue;
    // Each company belongs to exactly one tab — skip if SELL is dominant
    if (dominance.get(decl.company.slug) !== "BUY_DOM") continue;

    const role = normalizeRole(decl.insiderFunction);
    const size = sizeLabel(decl.company.marketCap);
    const bucket = lookupBucket(buyBuckets, role, size);
    const er = bucket?.avgReturn90d ?? null;

    if (er != null && er < 2 && (decl.signalScore ?? 0) < 50) continue;

    items.push(buildRecoItem(decl, "BUY", bucket, buyPriors));
  }

  items.sort((a, b) => b.recoScore - a.recoScore);
  const merged = mergeByCompany(items);
  merged.sort((a, b) => b.recoScore - a.recoScore);

  return merged.slice(0, limit);
}

// ── Sell recommendations ──────────────────────────────────────────────────────

async function getSellRecommendations(cutoff: Date, limit: number): Promise<RecoItem[]> {
  const [stats, { dominance, crossTradeDeclIds }] = await Promise.all([
    getBucketStats(),
    getCompanyDominance(cutoff),
  ]);
  const sellBuckets = stats.sell;
  const sellPriors = { winRate: stats.overallSellWinRate, return90d: stats.overallSellReturn90d };

  const decls = await prisma.declaration.findMany({
    where: {
      pubDate: { gte: cutoff },
      pdfParsed: true,
      totalAmount: { gt: 0 },
      // Strict: nature must START with "cession" (avoids "acquisition suite à cession…")
      transactionNature: { startsWith: "cession", mode: "insensitive" },
    },
    orderBy: [{ totalAmount: "desc" }, { pubDate: "desc" }],
    take: limit * 6,
    select: DECL_SELECT,
  });

  const seen = new Set<string>();
  const items: RecoItem[] = [];

  for (const decl of decls) {
    if (isNonMarket(decl.transactionNature)) continue;
    if (seen.has(decl.id)) continue;
    seen.add(decl.id);

    // Exclude cross-trades (same-day matched buy/sell — family transmissions etc.)
    if (crossTradeDeclIds.has(decl.id)) continue;
    // Each company belongs to exactly one tab — skip if BUY is dominant
    if (dominance.get(decl.company.slug) !== "SELL_DOM") continue;

    const role = normalizeRole(decl.insiderFunction);
    const size = sizeLabel(decl.company.marketCap);
    const bucket = lookupBucket(sellBuckets, role, size);

    items.push(buildRecoItem(decl, "SELL", bucket, sellPriors));
  }

  items.sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0));
  const merged = mergeByCompany(items);
  merged.sort((a, b) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0));
  return merged.slice(0, limit);
}

// ── Personal recommendations ──────────────────────────────────────────────────

async function getPersonalRecommendations(
  cutoff: Date,
  limit: number,
  portfolioIsins: string[],
): Promise<RecoItem[]> {
  const [stats, { crossTradeDeclIds }] = await Promise.all([
    getBucketStats(),
    getCompanyDominance(cutoff),
  ]);
  const buyBuckets = stats.buy;
  const sellBuckets = stats.sell;
  const buyPriors  = { winRate: stats.overallBuyWinRate,  return90d: stats.overallBuyReturn90d };
  const sellPriors = { winRate: stats.overallSellWinRate, return90d: stats.overallSellReturn90d };

  // Parallel fetch: sell alerts on holdings + top buy signals
  const [sellDecls, buyDecls] = await Promise.all([
    portfolioIsins.length > 0
      ? prisma.declaration.findMany({
          where: {
            pubDate: { gte: cutoff },
            pdfParsed: true,
            isin: { in: portfolioIsins },
            // Strict: nature must START with "cession" (avoids "acquisition suite à cession…")
            transactionNature: { startsWith: "cession", mode: "insensitive" },
            totalAmount: { gt: 0 },
          },
          orderBy: { pubDate: "desc" },
          take: 30,
          select: DECL_SELECT,
        })
      : ([] as DeclRow[]),
    prisma.declaration.findMany({
      where: {
        pubDate: { gte: cutoff },
        pdfParsed: true,
        signalScore: { not: null, gt: 35 },
        totalAmount: { gt: 0 },
        // Strict acquisition filter: nature must start with "acqui" to avoid
        // matching "cession d'actions acquises..." which would appear in both lists
        transactionNature: { startsWith: "acqui", mode: "insensitive" },
      },
      orderBy: { signalScore: "desc" },
      take: limit * 6,
      select: DECL_SELECT,
    }),
  ]);

  const seenIds   = new Set<string>();
  const seenSlugs = new Set<string>(); // companies already flagged SELL

  const sellItems: RecoItem[] = [];
  const buyItems:  RecoItem[] = [];

  // SELL alerts first (on user's holdings)
  for (const decl of sellDecls) {
    if (isNonMarket(decl.transactionNature)) continue;
    if (crossTradeDeclIds.has(decl.id)) continue; // Skip family transmissions
    if (seenIds.has(decl.id)) continue;
    seenIds.add(decl.id);

    const role = normalizeRole(decl.insiderFunction);
    const size = sizeLabel(decl.company.marketCap);
    const bucket = lookupBucket(sellBuckets, role, size);
    sellItems.push(buildRecoItem(decl, "SELL", bucket, sellPriors));
    seenSlugs.add(decl.company.slug);
  }

  // BUY signals — never on a company already flagged as SELL
  for (const decl of buyDecls) {
    if (isNonMarket(decl.transactionNature)) continue;
    if (crossTradeDeclIds.has(decl.id)) continue; // Skip family transmissions
    if (seenIds.has(decl.id)) continue;
    if (seenSlugs.has(decl.company.slug)) continue;
    seenIds.add(decl.id);

    const role = normalizeRole(decl.insiderFunction);
    const size = sizeLabel(decl.company.marketCap);
    const bucket = lookupBucket(buyBuckets, role, size);
    buyItems.push(buildRecoItem(decl, "BUY", bucket, buyPriors));
  }

  // Merge same-company cards within each action group
  const mergedSells = mergeByCompany(sellItems);
  const mergedBuys  = mergeByCompany(buyItems);

  return [...mergedSells, ...mergedBuys].slice(0, limit);
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function getRecommendations(opts: RecoOptions): Promise<RecoItem[]> {
  const {
    mode,
    limit = 10,
    lookbackDays = 90,
    portfolioIsins = [],
  } = opts;

  const cutoff = new Date(Date.now() - lookbackDays * 86400_000);

  try {
    if (mode === "general") return await getBuyRecommendations(cutoff, limit);
    if (mode === "sells")   return await getSellRecommendations(cutoff, limit);
    return await getPersonalRecommendations(cutoff, limit, portfolioIsins);
  } catch (err) {
    console.error("[reco-engine] error:", err);
    return [];
  }
}

export const getGeneralRecommendations = (opts: { limit?: number; lookbackDays?: number }) =>
  getRecommendations({ mode: "general", ...opts });

export const getSellRecommendations2 = (opts: { limit?: number; lookbackDays?: number }) =>
  getRecommendations({ mode: "sells", ...opts });
