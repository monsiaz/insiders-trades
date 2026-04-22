import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness, errorJson } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const { slug } = await params;
  const url = new URL(req.url);
  const limit = clamp(Number(url.searchParams.get("limit") ?? 50), 1, 200);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const minScore = Number(url.searchParams.get("minScore") ?? 0);
  const direction = (url.searchParams.get("direction") ?? "").toUpperCase();

  const company = await prisma.company.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!company) return errorJson(404, "company_not_found", `Aucune société avec le slug '${slug}'.`);

  const whereDirection =
    direction === "BUY"
      ? { transactionNature: { contains: "Acquisition", mode: "insensitive" as const } }
      : direction === "SELL"
      ? { transactionNature: { contains: "Cession", mode: "insensitive" as const } }
      : {};
  const whereScore = minScore > 0 ? { signalScore: { gte: minScore } } : {};

  const [total, decls, latest] = await Promise.all([
    prisma.declaration.count({ where: { companyId: company.id, type: "DIRIGEANTS", ...whereDirection, ...whereScore } }),
    prisma.declaration.findMany({
      where: { companyId: company.id, type: "DIRIGEANTS", ...whereDirection, ...whereScore },
      orderBy: { pubDate: "desc" },
      take: limit,
      skip: offset,
      select: {
        amfId: true, pubDate: true, link: true,
        transactionDate: true, transactionNature: true, instrumentType: true,
        insiderName: true, insiderFunction: true,
        isin: true, unitPrice: true, volume: true, totalAmount: true, currency: true,
        transactionVenue: true,
        pctOfMarketCap: true, pctOfInsiderFlow: true, insiderCumNet: true,
        signalScore: true, isCluster: true, scoredAt: true,
      },
    }),
    prisma.declaration.findFirst({ where: { companyId: company.id }, orderBy: { pubDate: "desc" }, select: { pubDate: true } }),
  ]);

  return NextResponse.json(
    withMeta(
      {
        company: { name: company.name, slug: company.slug },
        total, offset, limit,
        items: decls.map((d) => ({
          amfId: d.amfId,
          pubDate: d.pubDate.toISOString(),
          transactionDate: d.transactionDate?.toISOString() ?? null,
          pdfUrl: d.link,
          transaction: {
            nature: d.transactionNature,
            instrument: d.instrumentType,
            isin: d.isin,
            unitPrice: d.unitPrice,
            volume: d.volume,
            totalAmount: d.totalAmount,
            currency: d.currency,
            venue: d.transactionVenue,
          },
          insider: {
            name: d.insiderName,
            function: d.insiderFunction,
          },
          signal: {
            score: d.signalScore,
            pctOfMarketCap: d.pctOfMarketCap,
            pctOfInsiderFlow: d.pctOfInsiderFlow,
            insiderCumNet: d.insiderCumNet,
            isCluster: d.isCluster,
            scoredAt: d.scoredAt?.toISOString() ?? null,
          },
        })),
      },
      { startedAt: ctx.startedAt, dataFreshness: freshness({ latestDeclaration: latest?.pubDate }) }
    )
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
