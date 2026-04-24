import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import yahooFinance from "yahoo-finance2";

async function resolveSymbol(name: string, isin: string | null): Promise<string | null> {
  // 1. Try ISIN search
  if (isin) {
    try {
      const res = await yahooFinance.search(isin, {}, { validateResult: false });
      const quote = (res.quotes ?? []).find((q: { quoteType?: string }) => q.quoteType === "EQUITY");
      if (quote?.symbol) return quote.symbol;
    } catch {/* ignore */}
  }
  // 2. Try name search
  try {
    const res = await yahooFinance.search(name, {}, { validateResult: false });
    const quote = (res.quotes ?? []).find((q: { quoteType?: string; symbol?: string }) => q.quoteType === "EQUITY");
    if (quote?.symbol) return quote.symbol;
  } catch {/* ignore */}
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const positions = await prisma.portfolioPosition.findMany({
    where: { userId: session.userId },
  });

  const updated: string[] = [];
  const failed: string[] = [];

  for (const pos of positions) {
    try {
      // Crowdfunding / Bond: recalculate accrued interest (no Yahoo needed)
      if (pos.assetType === "CROWDFUNDING" || pos.assetType === "BOND") {
        if (pos.annualYield && pos.yieldStartDate) {
          const daysElapsed = (Date.now() - pos.yieldStartDate.getTime()) / 86400_000;
          const currentValue = Math.round(pos.totalInvested * (1 + (pos.annualYield / 100) * (daysElapsed / 365)) * 100) / 100;
          const pnl = Math.round((currentValue - pos.totalInvested) * 100) / 100;
          const pnlPct = (pnl / pos.totalInvested) * 100;
          await prisma.portfolioPosition.update({
            where: { id: pos.id },
            data: { currentValue, pnl, pnlPct, lastUpdated: new Date() },
          });
          updated.push(pos.name);
        }
        continue;
      }

      let symbol = pos.yahooSymbol;

      if (!symbol) {
        symbol = await resolveSymbol(pos.name, pos.isin);
        if (symbol) {
          await prisma.portfolioPosition.update({ where: { id: pos.id }, data: { yahooSymbol: symbol } });
        }
      }

      if (!symbol) {
        failed.push(pos.name);
        continue;
      }

      const quote = await yahooFinance.quote(symbol, {}, { validateResult: false });
      const price = quote.regularMarketPrice ?? null;

      if (!price) {
        failed.push(pos.name);
        continue;
      }

      const currentValue = pos.quantity * price;
      const pnl = currentValue - pos.totalInvested;
      const pnlPct = (pnl / pos.totalInvested) * 100;

      await prisma.portfolioPosition.update({
        where: { id: pos.id },
        data: { currentPrice: price, currentValue, pnl, pnlPct, lastUpdated: new Date(), yahooSymbol: symbol },
      });

      updated.push(pos.name);
    } catch (e) {
      console.warn(`[refresh] ${pos.name}: ${String(e)}`);
      failed.push(pos.name);
    }
  }

  return NextResponse.json({ ok: true, updated: updated.length, failed });
}
