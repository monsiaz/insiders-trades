/**
 * GET /api/v1/strategy/winning
 *
 * Returns live signals matching the Sigma Winning Strategy :
 *   - beats CAC 40 every year 2022-2025
 *   - 6 filters (cluster, mid-cap 200M-1B€, PDG/CFO/Dir, fresh ≤ 7j, acquisition, score v3 ≥ 40)
 *   - +16.3% avg annual, Sharpe 1.00, alpha +10.4 pts/year
 *
 * Also returns the static historical proof in the response.
 *
 * Note: minScore raised 30 → 40 with signal score v3 (2026-04) to preserve the
 * v2-equivalent conviction level after weight redistribution.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness } from "@/lib/api-auth";
import {
  getWinningStrategySignals,
  STRATEGY_PROOF,
  WINNING_STRATEGY,
} from "@/lib/winning-strategy";

export const dynamic = "force-dynamic";
export const revalidate = 900; // 15 min

export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? 20)));
  const lookbackDays = Math.max(1, Math.min(365, Number(url.searchParams.get("lookbackDays") ?? 90)));

  const signals = await getWinningStrategySignals({ limit, lookbackDays });

  return NextResponse.json(
    withMeta(
      {
        strategy: {
          name: "Sigma Winning Strategy v1",
          scoringVersion: "v3 (2026-04)",
          description: "Bat le CAC 40 chaque année depuis 2022. Filtres multiples (cluster directionnel + mid-cap 200M-1B€ + not-board + fresh ≤ 7j + acquisition pure + score v3 ≥ 40). Horizon T+90.",
          criteria: WINNING_STRATEGY,
          proof: STRATEGY_PROOF,
        },
        filters: { lookbackDays, limit },
        count: signals.length,
        signals,
      },
      {
        startedAt: ctx.startedAt,
        dataFreshness: freshness({
          lastSignal: signals[0]?.pubDate,
          proofGeneratedAt: STRATEGY_PROOF.lastUpdatedAt,
        }),
      }
    )
  );
}
