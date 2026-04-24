/**
 * Signal scoring engine · v3 (2026-04 methodology refresh).
 *
 * Core changes vs v2 :
 *   • Reweighted toward insider-centric evidence (track record, DCA) and
 *     away from public-information fundamentals.
 *   • Cluster detection is now strictly DIRECTIONAL: a BUY is scored against
 *     same-direction nearby insiders only, a SELL against same-direction
 *     sellers. Mixed activity no longer inflates either side.
 *   • Staleness penalty REMOVED from the stored score (was time-of-scoring
 *     dependent, leaking date bias into backtests). Now applied at display
 *     time in the recommendation engine.
 *   • NEW — Insider track record (F5): per-insider alpha from historical
 *     backtests with Bayesian shrinkage. Worth up to 14 pts.
 *   • NEW — DCA bonus (F6): repeat-accumulation by the same insider on the
 *     same company within 12 months. Worth up to 6 pts.
 *   • NEW — Analyst-contrarian bonus (F7): insider buys when sell-side
 *     consensus is neutral/bearish historically produces higher alpha.
 *   • Composite 52-week low flag is GATED (F13): only activates when either
 *     cluster ≥ 2 or role ∈ {PDG/DG, CFO/DAF}. Prevents naive knife-catching.
 *
 * ──────────── Budget v3 ─────────────  total ≤ 100 pts
 *  16 pts · % of market cap           (was 22 · still highest base weight)
 *   8 pts · % of insider own flow      (was 12)
 *  14 pts · insider function           (was 16)
 *  18 pts · DIRECTIONAL cluster        (unchanged — validated alpha source)
 *   4 pts · directional conviction     (insider is net-buyer pre-trade)
 *   4 pts · fundamentals               (was 8 · mostly-public info trimmed)
 *  10 pts · composite signals          (was 20 · sub-bonuses rescaled 0.5×)
 *  14 pts · ★ insider track record    (NEW · biggest addition)
 *   6 pts · ★ DCA / accumulation       (NEW)
 *   6 pts · ★ analyst-contrarian       (NEW)
 */

import { prisma } from "./prisma";
import { roleFunctionScore } from "./role-utils";

/**
 * Transaction natures that are NOT genuine market trades · corporate actions,
 * intra-group reclassifications, loans, pledges, conversions, etc.
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

/** Direction of a trade row (BUY / SELL / null for corp actions). */
function directionOf(nature: string | null): "BUY" | "SELL" | null {
  const n = (nature ?? "").toLowerCase();
  if (n.startsWith("acqui") || n.includes("acquisition")) return "BUY";
  if (n.startsWith("cession") || n.includes("cession")) return "SELL";
  return null;
}

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

/** Role → 0-14 pts (was 0-16 in v2). PDG/DG=14, CFO/DAF=13, Directeur=9, CA/Board=6, Autre=2. */
function functionScore(fn: string | null): number {
  return Math.round((roleFunctionScore(fn) / 15) * 14);
}

/** % market cap → 0-16 pts (log-scaled). 0.001% → 1, 0.1% → 10, 1%+ → 16. */
function pctMcapScore(pct: number): number {
  if (pct <= 0) return 0;
  const s = Math.min(16, Math.log10(pct + 0.001) * 5.5 + 12);
  return Math.max(0, Math.round(s));
}

/** % of insider's own flow on this company → 0-8 pts. */
function pctFlowScore(pct: number): number {
  if (pct <= 0) return 0;
  const s = Math.min(8, (pct / 100) * 10);
  return Math.max(0, Math.round(s));
}

/** Analyst + valuation + leverage fundamentals · max 4 pts, min -2. */
function fundamentalsScore(
  analystScore: number | null,
  trailingPE: number | null,
  debtToEquity: number | null,
): number {
  let pts = 0;
  if (analystScore != null) {
    pts += Math.max(-2, Math.round((3.5 - analystScore) * 0.8));
  }
  if (trailingPE != null && trailingPE > 0 && trailingPE < 100) {
    if (trailingPE < 10) pts += 1;
  }
  if (debtToEquity != null) {
    if (debtToEquity < 30) pts += 1;
  }
  return Math.min(4, Math.max(-2, pts));
}

/**
 * DIRECTIONAL cluster strength · 0-18 pts.
 * Counts distinct insiders who traded the SAME company in the SAME direction
 * within ±30 days. BUY clusters and SELL clusters are scored independently.
 *
 *  2 same-direction insiders → 12 pts
 *  3 same-direction insiders → 15 pts
 *  4+ same-direction insiders → 18 pts
 */
function clusterStrengthScore(sameDirectionInsiderCount: number): number {
  if (sameDirectionInsiderCount >= 4) return 18;
  if (sameDirectionInsiderCount >= 3) return 15;
  if (sameDirectionInsiderCount >= 2) return 12;
  return 0;
}

/**
 * Insider track record · 0-14 pts.
 * alpha_shrunk = (Σreturns + k·globalMean) / (n + k), k=5.
 * Only applied when the insider has ≥2 prior (pubDate < current) backtested trades.
 */
export function trackRecordScore(alpha: number | null, n: number): number {
  if (alpha == null || n < 2) return 0;
  if (alpha <= -5)  return -2;   // historically money-losing insider
  if (alpha < 0)    return 0;
  if (alpha < 2)    return 3;
  if (alpha < 5)    return 7;
  if (alpha < 10)   return 11;
  return 14;
}

/**
 * DCA bonus · 0-6 pts.
 * Counts past BUY trades by the same insider on the same company within
 * the last 365 days (strictly prior to the current trade).
 */
export function dcaScore(priorBuysCount12m: number): number {
  if (priorBuysCount12m >= 3) return 6;
  if (priorBuysCount12m >= 2) return 4;
  if (priorBuysCount12m >= 1) return 2;
  return 0;
}

/**
 * Analyst-contrarian bonus · 0-6 pts (BUY only).
 * Insider BUY when sell-side consensus is neutral/bearish has historically
 * produced higher forward alpha than BUY-with-consensus.
 *   analystScore ∈ [1 (Strong Buy) .. 5 (Strong Sell)]
 */
export function analystContrarianScore(
  direction: "BUY" | "SELL" | null,
  analystScore: number | null,
  numAnalysts: number | null,
): number {
  if (direction !== "BUY") return 0;
  if (analystScore == null || numAnalysts == null || numAnalysts < 3) return 0;
  if (analystScore >= 3.5) return 6;
  if (analystScore >= 3.0) return 3;
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Composite signals · 10 pts budget in v3 (was 20, all sub-bonuses rescaled).
// Each emits a boolean flag + a small point value. UI shows the flag.
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
  analystScore:  number | null;
  trailingPE:    number | null;
  forwardPE:     number | null;
  priceToBook:   number | null;
  profitMargin:  number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  debtToEquity:  number | null;
  freeCashFlow:  bigint | number | null;
  heldByInstitutions: number | null;
  heldByInsiders:     number | null;
  shortRatio:    number | null;
  /** Role (PDG/DG, CFO/DAF, Directeur, CA/Board, Autre) — required to gate 52w-low flag. */
  role: string;
  /** Whether the current trade has a directional cluster ≥ 2 — required to gate 52w-low flag. */
  hasCluster: boolean;
}

export interface CompositeResult {
  points: number;    // 0–10 in v3
  flags: string[];
}

/** Compute the 10-pt composite bonus from Yahoo data. Sub-bonuses rescaled ~0.5× from v2. */
export function computeComposite(i: CompositeInputs): CompositeResult {
  const flags: string[] = [];
  let pts = 0;

  // 52w-low is GATED (F13): require cluster or PDG/CFO to avoid knife-catching.
  const canContrarian = i.hasCluster || i.role === "PDG/DG" || i.role === "CFO/DAF";

  // 1. Momentum (position in 52w range)
  if (i.currentPrice && i.fiftyTwoWeekHigh && i.fiftyTwoWeekLow
      && i.fiftyTwoWeekHigh > i.fiftyTwoWeekLow) {
    const range = i.fiftyTwoWeekHigh - i.fiftyTwoWeekLow;
    const pos = (i.currentPrice - i.fiftyTwoWeekLow) / range;
    if (pos <= 0.2 && canContrarian) {
      pts += 2;
      flags.push("near-52w-low");
    } else if (pos >= 0.85) {
      pts += 1;
      flags.push("near-52w-high");
    }
  }

  // 2. Price vs 200-day MA
  if (i.currentPrice && i.twoHundredDayAverage && i.twoHundredDayAverage > 0) {
    const r = i.currentPrice / i.twoHundredDayAverage;
    if (r >= 1.05) { pts += 1; flags.push("above-ma200"); }
    else if (r <= 0.85 && canContrarian) { pts += 1; flags.push("oversold"); }
  }

  // 3. Analyst upside
  if (i.currentPrice && i.targetMean && i.numAnalysts && i.numAnalysts >= 3) {
    const upside = (i.targetMean - i.currentPrice) / i.currentPrice;
    if (upside >= 0.25)      { pts += 2; flags.push("upside-25pct"); }
    else if (upside >= 0.15) { pts += 1; flags.push("upside-15pct"); }
  }

  // 4. Value combo (low P/E + low P/B + positive FCF)
  const fcf = typeof i.freeCashFlow === "bigint" ? Number(i.freeCashFlow) : i.freeCashFlow;
  const lowPE = i.trailingPE != null && i.trailingPE > 0 && i.trailingPE < 15;
  const lowPB = i.priceToBook != null && i.priceToBook > 0 && i.priceToBook < 2;
  const posFCF = fcf != null && fcf > 0;
  if (lowPE && lowPB && posFCF) { pts += 1; flags.push("value-combo"); }

  // 5. Quality combo (high ROE + margin + low debt)
  const hiROE = i.returnOnEquity != null && i.returnOnEquity >= 0.15;
  const hiMargin = i.profitMargin != null && i.profitMargin >= 0.10;
  const loDebt = i.debtToEquity != null && i.debtToEquity < 80;
  if (hiROE && hiMargin && loDebt) { pts += 2; flags.push("quality-combo"); }
  else if (hiROE && hiMargin)       { pts += 1; flags.push("quality"); }

  // 6. Insider alignment (material holdings already)
  if (i.heldByInsiders != null && i.heldByInsiders >= 0.2) {
    pts += 1;
    flags.push("insider-owned-high");
  }

  // 7. Short-squeeze setup
  if (i.shortRatio != null && i.shortRatio >= 5) {
    pts += 1;
    flags.push("short-squeeze");
  }

  return { points: Math.min(10, Math.max(0, pts)), flags };
}

// ────────────────────────────────────────────────────────────────────────────
// Composite score
// ────────────────────────────────────────────────────────────────────────────

interface ComputeScoreInputs {
  pctOfMarketCap: number | null;
  pctOfInsiderFlow: number | null;
  insiderFunction: string | null;
  sameDirectionInsiderCount: number; // directional cluster
  insiderCumNet: number | null;
  analystScore: number | null;
  trailingPE: number | null;
  debtToEquity: number | null;
  compositePoints: number;           // already 0-10
  trackRecordAlpha: number | null;   // shrunk mean %
  trackRecordN: number;              // sample size (prior trades)
  dcaPriorBuys12m: number;
  direction: "BUY" | "SELL" | null;
  numAnalysts: number | null;
}

function computeScore(i: ComputeScoreInputs): number {
  let score = 0;
  score += pctMcapScore(i.pctOfMarketCap ?? 0);                                   // 0-16
  score += pctFlowScore(i.pctOfInsiderFlow ?? 0);                                 // 0-8
  score += functionScore(i.insiderFunction);                                      // 0-14
  score += clusterStrengthScore(i.sameDirectionInsiderCount);                     // 0-18
  if ((i.insiderCumNet ?? 0) > 0) score += 4;                                     // 0-4
  score += fundamentalsScore(i.analystScore, i.trailingPE, i.debtToEquity);       // -2..4
  score += i.compositePoints;                                                      // 0-10
  score += trackRecordScore(i.trackRecordAlpha, i.trackRecordN);                   // -2..14
  score += dcaScore(i.dcaPriorBuys12m);                                            // 0-6
  score += analystContrarianScore(i.direction, i.analystScore, i.numAnalysts);    // 0-6

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
// Insider track record index · preloaded once per scoring batch.
//
// For each insider, we gather all their historical backtested returns, sorted
// by pubDate. At scoring time, we filter to trades strictly prior to the
// current row's pubDate (look-ahead free) and apply Bayesian shrinkage:
//
//   alpha_shrunk = (Σ prior_returns + k·globalMean) / (n_prior + k)
//
// with k=5 (typical prior strength for retail-size samples).
// ────────────────────────────────────────────────────────────────────────────
const TRACK_RECORD_K = 5;

export interface InsiderTrackEntry {
  pubDate: Date;
  returnFromPub90d: number;
}

export interface TrackRecordIndex {
  /** Sorted asc by pubDate, per insiderName. */
  byInsider: Map<string, InsiderTrackEntry[]>;
  /** Global mean of returnFromPub90d across all entries. */
  globalMean: number;
}

export async function buildInsiderTrackRecordIndex(): Promise<TrackRecordIndex> {
  const rows = await prisma.backtestResult.findMany({
    where: {
      direction: "BUY",
      returnFromPub90d: { not: null },
      priceAtPub: { gt: 0 },
      declaration: { type: "DIRIGEANTS", pdfParsed: true, insiderName: { not: null } },
    },
    select: {
      returnFromPub90d: true,
      declaration: { select: { insiderName: true, pubDate: true } },
    },
  });

  const byInsider = new Map<string, InsiderTrackEntry[]>();
  let sum = 0, n = 0;
  for (const r of rows) {
    const name = r.declaration.insiderName;
    const ret = r.returnFromPub90d;
    if (!name || ret == null) continue;
    if (!byInsider.has(name)) byInsider.set(name, []);
    byInsider.get(name)!.push({ pubDate: r.declaration.pubDate, returnFromPub90d: ret });
    sum += ret; n++;
  }
  // Sort each insider's history asc by pubDate (enables prior-only filtering)
  for (const arr of byInsider.values()) {
    arr.sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());
  }
  return { byInsider, globalMean: n > 0 ? sum / n : 0 };
}

/** Compute shrunk prior alpha for an insider as of a given pubDate. */
export function priorAlphaForInsider(
  idx: TrackRecordIndex,
  insiderName: string | null,
  currentPubDate: Date,
): { alpha: number | null; n: number } {
  if (!insiderName) return { alpha: null, n: 0 };
  const arr = idx.byInsider.get(insiderName);
  if (!arr || arr.length === 0) return { alpha: null, n: 0 };
  let sum = 0, n = 0;
  for (const e of arr) {
    if (e.pubDate >= currentPubDate) break; // strictly prior
    sum += e.returnFromPub90d; n++;
  }
  if (n === 0) return { alpha: null, n: 0 };
  const shrunk = (sum + TRACK_RECORD_K * idx.globalMean) / (n + TRACK_RECORD_K);
  return { alpha: shrunk, n };
}

// ────────────────────────────────────────────────────────────────────────────
// Main: score all unscored declarations (or re-score all if force=true)
// ────────────────────────────────────────────────────────────────────────────
export async function scoreDeclarations(force = false, batchSize = 200) {
  const where = force
    ? { totalAmount: { not: null }, pdfParsed: true }
    : { totalAmount: { not: null }, pdfParsed: true, scoredAt: null };

  const total = await prisma.declaration.count({ where });
  console.log(`[signals v3] scoring ${total} declarations…`);

  // Preload per-insider track record index (shared across all batches)
  const trackIndex = await buildInsiderTrackRecordIndex();
  console.log(`[signals v3] track record index: ${trackIndex.byInsider.size} insiders, globalMean=${trackIndex.globalMean.toFixed(2)}%`);

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

    const companyIds = [...new Set(decls.map((d) => d.companyId))];

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

    // Group by (companyId, insiderName) for flow / DCA calcs
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
      const direction = directionOf(decl.transactionNature);

      // % market cap (sanitised)
      const rawPctMcap = mcap && mcap > 0 && !isNonMarket ? (amount / mcap) * 100 : null;
      const pctOfMarketCap = sanitizePctMcap(rawPctMcap);

      // % of insider's own flow on this company
      const insiderKey = `${decl.companyId}::${decl.insiderName ?? "__unknown"}`;
      const insiderTrades = byInsiderCompany.get(insiderKey) ?? [];
      const totalInsiderFlow = insiderTrades.reduce((s, t) => s + (t.totalAmount ?? 0), 0);
      const pctOfInsiderFlow = totalInsiderFlow > 0 ? (amount / totalInsiderFlow) * 100 : null;

      // insiderCumNet (running buy - sell strictly prior to this trade)
      const refDate = decl.transactionDate ?? decl.pubDate;
      const refPub  = decl.pubDate;
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

      // DCA: count prior BUY trades by same (insider, company) in past 365d
      const past12m = new Date(refDate.getTime() - 365 * 86400_000);
      let priorBuys12m = 0;
      for (const t of insiderTrades) {
        if (t.id === decl.id) continue;
        const tDate = t.transactionDate ?? t.pubDate;
        if (tDate >= refDate) continue;        // strictly prior
        if (tDate < past12m) continue;         // within 12 months
        if (directionOf(t.transactionNature) !== "BUY") continue;
        priorBuys12m++;
      }

      // Directional cluster count: distinct insiders on this company, SAME direction, ±30d
      const companyTrades = byCompany.get(decl.companyId) ?? [];
      const sameDirInsiders = new Set<string>();
      const anyDirInsiders  = new Set<string>();
      for (const t of companyTrades) {
        if (!t.insiderName) continue;
        const tDate = t.transactionDate ?? t.pubDate;
        if (!withinDays(tDate, refDate, CLUSTER_WINDOW_DAYS)) continue;
        const dir = directionOf(t.transactionNature);
        anyDirInsiders.add(t.insiderName);
        if (direction && dir === direction) sameDirInsiders.add(t.insiderName);
      }
      const sameDirectionInsiderCount = sameDirInsiders.size;
      const isCluster = sameDirectionInsiderCount >= 2;  // now directional

      const role = (() => {
        // Inline role normalization for composite gating
        const n = (decl.insiderFunction ?? "").toLowerCase();
        if (/pdg|p\.d\.g|directeur[- ]general|president[- ]directeur|ceo|managing director/.test(n)) return "PDG/DG";
        if (/cfo|daf|directeur[- ]financier|director.?of.?finance/.test(n)) return "CFO/DAF";
        return "Other";
      })();

      // Composite bonus (0-10)
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
        role,
        hasCluster: isCluster,
      });

      // Track record: look-ahead-free per-insider alpha (strictly prior to refPub)
      const { alpha: trAlpha, n: trN } = priorAlphaForInsider(
        trackIndex, decl.insiderName, refPub,
      );

      const signalScore = computeScore({
        pctOfMarketCap,
        pctOfInsiderFlow,
        insiderFunction: decl.insiderFunction,
        sameDirectionInsiderCount,
        insiderCumNet: cumNet,
        analystScore: decl.company.analystScore,
        trailingPE: decl.company.trailingPE,
        debtToEquity: decl.company.debtToEquity,
        compositePoints: composite.points,
        trackRecordAlpha: trAlpha,
        trackRecordN: trN,
        dcaPriorBuys12m: priorBuys12m,
        direction,
        numAnalysts: decl.company.numAnalysts,
      });

      updates.push(
        prisma.declaration.update({
          where: { id: decl.id },
          data: {
            pctOfMarketCap,
            pctOfInsiderFlow,
            insiderCumNet: cumNet,
            isCluster,                   // now directional
            signalScore,
            scoredAt: new Date(),
          },
        })
      );
    }

    await Promise.all(updates);

    processed += decls.length;
    console.log(`[signals v3] ${processed}/${total} scored`);
  }

  console.log("[signals v3] done.");
}

// ────────────────────────────────────────────────────────────────────────────
// Public constants (for /methodologie, /fonctionnement pages and tests)
// ────────────────────────────────────────────────────────────────────────────
export const SCORE_V3_WEIGHTS = {
  pctMarketCap: 16,
  pctInsiderFlow: 8,
  role: 14,
  clusterDirectional: 18,
  directionalConviction: 4,
  fundamentals: 4,      // -2..+4 effective
  composite: 10,
  trackRecord: 14,      // -2..+14 effective
  dca: 6,
  analystContrarian: 6,
  total: 100,
} as const;
