import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness, errorJson } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const isin = url.searchParams.get("isin")?.trim() ?? "";
  const market = url.searchParams.get("market")?.trim() ?? "";
  const hasLogo = url.searchParams.get("hasLogo");
  const limit = clamp(Number(url.searchParams.get("limit") ?? 50), 1, 200);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const sort = url.searchParams.get("sort") ?? "name"; // name | marketCap | recent
  const order = url.searchParams.get("order") === "desc" ? "desc" : "asc";

  const where: Record<string, unknown> = {};
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (isin) where.isin = isin;
  if (market) where.market = { contains: market, mode: "insensitive" };
  if (hasLogo === "true") where.logoUrl = { not: null };
  if (hasLogo === "false") where.logoUrl = null;

  let orderBy: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[] = { name: order };
  if (sort === "marketCap") orderBy = { marketCap: order };
  if (sort === "recent") orderBy = { updatedAt: order };

  const [total, items] = await Promise.all([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy,
      select: {
        name: true,
        slug: true,
        isin: true,
        market: true,
        yahooSymbol: true,
        marketCap: true,
        currentPrice: true,
        trailingPE: true,
        analystReco: true,
        targetMean: true,
        logoUrl: true,
        priceAt: true,
        financialsAt: true,
        _count: { select: { declarations: true } },
      },
    }),
  ]);

  return NextResponse.json(
    withMeta(
      {
        total,
        offset,
        limit,
        items: items.map((c) => ({
          name: c.name,
          slug: c.slug,
          isin: c.isin,
          market: c.market,
          yahooSymbol: c.yahooSymbol,
          marketCap: c.marketCap ? Number(c.marketCap) : null,
          currentPrice: c.currentPrice,
          trailingPE: c.trailingPE,
          analystReco: c.analystReco,
          targetMean: c.targetMean,
          logoUrl: c.logoUrl,
          declarationsCount: c._count.declarations,
          priceAt: c.priceAt?.toISOString() ?? null,
          financialsAt: c.financialsAt?.toISOString() ?? null,
        })),
      },
      { startedAt: ctx.startedAt, dataFreshness: freshness({ priceAt: items[0]?.priceAt, financialsAt: items[0]?.financialsAt }) }
    )
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// Expose error helper for type-narrowing elsewhere
export { errorJson };
