import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness, errorJson } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ amfId: string }> }) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const { amfId } = await params;

  const d = await prisma.declaration.findUnique({
    where: { amfId },
    select: {
      amfId: true, type: true, pubDate: true, link: true, description: true,
      transactionDate: true, transactionNature: true, instrumentType: true, isin: true,
      unitPrice: true, volume: true, totalAmount: true, currency: true,
      transactionVenue: true, pdfParsed: true, pdfUrl: true,
      insiderName: true, insiderFunction: true,
      pctOfMarketCap: true, pctOfInsiderFlow: true, insiderCumNet: true,
      signalScore: true, isCluster: true, scoredAt: true,
      createdAt: true, updatedAt: true,
      company: { select: { name: true, slug: true, yahooSymbol: true, marketCap: true } },
      insider: { select: { name: true, slug: true } },
      backtestResult: {
        select: {
          direction: true, priceAtTrade: true,
          price30d: true, price60d: true, price90d: true, price160d: true, price365d: true, price730d: true,
          return30d: true, return60d: true, return90d: true, return160d: true, return365d: true, return730d: true,
          computedAt: true,
        },
      },
    },
  });

  if (!d) return errorJson(404, "declaration_not_found", `Aucune déclaration avec amfId '${amfId}'.`);

  return NextResponse.json(
    withMeta(
      {
        amfId: d.amfId,
        type: d.type,
        pubDate: d.pubDate.toISOString(),
        transactionDate: d.transactionDate?.toISOString() ?? null,
        description: d.description,
        pdfUrl: d.link,
        pdfParsed: d.pdfParsed,
        company: {
          ...d.company,
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
          venue: d.transactionVenue,
        },
        signal: {
          score: d.signalScore,
          pctOfMarketCap: d.pctOfMarketCap,
          pctOfInsiderFlow: d.pctOfInsiderFlow,
          insiderCumNet: d.insiderCumNet,
          isCluster: d.isCluster,
          scoredAt: d.scoredAt?.toISOString() ?? null,
        },
        backtest: d.backtestResult
          ? { ...d.backtestResult, computedAt: d.backtestResult.computedAt.toISOString() }
          : null,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      },
      { startedAt: ctx.startedAt, dataFreshness: freshness({ pubDate: d.pubDate, scoredAt: d.scoredAt, backtestAt: d.backtestResult?.computedAt }) }
    )
  );
}
