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

  const insider = await prisma.insider.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!insider) return errorJson(404, "insider_not_found", `Aucun dirigeant avec le slug '${slug}'.`);

  const [total, decls] = await Promise.all([
    prisma.declaration.count({ where: { insiderId: insider.id, type: "DIRIGEANTS" } }),
    prisma.declaration.findMany({
      where: { insiderId: insider.id, type: "DIRIGEANTS" },
      orderBy: { pubDate: "desc" },
      take: limit,
      skip: offset,
      select: {
        amfId: true, pubDate: true, transactionDate: true, link: true,
        transactionNature: true, instrumentType: true, isin: true,
        unitPrice: true, volume: true, totalAmount: true, currency: true,
        insiderFunction: true,
        pctOfMarketCap: true, signalScore: true, isCluster: true,
        company: { select: { name: true, slug: true, yahooSymbol: true } },
      },
    }),
  ]);

  return NextResponse.json(
    withMeta(
      {
        insider: { name: insider.name, slug: insider.slug },
        total, offset, limit,
        items: decls.map((d) => ({
          amfId: d.amfId,
          pubDate: d.pubDate.toISOString(),
          transactionDate: d.transactionDate?.toISOString() ?? null,
          pdfUrl: d.link,
          company: d.company,
          insider: { function: d.insiderFunction },
          transaction: {
            nature: d.transactionNature,
            instrument: d.instrumentType,
            isin: d.isin,
            unitPrice: d.unitPrice,
            volume: d.volume,
            totalAmount: d.totalAmount,
            currency: d.currency,
          },
          signal: {
            score: d.signalScore,
            pctOfMarketCap: d.pctOfMarketCap,
            isCluster: d.isCluster,
          },
        })),
      },
      { startedAt: ctx.startedAt, dataFreshness: freshness({ latestDeclaration: decls[0]?.pubDate }) }
    )
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
