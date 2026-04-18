import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAndStoreFinancials } from "@/lib/financials";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  const symbol = searchParams.get("symbol");
  const refresh = searchParams.get("refresh") === "1";

  if (!companyId && !symbol) {
    return NextResponse.json({ error: "companyId or symbol required" }, { status: 400 });
  }

  try {
    // Resolve symbol from DB if companyId given
    let resolvedSymbol = symbol;
    let resolvedCompanyId = companyId;

    if (companyId && !symbol) {
      const co = await prisma.company.findUnique({
        where: { id: companyId },
        select: {
          yahooSymbol: true, isin: true, name: true,
          // Return cached data if fresh (< 24h) and refresh not forced
          financialsAt: true,
          marketCap: true, revenue: true, netIncome: true, ebitda: true,
          totalDebt: true, freeCashFlow: true, grossProfit: true, dilutedEps: true,
          fiscalYearEnd: true, currentPrice: true,
          trailingPE: true, forwardPE: true, priceToBook: true, beta: true,
          debtToEquity: true, returnOnEquity: true, returnOnAssets: true,
          profitMargin: true, heldByInsiders: true, heldByInstitutions: true,
          shortRatio: true, analystReco: true, analystScore: true,
          targetMean: true, targetHigh: true, targetLow: true, numAnalysts: true,
          sharesOut: true, analystAt: true,
        },
      });

      if (!co) return NextResponse.json({ error: "Company not found" }, { status: 404 });

      // Return cached if fresh and not forced refresh
      const cutoff = new Date(Date.now() - 24 * 3600_000);
      if (!refresh && co.financialsAt && co.financialsAt > cutoff) {
        return NextResponse.json(
          { ...serializeCompany(co), symbol: co.yahooSymbol, fetchedAt: co.financialsAt, source: ["cache"], cached: true },
          { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } }
        );
      }

      resolvedSymbol = co.yahooSymbol;
      if (!resolvedSymbol) {
        // Try to resolve from ISIN / name
        const { resolveAndCache } = await import("@/lib/financials");
        resolvedSymbol = await resolveAndCache(co.isin, co.name, companyId);
      }
      if (!resolvedSymbol) {
        return NextResponse.json({ error: "Yahoo symbol not found", isin: co.isin }, { status: 404 });
      }
    }

    if (!resolvedSymbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }

    const fin = await fetchAndStoreFinancials(resolvedSymbol, resolvedCompanyId ?? undefined);
    return NextResponse.json(fin, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Serialize BigInt fields for JSON
function serializeCompany(co: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(co)) {
    out[k] = typeof v === "bigint" ? Number(v) : v;
  }
  return out;
}
