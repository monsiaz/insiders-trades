import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";

export const revalidate = 60;

// Cache the expensive DB aggregation server-side so concurrent CDN misses
// don't all hit Postgres simultaneously (thundering herd on revalidation).
const getHomeData = unstable_cache(
  async () => {
    const since90d = new Date(Date.now() - 90 * 86400_000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return _fetchHomeData(since90d, todayStart);
  },
  ["home-data-v1"],
  { revalidate: 60 }
);

async function _fetchHomeData(since90d: Date, todayStart: Date) {
  const [
    totalDeclarations,
    totalCompanies,
    totalInsiders,
    totalBuys,
    totalSells,
    lastDecl,
    todayCount,
    recentDeclarations,
    topCompaniesRaw,
    topInsidersRaw,
  ] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.company.count({ where: { declarations: { some: { type: "DIRIGEANTS" } } } }),
    prisma.insider.count(),
    prisma.declaration.count({
      where: { type: "DIRIGEANTS", transactionNature: { contains: "Acquisition", mode: "insensitive" } },
    }),
    prisma.declaration.count({
      where: { type: "DIRIGEANTS", transactionNature: { contains: "Cession", mode: "insensitive" } },
    }),
    prisma.declaration.findFirst({
      where: { type: "DIRIGEANTS" },
      orderBy: { pubDate: "desc" },
      select: { pubDate: true },
    }),
    prisma.declaration.count({
      where: { type: "DIRIGEANTS", pubDate: { gte: todayStart } },
    }),
    prisma.declaration.findMany({
      where: { type: "DIRIGEANTS" },
      orderBy: { pubDate: "desc" },
      take: 20,
      select: {
        id: true, amfId: true, type: true, pubDate: true, link: true, description: true,
        insiderName: true, insiderFunction: true, transactionNature: true,
        instrumentType: true, isin: true, unitPrice: true, volume: true,
        totalAmount: true, currency: true, transactionDate: true, transactionVenue: true,
        pdfParsed: true, signalScore: true, pctOfMarketCap: true, pctOfInsiderFlow: true,
        company: { select: { name: true, slug: true, logoUrl: true } },
        insider: { select: { name: true, slug: true } },
      },
    }),
    prisma.declaration.groupBy({
      by: ["companyId"],
      where: { type: "DIRIGEANTS", totalAmount: { not: null }, pubDate: { gte: since90d } },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 30,
    }),
    prisma.declaration.groupBy({
      by: ["insiderName"],
      where: { type: "DIRIGEANTS", totalAmount: { not: null }, insiderName: { not: null } },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 30,
    }),
  ]);

  // Resolve company details
  const companyIds = topCompaniesRaw.map((r) => r.companyId);
  const companyDetails = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true, slug: true, marketCap: true, logoUrl: true },
  });
  const companyMap = new Map(companyDetails.map((c) => [c.id, c]));

  const topCompanies = topCompaniesRaw.map((r) => {
    const co = companyMap.get(r.companyId);
    return {
      companyId: r.companyId,
      count: r._count.id,
      totalAmount: r._sum.totalAmount,
      company: co
        ? { name: co.name, slug: co.slug, marketCap: co.marketCap ? Number(co.marketCap) : null, logoUrl: co.logoUrl ?? null }
        : null,
    };
  });

  // Resolve insider slugs
  const insiderNames = topInsidersRaw.map((r) => r.insiderName!).filter(Boolean);
  const insiderDetails = await prisma.insider.findMany({
    where: { name: { in: insiderNames } },
    select: { name: true, slug: true },
  });
  const insiderMap = new Map(insiderDetails.map((i) => [i.name, i]));

  const topInsiders = topInsidersRaw.map((r) => ({
    insiderName: r.insiderName,
    count: r._count.id,
    totalAmount: r._sum.totalAmount,
    insider: insiderMap.get(r.insiderName ?? "") ?? null,
  }));

  return {
    stats: { totalDeclarations, totalCompanies, totalInsiders, totalBuys, totalSells },
    lastAmfDate: lastDecl?.pubDate.toISOString() ?? null,
    todayCount,
    recentDeclarations: recentDeclarations.map((d) => ({
      ...d,
      pubDate: d.pubDate.toISOString(),
      transactionDate: d.transactionDate?.toISOString() ?? null,
    })),
    topCompanies,
    topInsiders,
    updatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const data = await getHomeData();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
  });
}
