import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness, errorJson } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const { slug } = await params;

  const company = await prisma.company.findUnique({
    where: { slug },
    select: {
      name: true, slug: true, isin: true, market: true, description: true, yahooSymbol: true,
      marketCap: true, sharesOut: true, revenue: true, grossProfit: true, ebitda: true,
      netIncome: true, totalDebt: true, freeCashFlow: true, dilutedEps: true, fiscalYearEnd: true,
      trailingPE: true, forwardPE: true, priceToBook: true, beta: true, debtToEquity: true,
      returnOnEquity: true, returnOnAssets: true, profitMargin: true,
      heldByInsiders: true, heldByInstitutions: true, shortRatio: true,
      analystReco: true, analystScore: true, targetMean: true, targetHigh: true, targetLow: true, numAnalysts: true,
      currentPrice: true, fiftyTwoWeekHigh: true, fiftyTwoWeekLow: true,
      fiftyDayAverage: true, twoHundredDayAverage: true, dividendYield: true,
      logoUrl: true, logoSource: true,
      priceAt: true, financialsAt: true, analystAt: true,
      _count: { select: { declarations: true, insiders: true } },
    },
  });

  if (!company) return errorJson(404, "company_not_found", `Aucune société avec le slug '${slug}'.`);

  return NextResponse.json(
    withMeta(
      {
        ...company,
        marketCap:   company.marketCap   ? Number(company.marketCap) : null,
        sharesOut:   company.sharesOut   ? Number(company.sharesOut) : null,
        revenue:     company.revenue     ? Number(company.revenue) : null,
        grossProfit: company.grossProfit ? Number(company.grossProfit) : null,
        ebitda:      company.ebitda      ? Number(company.ebitda) : null,
        netIncome:   company.netIncome   ? Number(company.netIncome) : null,
        totalDebt:   company.totalDebt   ? Number(company.totalDebt) : null,
        freeCashFlow: company.freeCashFlow ? Number(company.freeCashFlow) : null,
        declarationsCount: company._count.declarations,
        insidersCount: company._count.insiders,
        priceAt: company.priceAt?.toISOString() ?? null,
        financialsAt: company.financialsAt?.toISOString() ?? null,
        analystAt: company.analystAt?.toISOString() ?? null,
      },
      {
        startedAt: ctx.startedAt,
        dataFreshness: freshness({ priceAt: company.priceAt, financialsAt: company.financialsAt, analystAt: company.analystAt }),
      }
    )
  );
}
