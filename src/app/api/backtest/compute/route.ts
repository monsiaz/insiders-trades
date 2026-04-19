/**
 * POST /api/backtest/compute
 * Fetches Yahoo Finance historical prices for insider buy declarations
 * and stores return metrics in BacktestResult table.
 * Rate-limit friendly: 200ms between requests.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

interface YahooChartResult {
  meta: { regularMarketPrice: number; currency: string };
  timestamp: number[];
  indicators: { quote: Array<{ close: (number | null)[] }> };
}

/** Fetch daily close prices for a Yahoo symbol, range 2y */
async function fetchYahooChart(
  symbol: string
): Promise<Array<{ ts: number; close: number }>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y&includePrePost=false`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const result: YahooChartResult = data?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp ?? [];
  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const out: Array<{ ts: number; close: number }> = [];

  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c != null && c > 0) out.push({ ts: timestamps[i] * 1000, close: c });
  }
  return out;
}

/** Find the closest price on or after targetTs within maxDays */
function priceNear(
  points: Array<{ ts: number; close: number }>,
  targetTs: number,
  maxDays = 10
): number | null {
  const maxDelta = maxDays * 86400_000;
  let best: number | null = null;
  let bestDelta = Infinity;

  for (const p of points) {
    const delta = p.ts - targetTs;
    if (delta >= 0 && delta < maxDelta && delta < bestDelta) {
      best = p.close;
      bestDelta = delta;
    }
  }
  return best;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const limit: number = Math.min(body?.limit ?? 100, 500);

  // Fetch declarations eligible for backtesting that don't have results yet
  const declarations = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      transactionNature: { contains: "Acquisition", mode: "insensitive" },
      transactionDate: { not: null },
      isin: { not: null },
      totalAmount: { gt: 0 },
      backtestResult: null,
      company: { yahooSymbol: { not: null } },
    },
    take: limit,
    orderBy: { transactionDate: "desc" },
    select: {
      id: true,
      transactionDate: true,
      company: { select: { yahooSymbol: true } },
    },
  });

  console.log(`[backtest] processing ${declarations.length} declarations`);

  let computed = 0;
  let errors = 0;

  for (const decl of declarations) {
    const symbol = decl.company.yahooSymbol!;
    const tradeDate = decl.transactionDate!;
    const tradeDateTs = tradeDate.getTime();

    try {
      const points = await fetchYahooChart(symbol);
      if (points.length === 0) {
        errors++;
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      const priceAtTrade = priceNear(points, tradeDateTs, 10);
      if (!priceAtTrade) {
        errors++;
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }

      const price30d = priceNear(points, tradeDateTs + 30 * 86400_000, 10);
      const price60d = priceNear(points, tradeDateTs + 60 * 86400_000, 10);
      const price90d = priceNear(points, tradeDateTs + 90 * 86400_000, 10);
      const price180d = priceNear(points, tradeDateTs + 180 * 86400_000, 10);

      const ret = (p: number | null) =>
        p != null ? ((p - priceAtTrade) / priceAtTrade) * 100 : null;

      await prisma.backtestResult.upsert({
        where: { declarationId: decl.id },
        create: {
          declarationId: decl.id,
          priceAtTrade,
          price30d,
          price60d,
          price90d,
          price180d,
          return30d: ret(price30d),
          return60d: ret(price60d),
          return90d: ret(price90d),
          return180d: ret(price180d),
        },
        update: {
          priceAtTrade,
          price30d,
          price60d,
          price90d,
          price180d,
          return30d: ret(price30d),
          return60d: ret(price60d),
          return90d: ret(price90d),
          return180d: ret(price180d),
          computedAt: new Date(),
        },
      });

      computed++;
    } catch (err) {
      console.error(`[backtest] error for ${symbol}:`, err);
      errors++;
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({
    ok: true,
    computed,
    errors,
    total: declarations.length,
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const total = await prisma.backtestResult.count();
  const pending = await prisma.declaration.count({
    where: {
      type: "DIRIGEANTS",
      transactionNature: { contains: "Acquisition", mode: "insensitive" },
      transactionDate: { not: null },
      isin: { not: null },
      totalAmount: { gt: 0 },
      backtestResult: null,
      company: { yahooSymbol: { not: null } },
    },
  });
  return NextResponse.json({ total, pending });
}
