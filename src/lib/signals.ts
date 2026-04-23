/**
 * Signal scoring engine · v2 (recalibrated 2026-04 based on 3-year backtest).
 *
 * Empirical findings from scripts/strategy-backtest-v2.mjs on 15k retail-realistic
 * backtests :
 *   - Cluster signals (≥2 insiders ±30j) are the ONLY robust alpha (+2.8% CAGR,
 *     Sharpe 0.27, MaxDD -18%). → WEIGHT INCREASED.
 *   - Score filters ≥ 50 or ≥ 60 alone actually LOSE money (noise-heavy). → weight
 *     redistributed toward Cluster + Role.
 *   - Freshness alone is negative (fresh trades = small illiquid caps). → No direct
 *     bonus, but signals > 14d old get a decay penalty.
 *   - PDG/CFO role is predictive when combined with Cluster. → role weight increased.
 *
 * Computes analytics fields for declarations:
 *  - pctOfMarketCap:   totalAmount / company.marketCap * 100 (capped at 100%)
 *  - pctOfInsiderFlow: totalAmount / SUM(all trades by same insider on same company) * 100
 *  - insiderCumNet:    cumulative buy-sell by this insider on this company up to this trade
 *  - isCluster:        ≥2 distinct insiders traded the same company within 30 days
 *  - signalScore:      composite 0-100 score
 *
 * ──────────── Budget v2 ─────────────  total ≤ 100 pts
 *  22 pts · % of market cap           (was 28 · downweighted: noisy on small caps)
 *  12 pts · % of insider own flow      (was 16 · downweighted)
 *  16 pts · insider function           (was 12 · upweighted: PDG/CFO matters)
 *  18 pts · cluster strength           (was 8 · ★ UPWEIGHTED: the real alpha)
 *   4 pts · directional conviction    (unchanged: net buyer on this stock)
 *   8 pts · fundamentals              (was 12 · downweighted: weak predictor)
 *  20 pts · composite signals          (unchanged: momentum/value/quality)
 *  −5 pts · staleness penalty          (NEW: signals published > 14d ago get dinged)
 */

import { prisma } from "./prisma";
import { roleFunctionScore } from "./role-utils";

/**
 * Transaction natures that are NOT genuine market trades · corporate actions,
 * intra-group reclassifications, loans, pledges, conversions, etc. These
 * produce extreme %mcap values because they either:
 *   - move 100%+ of the capital (apport en nature, reclassement);
 *   - have a broken market cap (e.g. EDF during reprivatisation);
 *   - don't represent a directional opinion by the insider.
 * We still keep the rows in DB for display, but we do NOT use them for
 * pctOfMarketCap computation nor give them a BUY/SELL-style signalScore.
 */
const NON_MARKET_NATURES = [
  "apport en nature",
  "reclassement",
  "nantissement",
  "conversion",
  "souscription",
  "reprise de la dotation",
  "prêt",
  "pret",
  "transfert",
  "donation",
  "succession",
];

function isNonMarketNature(nature: string | null): boolean {
  if (!nature) return false;
  const n = nature.toLowerCase();
  return NON_MARKET_NATURES.some((kw) => n.includes(kw));
}

/**
 * Cap pctOfMarketCap to a sensible range. Anything > 100% means either the
 * amount is wrong (OCR error) or the mcap is wrong (stale / pre-IPO). Either
 * way, using that value in scoring would give a nonsensical 28 pts on a bug.
 */
function sanitizePctMcap(pct: number | null): number | null {
  if (pct == null) return null;
  if (!Number.isFinite(pct)) return null;
  if (pct < 0) return null;
  if (pct > 100) return null; // implausible for a single insider trade
  return pct;
}

// ────────────────────────────────────────────────────────────────────────────
// Core scoring helpers
// ────────────────────────────────────────────────────────────────────────────

function functionScore(fn: string | null): number {
  // roleFunctionScore returns 0–15; rescale to 0–16 (upweighted)
  return Math.round((roleFunctionScore(fn) / 15) * 16);
}

function pctMcapScore(pct: number): number {
  // Recalibrated for max 22 pts (was 28):
  // 0.001% → 1pt, 0.01% → 5pt, 0.1% → 13pt, 0.5% → 19pt, 1%+ → 22pt
  if (pct <= 0) return 0;
  const s = Math.min(22, Math.log10(pct + 0.001) * 7.5 + 17);
  return Math.max(0, Math.round(s));
}

function pctFlowScore(pct: number): number {
  // Recalibrated for max 12 pts (was 16)
  if (pct <= 0) return 0;
  const s = Math.min(12, (pct / 100) * 14);
  return Math.max(0, Math.round(s));
}

/** Analyst + valuation + leverage fundamentals (max 8 pts, min -3) · recalibrated smaller */
function fundamentalsScore(
  analystScore: number | null,   // 1=strong buy → 5=strong sell
  trailingPE: number | null,
  debtToEquity: number | null,
): number {
  let pts = 0;
  if (analystScore != null) {
    // 1.0 → 4, 1.5 → 3, 2.0 → 2, 2.5 → 1, 3.0 → 0, >3 → negative
    pts += Math.max(-3, Math.round((3.5 - analystScore) * 1.5));
  }
  if (trailingPE != null && trailingPE > 0 && trailingPE < 100) {
    if (trailingPE < 10) pts += 2;
    else if (trailingPE < 15) pts += 1;
  }
  if (debtToEquity != null) {
    if (debtToEquity < 30) pts += 2;
    else if (debtToEquity < 80) pts += 1;
  }
  return Math.min(8, Math.max(-3, pts));
}

/**
 * Cluster strength bonus (0–18 pts) · UPWEIGHTED in v2.
 *  2 insiders → 12 pts  (entry level: worth a real look)
 *  3 insiders → 15 pts
 *  4+ insiders → 18 pts  (very strong signal, rarely wrong)
 */
function clusterStrengthScore(nearbyInsiderCount: number): number {
  if (nearbyInsiderCount >= 4) return 18;
  if (nearbyInsiderCount >= 3) return 15;
  if (nearbyInsiderCount >= 2) return 12;
  return 0;
}

/**
 * Staleness penalty · NEW in v2. Signals that have been sitting in the feed
 * for a long time without the market digesting them (weird!) get a slight
 * penalty, signaling they're probably not going to move.
 *
 *   0–7 days old  : 0 pts
 *   8–14 days old : -1 pts
 *   15–30 days old : -3 pts
 *   30+ days old  : -5 pts (shouldn't be surfacing as a fresh signal)
 *
 * `daysOld` = (now - pubDate) in days.
 */
function stalenessPenalty(daysOld: number): number {
  if (daysOld <= 7)  return 0;
  if (daysOld <= 14) return -1;
  if (daysOld <= 30) return -3;
  return -5;
}

// ────────────────────────────────────────────────────────────────────────────
// Composite signals (extended · 20 pts budget)
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

  // ── 1. Momentum (position in 52w range) · up to 3 pts + flag
  //    NB: "contrarian near 52w low" flag when insider buys a falling stock
  if (i.currentPrice && i.fiftyTwoWeekHigh && i.fiftyTwoWeekLow
      && i.fiftyTwoWeekHigh > i.fiftyTwoWeekLow) {
    const range = i.fiftyTwoWeekHigh - i.fiftyTwoWeekLow;
    const pos = (i.currentPrice - i.fiftyTwoWeekLow) / range; // 0 (low) → 1 (high)
    if (pos <= 0.2) { pts += 3; flags.push("near-52w-low"); }        // contrarian buy
    else if (pos >= 0.85) { pts += 1; flags.push("near-52w-high"); } // momentum but weak signal on its own
  }

  // ── 2. Price vs 200-day MA (long-term trend) · up to 2 pts + flag
  if (i.currentPrice && i.twoHundredDayAverage && i.twoHundredDayAverage > 0) {
    const r = i.currentPrice / i.twoHundredDayAverage;
    if (r >= 1.05) { pts += 2; flags.push("above-ma200"); }
    else if (r <= 0.85) { pts += 1; flags.push("oversold"); } // price 15%+ below MA200 + insider buy = strong
  }

  // ── 3. Analyst upside to target price · up to 3 pts + flag
  if (i.currentPrice && i.targetMean && i.numAnalysts && i.numAnalysts >= 3) {
    const upside = (i.targetMean - i.currentPrice) / i.currentPrice;
    if (upside >= 0.25) { pts += 3; flags.push("upside-25pct"); }
    else if (upside >= 0.15) { pts += 2; flags.push("upside-15pct"); }
    else if (upside >= 0.05) { pts += 1; }
  }

  // ── 4. Analyst consensus Strong Buy · up to 2 pts + flag
  if (i.analystScore != null && i.numAnalysts && i.numAnalysts >= 3) {
    if (i.analystScore <= 1.75) { pts += 2; flags.push("analyst-strong-buy"); }
    else if (i.analystScore <= 2.25) { pts += 1; flags.push("analyst-buy"); }
  }

  // ── 5. Value combo (low P/E + low P/B + positive FCF) · up to 2 pts + flag
  const fcf = typeof i.freeCashFlow === "bigint" ? Number(i.freeCashFlow) : i.freeCashFlow;
  const lowPE = i.trailingPE != null && i.trailingPE > 0 && i.trailingPE < 15;
  const lowPB = i.priceToBook != null && i.priceToBook > 0 && i.priceToBook < 2;
  const posFCF = fcf != null && fcf > 0;
  if (lowPE && lowPB && posFCF) { pts += 2; flags.push("value-combo"); }
  else if (lowPE && posFCF) { pts += 1; flags.push("value"); }

  // ── 6. Quality combo (high ROE + high margin + low debt) · up to 3 pts + flag
  const hiROE = i.returnOnEquity != null && i.returnOnEquity >= 0.15;      // ≥15%
  const hiMargin = i.profitMargin != null && i.profitMargin >= 0.10;       // ≥10%
  const loDebt = i.debtToEquity != null && i.debtToEquity < 80;
  if (hiROE && hiMargin && loDebt) { pts += 3; flags.push("quality-combo"); }
  else if (hiROE && hiMargin) { pts += 2; flags.push("quality"); }
  else if (hiROE) { pts += 1; }

  // ── 7. Smart money (institutional ownership) · up to 1 pt + flag
  if (i.heldByInstitutions != null && i.heldByInstitutions >= 0.5) {
    pts += 1;
    flags.push("institutional-majority");
  }

  // ── 8. Insider alignment (insiders already hold material stake) · up to 2 pts + flag
  //    Ownership is a strong signal that the insider has skin in the game
  if (i.heldByInsiders != null && i.heldByInsiders >= 0.2) {
    pts += 2;
    flags.push("insider-owned-high");
  } else if (i.heldByInsiders != null && i.heldByInsiders >= 0.05) {
    pts += 1;
    flags.push("insider-owned");
  }

  // ── 9. Short-squeeze setup · up to 2 pts + flag
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
  pubDate?: Date | null,
): number {
  let score = 0;
  score += pctMcapScore(pctOfMarketCap ?? 0);
  score += pctFlowScore(pctOfInsiderFlow ?? 0);
  score += functionScore(insiderFunction);
  score += clusterStrengthScore(nearbyInsiderCount ?? (isCluster ? 2 : 0));
  if ((insiderCumNet ?? 0) > 0) score += 4;
  score += fundamentalsScore(analystScore ?? null, trailingPE ?? null, debtToEquity ?? null);
  score += compositePoints ?? 0;

  // Staleness penalty (only applied at display time · scoredAt ≠ signal age)
  if (pubDate) {
    const daysOld = (Date.now() - pubDate.getTime()) / 86400_000;
    score += stalenessPenalty(daysOld);
  }

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
      const isNonMarket = isNonMarketNature(decl.transactionNature);

      // pctOfMarketCap · skip for non-market natures (apport, reclassement, nantissement…)
      // and clamp to a realistic range (0–100%) so OCR bugs don't propagate.
      const rawPctMcap = mcap && mcap > 0 && !isNonMarket ? (amount / mcap) * 100 : null;
      const pctOfMarketCap = sanitizePctMcap(rawPctMcap);

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
        decl.pubDate, // v2: staleness penalty
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
