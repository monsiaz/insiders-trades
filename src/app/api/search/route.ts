import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!q || q.length < 2) {
    return NextResponse.json({ companies: [], insiders: [] }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  }

  const [companies, insiders] = await Promise.all([
    prisma.company.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: {
        name: true,
        slug: true,
        marketCap: true,
        yahooSymbol: true,
        currentPrice: true,
        _count: { select: { declarations: { where: { type: "DIRIGEANTS" } } } },
      },
      orderBy: { declarations: { _count: "desc" } },
      take: 6,
    }),
    prisma.insider.findMany({
      where: {
        name: {
          contains: q,
          mode: "insensitive",
          not: { contains: "PERSONNE ETROITEMENT" },
        },
      },
      select: {
        name: true,
        slug: true,
        _count: { select: { declarations: { where: { type: "DIRIGEANTS" } } } },
      },
      orderBy: { declarations: { _count: "desc" } },
      take: 6,
    }),
  ]);

  return NextResponse.json(
    {
      companies: companies.map((c) => ({
        name: c.name,
        slug: c.slug,
        yahooSymbol: c.yahooSymbol,
        currentPrice: c.currentPrice,
        marketCap: c.marketCap ? Number(c.marketCap) : null,
        declarationCount: c._count.declarations,
      })),
      insiders: insiders
        .filter((i) => !i.name.toUpperCase().includes("PERSONNE ETROITEMENT"))
        .map((i) => ({
          name: i.name,
          slug: i.slug,
          declarationCount: i._count.declarations,
        })),
    },
    { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } }
  );
}
