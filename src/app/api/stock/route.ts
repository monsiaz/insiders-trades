import { NextRequest, NextResponse } from "next/server";

export const revalidate = 3600; // Cache for 1 hour

interface StockPoint {
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

interface YahooChartResult {
  meta: {
    symbol: string;
    regularMarketPrice: number;
    previousClose: number;
    currency: string;
    longName?: string;
  };
  timestamp: number[];
  indicators: {
    quote: Array<{
      close: (number | null)[];
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      volume?: (number | null)[];
    }>;
  };
}

// Map ISIN prefix + common French companies to Yahoo tickers
function isinToYahooSuffix(isin: string): string {
  if (isin.startsWith("FR")) return ".PA";
  if (isin.startsWith("NL")) return ".AS";
  if (isin.startsWith("DE")) return ".DE";
  if (isin.startsWith("GB")) return ".L";
  if (isin.startsWith("IT")) return ".MI";
  if (isin.startsWith("ES")) return ".MC";
  if (isin.startsWith("BE")) return ".BR";
  if (isin.startsWith("LU")) return ".PA"; // Many Luxembourg-registered French companies
  return ".PA"; // Default to Paris
}

async function searchYahooSymbol(query: string): Promise<string | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=fr&region=FR&quotesCount=5`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const quotes = data?.quotes || [];
    // Prefer equity type
    const equity = quotes.find((q: { quoteType?: string; symbol?: string }) => q.quoteType === "EQUITY" && q.symbol);
    return equity?.symbol ?? quotes[0]?.symbol ?? null;
  } catch {
    return null;
  }
}

async function fetchYahooChart(symbol: string, range = "6mo"): Promise<StockPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return [];
  const data = await res.json();
  const result: YahooChartResult = data?.chart?.result?.[0];
  if (!result) return [];

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];
  const points: StockPoint[] = [];

  for (let i = 0; i < timestamp.length; i++) {
    const close = quote.close[i];
    if (close == null) continue;
    points.push({
      date: new Date(timestamp[i] * 1000).toISOString().split("T")[0],
      close: Math.round(close * 100) / 100,
      open: quote.open?.[i] ? Math.round((quote.open[i] ?? 0) * 100) / 100 : undefined,
      high: quote.high?.[i] ? Math.round((quote.high[i] ?? 0) * 100) / 100 : undefined,
      low: quote.low?.[i] ? Math.round((quote.low[i] ?? 0) * 100) / 100 : undefined,
      volume: quote.volume?.[i] ?? undefined,
    });
  }

  return points;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isin = searchParams.get("isin");
  const name = searchParams.get("name");
  const range = searchParams.get("range") || "6mo";

  if (!isin && !name) {
    return NextResponse.json({ error: "isin or name required" }, { status: 400 });
  }

  try {
    let symbol: string | null = null;

    // Try ISIN first: construct direct ticker guess
    if (isin) {
      const suffix = isinToYahooSuffix(isin);
      // Try searching by ISIN
      symbol = await searchYahooSymbol(isin);
    }

    // Fallback: search by company name
    if (!symbol && name) {
      symbol = await searchYahooSymbol(name);
    }

    if (!symbol) {
      return NextResponse.json({ error: "Symbol not found", isin, name }, { status: 404 });
    }

    const points = await fetchYahooChart(symbol, range);
    if (points.length === 0) {
      return NextResponse.json({ error: "No data", symbol }, { status: 404 });
    }

    const latest = points[points.length - 1];
    const first = points[0];
    const change = ((latest.close - first.close) / first.close) * 100;

    return NextResponse.json(
      {
        symbol,
        isin,
        latest: latest.close,
        change: Math.round(change * 100) / 100,
        points,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600",
        },
      }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
