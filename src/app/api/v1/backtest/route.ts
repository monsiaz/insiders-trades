import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/backtest
 *   Global backtest stats (retour moyen / median / win rate) for BUY & SELL.
 *
 * Optional filters:
 *   ?direction=BUY|SELL (default BOTH)
 *   &minScore=50        (filter on underlying declaration signalScore)
 *   &from=ISO  &to=ISO  (filter on declaration.pubDate)
 */
export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const direction = (url.searchParams.get("direction") ?? "").toUpperCase();
  const minScore = url.searchParams.get("minScore");
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  const declWhere: Record<string, unknown> = { type: "DIRIGEANTS" };
  if (minScore) declWhere.signalScore = { gte: Number(minScore) };
  if (fromStr)  declWhere.pubDate = { ...(declWhere.pubDate as object ?? {}), gte: new Date(fromStr) };
  if (toStr)    declWhere.pubDate = { ...(declWhere.pubDate as object ?? {}), lte: new Date(toStr) };

  const where: Record<string, unknown> = { declaration: declWhere };
  if (direction === "BUY" || direction === "SELL") where.direction = direction;

  const [total, lastBt, bucketStats, winStats] = await Promise.all([
    prisma.backtestResult.count({ where }),
    prisma.backtestResult.findFirst({ where, orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.backtestResult.aggregate({
      where,
      _avg:    { return30d: true, return60d: true, return90d: true, return160d: true, return365d: true, return730d: true },
      _count:  { return30d: true, return60d: true, return90d: true, return160d: true, return365d: true, return730d: true },
    }),
    prisma.backtestResult.groupBy({
      by: ["direction"],
      where,
      _count: { _all: true },
    }),
  ]);

  // Win rate: for BUY, win = return90d > 0; for SELL, win = return90d < 0.
  const [wins90Buy, buys90Total, wins90Sell, sells90Total] = await Promise.all([
    prisma.backtestResult.count({ where: { ...where, direction: "BUY",  return90d: { gt: 0 } } }),
    prisma.backtestResult.count({ where: { ...where, direction: "BUY",  return90d: { not: null } } }),
    prisma.backtestResult.count({ where: { ...where, direction: "SELL", return90d: { lt: 0 } } }),
    prisma.backtestResult.count({ where: { ...where, direction: "SELL", return90d: { not: null } } }),
  ]);

  return NextResponse.json(
    withMeta(
      {
        filters: { direction: direction || "ALL", minScore, from: fromStr, to: toStr },
        total,
        byDirection: Object.fromEntries(winStats.map((s) => [s.direction, s._count._all])),
        averageReturnsPct: {
          T30:  bucketStats._avg.return30d,
          T60:  bucketStats._avg.return60d,
          T90:  bucketStats._avg.return90d,
          T160: bucketStats._avg.return160d,
          T365: bucketStats._avg.return365d,
          T730: bucketStats._avg.return730d,
        },
        sampleCounts: {
          T30:  bucketStats._count.return30d,
          T60:  bucketStats._count.return60d,
          T90:  bucketStats._count.return90d,
          T160: bucketStats._count.return160d,
          T365: bucketStats._count.return365d,
          T730: bucketStats._count.return730d,
        },
        winRates90d: {
          BUY:  buys90Total  ? wins90Buy  / buys90Total  : null,
          SELL: sells90Total ? wins90Sell / sells90Total : null,
        },
      },
      { startedAt: ctx.startedAt, dataFreshness: freshness({ lastComputation: lastBt?.computedAt }) }
    )
  );
}
