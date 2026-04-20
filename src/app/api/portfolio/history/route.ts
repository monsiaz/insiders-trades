/**
 * GET /api/portfolio/history?period=3M
 * Returns a daily equity curve for the authenticated user's portfolio.
 * Fetches Yahoo Finance history for each position and computes daily portfolio value.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const PERIOD_DAYS: Record<string, number> = {
  "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, "MAX": 1460
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124";

async function fetchYahooPrices(symbol: string, days: number): Promise<Map<string, number>> {
  const rangeMap: Record<number, string> = { 7: "7d", 30: "1mo", 90: "3mo", 180: "6mo", 365: "1y", 1460: "5y" };
  const range = rangeMap[days] ?? "3mo";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return new Map();
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return new Map();

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const map = new Map<string, number>();

    timestamps.forEach((ts, i) => {
      const close = closes[i];
      if (close && close > 0) {
        const date = new Date(ts * 1000).toISOString().slice(0, 10);
        map.set(date, close);
      }
    });
    return map;
  } catch {
    return new Map();
  }
}

function inferSymbol(isin: string | null, yahooSymbol: string | null, name: string): string | null {
  if (yahooSymbol) return yahooSymbol;
  if (!isin) return null;
  // Common French ISIN → Yahoo suffix
  const prefix = isin.slice(0, 2);
  const ticker = isin; // fallback: can't infer without mapping
  if (prefix === "FR") return null; // need yahooSymbol
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const period = req.nextUrl.searchParams.get("period") ?? "3M";
  const days = PERIOD_DAYS[period] ?? 90;

  const positions = await prisma.portfolioPosition.findMany({
    where: { userId: session.userId },
    select: {
      id: true, name: true, isin: true, yahooSymbol: true,
      quantity: true, buyingPrice: true, totalInvested: true,
      currentPrice: true, currentValue: true, pnl: true, pnlPct: true,
    },
  });

  if (!positions.length) {
    return NextResponse.json({ points: [], totalInvested: 0, totalValue: 0, totalPnl: 0, totalPct: 0 });
  }

  const totalInvested = positions.reduce((s, p) => s + p.totalInvested, 0);
  const totalValue    = positions.reduce((s, p) => s + (p.currentValue ?? p.totalInvested), 0);
  const totalPnl      = totalValue - totalInvested;
  const totalPct      = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Fetch history for positions that have a Yahoo symbol
  const priceHistories: { symbol: string; quantity: number; history: Map<string, number> }[] = [];

  await Promise.all(
    positions.map(async (pos) => {
      const symbol = inferSymbol(pos.isin, pos.yahooSymbol, pos.name);
      if (!symbol) return;
      const history = await fetchYahooPrices(symbol, days);
      if (history.size > 0) {
        priceHistories.push({ symbol, quantity: pos.quantity, history });
      }
    })
  );

  // Build daily portfolio value
  // Collect all dates from all histories
  const allDates = new Set<string>();
  priceHistories.forEach(({ history }) => history.forEach((_, d) => allDates.add(d)));

  // Sort dates
  const sortedDates = [...allDates].sort();

  // Positions without history: use current value as constant contribution
  const staticValue = positions
    .filter((p) => {
      const sym = inferSymbol(p.isin, p.yahooSymbol, p.name);
      return !sym || !priceHistories.find((h) => h.symbol === sym);
    })
    .reduce((s, p) => s + (p.currentValue ?? p.totalInvested), 0);

  type DayPoint = { date: string; value: number; invested: number; pnl: number; pct: number };
  const points: DayPoint[] = sortedDates.map((date) => {
    let dynamicValue = staticValue;
    priceHistories.forEach(({ quantity, history }) => {
      const price = history.get(date);
      if (price) dynamicValue += price * quantity;
    });
    return {
      date,
      value: dynamicValue,
      invested: totalInvested,
      pnl: dynamicValue - totalInvested,
      pct: totalInvested > 0 ? ((dynamicValue - totalInvested) / totalInvested) * 100 : 0,
    };
  });

  // If no real history → build interpolated curve
  const finalPoints: DayPoint[] = points.length >= 3 ? points : buildSimulatedCurve(totalInvested, totalValue, days);

  return NextResponse.json({
    points: finalPoints,
    totalInvested,
    totalValue,
    totalPnl,
    totalPct,
    hasRealData: points.length >= 3,
    positions: positions.map((p) => ({
      name: p.name,
      pnl: p.pnl,
      pnlPct: p.pnlPct,
      invested: p.totalInvested,
      value: p.currentValue ?? p.totalInvested,
    })),
  });
}

function buildSimulatedCurve(totalInvested: number, totalValue: number, days: number): {
  date: string; value: number; invested: number; pnl: number; pct: number;
}[] {
  const now = Date.now();
  const actualDays = Math.min(days, 365);
  const totalReturn = totalValue - totalInvested;
  const points = [];

  for (let i = actualDays; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    // Skip weekends
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;

    const progress = 1 - i / actualDays;
    const t = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const dayValue = totalInvested + totalReturn * t;
    const noise = totalInvested * 0.003 * (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * Math.sqrt(Math.max(0.01, progress));
    const finalValue = Math.max(totalInvested * 0.5, dayValue + noise);

    points.push({
      date: d.toISOString().slice(0, 10),
      value: finalValue,
      invested: totalInvested,
      pnl: finalValue - totalInvested,
      pct: ((finalValue - totalInvested) / totalInvested) * 100,
    });
  }
  return points;
}
