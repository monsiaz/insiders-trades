import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const now = new Date();
  const d1 = new Date(now.getTime() - 86400_000);
  const d7 = new Date(now.getTime() - 7 * 86400_000);
  const d30 = new Date(now.getTime() - 30 * 86400_000);

  const [
    totalDecls, declTypeDirigeants, decl24h, decl7d, decl30d,
    companies, companiesEnriched, insiders,
    backtests, btWithReturn90,
    lastDecl, lastScore, lastBt,
    avgScore,
  ] = await Promise.all([
    prisma.declaration.count(),
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.declaration.count({ where: { pubDate: { gte: d1 } } }),
    prisma.declaration.count({ where: { pubDate: { gte: d7 } } }),
    prisma.declaration.count({ where: { pubDate: { gte: d30 } } }),
    prisma.company.count(),
    prisma.company.count({ where: { marketCap: { not: null } } }),
    prisma.insider.count(),
    prisma.backtestResult.count(),
    prisma.backtestResult.count({ where: { return90d: { not: null } } }),
    prisma.declaration.findFirst({ where: { type: "DIRIGEANTS" }, orderBy: { pubDate: "desc" }, select: { pubDate: true } }),
    prisma.declaration.findFirst({ where: { scoredAt: { not: null } }, orderBy: { scoredAt: "desc" }, select: { scoredAt: true } }),
    prisma.backtestResult.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.declaration.aggregate({ where: { signalScore: { not: null } }, _avg: { signalScore: true } }),
  ]);

  return NextResponse.json(
    withMeta(
      {
        declarations: {
          total: totalDecls,
          typeDirigeants: declTypeDirigeants,
          last24h: decl24h,
          last7d: decl7d,
          last30d: decl30d,
          avgSignalScore: avgScore._avg.signalScore,
        },
        companies: {
          total: companies,
          enriched: companiesEnriched,
          enrichedPct: Math.round((companiesEnriched / Math.max(1, companies)) * 100),
        },
        insiders: { total: insiders },
        backtests: {
          total: backtests,
          withReturn90d: btWithReturn90,
        },
      },
      {
        startedAt: ctx.startedAt,
        dataFreshness: freshness({
          declarations: lastDecl?.pubDate,
          scoring: lastScore?.scoredAt,
          backtest: lastBt?.computedAt,
        }),
      }
    )
  );
}
