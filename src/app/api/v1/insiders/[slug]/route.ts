import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness, errorJson } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const { slug } = await params;

  const insider = await prisma.insider.findUnique({
    where: { slug },
    select: {
      name: true, slug: true, gender: true, createdAt: true,
      companies: {
        select: {
          function: true,
          company: { select: { name: true, slug: true, yahooSymbol: true, marketCap: true } },
        },
      },
      _count: { select: { declarations: true } },
    },
  });

  if (!insider) return errorJson(404, "insider_not_found", `Aucun dirigeant avec le slug '${slug}'.`);

  const [lastDecl, aggScore] = await Promise.all([
    prisma.declaration.findFirst({
      where: { insider: { slug } },
      orderBy: { pubDate: "desc" },
      select: { pubDate: true },
    }),
    prisma.declaration.aggregate({
      where: { insider: { slug }, signalScore: { not: null } },
      _avg: { signalScore: true },
      _max: { signalScore: true },
    }),
  ]);

  return NextResponse.json(
    withMeta(
      {
        name: insider.name,
        slug: insider.slug,
        gender: insider.gender,
        createdAt: insider.createdAt.toISOString(),
        declarationsCount: insider._count.declarations,
        companies: insider.companies.map((c) => ({
          function: c.function,
          company: {
            name: c.company.name,
            slug: c.company.slug,
            yahooSymbol: c.company.yahooSymbol,
            marketCap: c.company.marketCap ? Number(c.company.marketCap) : null,
          },
        })),
        stats: {
          avgScore: aggScore._avg.signalScore,
          maxScore: aggScore._max.signalScore,
        },
      },
      { startedAt: ctx.startedAt, dataFreshness: freshness({ lastDeclaration: lastDecl?.pubDate }) }
    )
  );
}
