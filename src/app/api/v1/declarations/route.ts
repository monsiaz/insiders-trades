import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const limit     = clamp(Number(url.searchParams.get("limit") ?? 50), 1, 200);
  const offset    = Math.max(0, Number(url.searchParams.get("offset") ?? 0));
  const fromStr   = url.searchParams.get("from"); // ISO date
  const toStr     = url.searchParams.get("to");
  const minScore  = url.searchParams.get("minScore");
  const maxScore  = url.searchParams.get("maxScore");
  const direction = (url.searchParams.get("direction") ?? "").toUpperCase();
  const cluster   = url.searchParams.get("cluster");
  const minAmount = url.searchParams.get("minAmount");
  const companyQ  = url.searchParams.get("company");
  const insiderQ  = url.searchParams.get("insider");
  const isin      = url.searchParams.get("isin");
  const sort      = url.searchParams.get("sort") ?? "pubDate"; // pubDate | signalScore | amount
  const order     = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  const where: Record<string, unknown> = { type: "DIRIGEANTS", pdfParsed: true };

  if (fromStr) where.pubDate = { ...(where.pubDate as object ?? {}), gte: new Date(fromStr) };
  if (toStr)   where.pubDate = { ...(where.pubDate as object ?? {}), lte: new Date(toStr) };
  if (minScore) where.signalScore = { ...(where.signalScore as object ?? {}), gte: Number(minScore) };
  if (maxScore) where.signalScore = { ...(where.signalScore as object ?? {}), lte: Number(maxScore) };
  if (direction === "BUY")  where.transactionNature = { contains: "Acquisition", mode: "insensitive" };
  if (direction === "SELL") where.transactionNature = { contains: "Cession",     mode: "insensitive" };
  if (cluster === "true")   where.isCluster = true;
  if (cluster === "false")  where.isCluster = false;
  if (minAmount)            where.totalAmount = { gte: Number(minAmount) };
  if (isin)                 where.isin = isin;
  if (companyQ)             where.company = { name: { contains: companyQ, mode: "insensitive" } };
  if (insiderQ)             where.insiderName = { contains: insiderQ, mode: "insensitive" };

  const orderBy: Record<string, "asc" | "desc"> =
    sort === "signalScore" ? { signalScore: order } :
    sort === "amount" ? { totalAmount: order } :
    { pubDate: order };

  const [total, decls] = await Promise.all([
    prisma.declaration.count({ where }),
    prisma.declaration.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
      select: {
        amfId: true, pubDate: true, transactionDate: true, link: true,
        transactionNature: true, instrumentType: true, isin: true,
        unitPrice: true, volume: true, totalAmount: true, currency: true,
        insiderName: true, insiderFunction: true,
        pctOfMarketCap: true, pctOfInsiderFlow: true, signalScore: true, isCluster: true, scoredAt: true,
        company: { select: { name: true, slug: true, yahooSymbol: true, marketCap: true } },
        insider: { select: { name: true, slug: true } },
      },
    }),
  ]);

  return NextResponse.json(
    withMeta(
      {
        total, offset, limit,
        items: decls.map((d) => ({
          amfId: d.amfId,
          pubDate: d.pubDate.toISOString(),
          transactionDate: d.transactionDate?.toISOString() ?? null,
          pdfUrl: d.link,
          company: {
            name: d.company.name,
            slug: d.company.slug,
            yahooSymbol: d.company.yahooSymbol,
            marketCap: d.company.marketCap ? Number(d.company.marketCap) : null,
          },
          insider: {
            name: d.insiderName,
            slug: d.insider?.slug ?? null,
            function: d.insiderFunction,
          },
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
            pctOfInsiderFlow: d.pctOfInsiderFlow,
            isCluster: d.isCluster,
            scoredAt: d.scoredAt?.toISOString() ?? null,
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
