import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/search?q=<query>&limit=10
 * Fuzzy-match companies + insiders by name. Up to `limit` per bucket (default 8).
 */
export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = clamp(Number(url.searchParams.get("limit") ?? 8), 1, 50);

  if (q.length < 2) {
    return NextResponse.json(
      withMeta({ query: q, companies: [], insiders: [] }, { startedAt: ctx.startedAt })
    );
  }

  const [companies, insiders] = await Promise.all([
    prisma.company.findMany({
      where: {
        OR: [
          { name:        { contains: q, mode: "insensitive" } },
          { slug:        { contains: q.toLowerCase() } },
          { yahooSymbol: { contains: q, mode: "insensitive" } },
          { isin:        { contains: q, mode: "insensitive" } },
        ],
      },
      take: limit,
      orderBy: [{ marketCap: "desc" }],
      select: { name: true, slug: true, yahooSymbol: true, isin: true, logoUrl: true, marketCap: true, _count: { select: { declarations: true } } },
    }),
    prisma.insider.findMany({
      where: {
        name: { contains: q, mode: "insensitive", not: { contains: "PERSONNE ETROITEMENT" } },
      },
      take: limit,
      orderBy: { name: "asc" },
      select: { name: true, slug: true, _count: { select: { declarations: true } } },
    }),
  ]);

  return NextResponse.json(
    withMeta(
      {
        query: q,
        companies: companies.map((c) => ({
          ...c,
          marketCap: c.marketCap ? Number(c.marketCap) : null,
          declarationsCount: c._count.declarations,
        })),
        insiders: insiders.map((i) => ({
          ...i,
          declarationsCount: i._count.declarations,
        })),
      },
      { startedAt: ctx.startedAt }
    )
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
