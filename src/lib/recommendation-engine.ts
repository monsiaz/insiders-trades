/**
 * Recommendation Engine — InsiderTrades (Sigma)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ▲ PUBLIC REPO NOTE
 *  The ranking / filtering implementation has been redacted from the public
 *  showcase of this repository. The full engine lives in the private
 *  production build.
 *
 *  What IS public:
 *    - The composite-score methodology & weights (see /methodologie)
 *    - The scoring engine (src/lib/signals.ts)
 *    - The backtest engine (src/lib/backtest-compute.ts)
 *    - The UI / API surface consuming this module
 *
 *  What is redacted here:
 *    - Historical bucket look-up (role × size aggregation)
 *    - Per-bucket fallback priors
 *    - Recency decay half-life + conviction threshold ladder
 *    - Mode-specific over-fetch multipliers and dedup rules
 *    - BUY/SELL expected-return cut-offs
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Public API (unchanged):
 *   getRecommendations(opts: RecoOptions): Promise<RecoItem[]>
 *
 * The composite reco score blends:
 *   [30pts] Signal score         — from the signal scoring engine (0–100)
 *   [25pts] Historical win rate  — bucketed from BacktestResult
 *   [20pts] Expected return T+90 — bucketed from BacktestResult
 *   [15pts] Recency              — exponential decay from pubDate
 *   [10pts] Conviction bonus     — cluster / cascade / high % market cap
 *   Total: 100 pts max.
 */

import { normalizeRole } from "./role-utils";

// ── Public types (kept intact so consumers still type-check) ────────────────

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

  recoScore: number;
  scoreBreakdown: {
    signalPts:    number;
    winRatePts:   number;
    returnPts:    number;
    recencyPts:   number;
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

// ── Tiny public helper (harmless, reused by UI) ─────────────────────────────

export function roleLabelForReco(fn: string | null): string {
  return normalizeRole(fn);
}

// ── Stubbed implementation — the real engine ships in the private build ────

/**
 * Returns an empty list in the public showcase build.
 * In production, this function ranks recent insider declarations against
 * a cached historical bucket lookup and returns the top-N recommendations.
 */
export async function getRecommendations(_opts: RecoOptions): Promise<RecoItem[]> {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[insiders-trades] recommendation-engine is stubbed in the public repo. " +
      "Deploy the private engine to populate this feed."
    );
  }
  return [];
}

export const getGeneralRecommendations = async (_opts: { limit?: number; lookbackDays?: number }) =>
  getRecommendations({ mode: "general", ..._opts });

export const getSellRecommendations = async (_opts: { limit?: number; lookbackDays?: number }) =>
  getRecommendations({ mode: "sells", ..._opts });
