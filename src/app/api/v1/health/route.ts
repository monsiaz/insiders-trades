import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const [lastDecl, lastCreate, lastScore, lastBt, lastFin, lastPrice] = await Promise.all([
    prisma.declaration.findFirst({ where: { type: "DIRIGEANTS" }, orderBy: { pubDate: "desc" }, select: { pubDate: true } }),
    prisma.declaration.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.declaration.findFirst({ where: { scoredAt: { not: null } }, orderBy: { scoredAt: "desc" }, select: { scoredAt: true } }),
    prisma.backtestResult.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.company.findFirst({ where: { financialsAt: { not: null } }, orderBy: { financialsAt: "desc" }, select: { financialsAt: true } }),
    prisma.company.findFirst({ where: { priceAt: { not: null } }, orderBy: { priceAt: "desc" }, select: { priceAt: true } }),
  ]);

  const t0 = Date.now();
  await prisma.$queryRaw`SELECT 1`; // ping DB for latency
  const dbLatencyMs = Date.now() - t0;

  return NextResponse.json(
    withMeta(
      {
        status: "ok",
        database: { reachable: true, latencyMs: dbLatencyMs },
        lastAmfPublicationAt: lastDecl?.pubDate?.toISOString() ?? null,
        lastIngestAt: lastCreate?.createdAt?.toISOString() ?? null,
        lastScoringAt: lastScore?.scoredAt?.toISOString() ?? null,
        lastBacktestAt: lastBt?.computedAt?.toISOString() ?? null,
        lastFinancialsAt: lastFin?.financialsAt?.toISOString() ?? null,
        lastPriceAt: lastPrice?.priceAt?.toISOString() ?? null,
      },
      {
        startedAt: ctx.startedAt,
        dataFreshness: freshness({
          declarations: lastDecl?.pubDate,
          ingest: lastCreate?.createdAt,
          scoring: lastScore?.scoredAt,
          backtest: lastBt?.computedAt,
          financials: lastFin?.financialsAt,
          prices: lastPrice?.priceAt,
        }),
      }
    )
  );
}
