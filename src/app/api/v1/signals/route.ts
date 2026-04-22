import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/signals
 *   ?direction=BUY|SELL         (default BUY)
 *   &lookbackDays=7              (1..90)
 *   &minScore=40
 *   &limit=20                    (1..100)
 *
 * Returns top-scored declarations matching the filter, newest first.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const direction = (url.searchParams.get("direction") ?? "BUY").toUpperCase();
  const lookbackDays = clamp(Number(url.searchParams.get("lookbackDays") ?? 7), 1, 90);
  const minScore = Math.max(0, Number(url.searchParams.get("minScore") ?? 40));
  const limit = clamp(Number(url.searchParams.get("limit") ?? 20), 1, 100);

  const since = new Date(Date.now() - lookbackDays * 86400_000);
  const whereDirection = direction === "SELL"
    ? { transactionNature: { contains: "Cession", mode: "insensitive" as const } }
    : { transactionNature: { contains: "Acquisition", mode: "insensitive" as const } };

  const decls = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      pdfParsed: true,
      pubDate: { gte: since },
      signalScore: { gte: minScore },
      ...whereDirection,
    },
    orderBy: { signalScore: "desc" },
    take: limit,
    select: {
      amfId: true, pubDate: true, transactionNature: true,
      insiderName: true, insiderFunction: true,
      totalAmount: true, pctOfMarketCap: true,
      signalScore: true, isCluster: true,
      link: true,
      company: { select: { name: true, slug: true, yahooSymbol: true, marketCap: true, currentPrice: true, logoUrl: true } },
    },
  });

  return NextResponse.json(
    withMeta(
      {
        direction,
        lookbackDays,
        minScore,
        count: decls.length,
        items: decls.map((d) => ({
          amfId: d.amfId,
          pubDate: d.pubDate.toISOString(),
          company: {
            name: d.company.name,
            slug: d.company.slug,
            yahooSymbol: d.company.yahooSymbol,
            marketCap: d.company.marketCap ? Number(d.company.marketCap) : null,
            currentPrice: d.company.currentPrice,
            logoUrl: d.company.logoUrl,
          },
          insider: { name: d.insiderName, function: d.insiderFunction },
          transaction: { nature: d.transactionNature, amount: d.totalAmount },
          signal: {
            score: d.signalScore,
            pctOfMarketCap: d.pctOfMarketCap,
            isCluster: d.isCluster,
          },
          pdfUrl: d.link,
        })),
      },
      { startedAt: ctx.startedAt, dataFreshness: freshness({ latestSignal: decls[0]?.pubDate }) }
    )
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
