import { NextRequest, NextResponse } from "next/server";

export const revalidate = 3600;

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
    exchangeTimezoneName?: string;
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

// Preferred exchange suffixes per ISIN country
function preferredSuffix(isin: string): string {
  if (isin.startsWith("FR") || isin.startsWith("LU")) return ".PA";
  if (isin.startsWith("NL")) return ".AS";
  if (isin.startsWith("DE")) return ".DE";
  if (isin.startsWith("GB")) return ".L";
  if (isin.startsWith("IT")) return ".MI";
  if (isin.startsWith("ES")) return ".MC";
  if (isin.startsWith("BE")) return ".BR";
  return ".PA";
}

// Rank Yahoo Finance search results: prefer PAR > AS > DE > L > anything else
function rankQuotes(
  quotes: Array<{ symbol?: string; quoteType?: string; exchange?: string }>,
  preferSuffix: string
): string | null {
  const equities = quotes.filter((q) => q.quoteType === "EQUITY" && q.symbol);
  if (equities.length === 0) return null;

  // Exact suffix match first
  const exactMatch = equities.find((q) => q.symbol?.endsWith(preferSuffix));
  if (exactMatch?.symbol) return exactMatch.symbol;

  // Paris exchange fallback
  const paris = equities.find((q) => q.symbol?.endsWith(".PA") || q.exchange === "PAR");
  if (paris?.symbol) return paris.symbol;

  // Any recognised exchange (avoid dark pools like .XD, .XC, .XO)
  const darkPools = [".XD", ".XC", ".XO", ".TQ", ".NMS"];
  const clean = equities.find(
    (q) => q.symbol && !darkPools.some((dp) => q.symbol!.endsWith(dp))
  );
  return clean?.symbol ?? equities[0]?.symbol ?? null;
}

async function searchYahooSymbol(
  query: string,
  preferSuffix = ".PA"
): Promise<string | null> {
  // Try the search API
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=fr&region=FR&quotesCount=10`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const symbol = rankQuotes(data?.quotes ?? [], preferSuffix);
      if (symbol) return symbol;
    }
  } catch { /* continue */ }

  // Fallback: try the autocomplete endpoint (sometimes returns different results)
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=0&quotesCount=10&enableCb=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const data = await res.json();
      return rankQuotes(data?.quotes ?? [], preferSuffix);
    }
  } catch { /* noop */ }

  return null;
}

async function fetchYahooChart(symbol: string, range = "6mo"): Promise<{ points: StockPoint[]; meta: { currency: string; regularMarketPrice: number } }> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) return { points: [], meta: { currency: "EUR", regularMarketPrice: 0 } };
  const data = await res.json();
  const result: YahooChartResult = data?.chart?.result?.[0];
  if (!result) return { points: [], meta: { currency: "EUR", regularMarketPrice: 0 } };

  const { timestamp, indicators, meta } = result;
  const quote = indicators.quote[0];
  const points: StockPoint[] = [];

  for (let i = 0; i < timestamp.length; i++) {
    const close = quote.close[i];
    if (close == null) continue;
    // Use UTC date string to avoid timezone shifts
    const d = new Date(timestamp[i] * 1000);
    const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    points.push({
      date: dateStr,
      close: Math.round(close * 100) / 100,
      open: quote.open?.[i] != null ? Math.round((quote.open[i] ?? 0) * 100) / 100 : undefined,
      high: quote.high?.[i] != null ? Math.round((quote.high[i] ?? 0) * 100) / 100 : undefined,
      low: quote.low?.[i] != null ? Math.round((quote.low[i] ?? 0) * 100) / 100 : undefined,
      volume: quote.volume?.[i] ?? undefined,
    });
  }

  return { points, meta: { currency: meta.currency ?? "EUR", regularMarketPrice: meta.regularMarketPrice ?? 0 } };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const isin = searchParams.get("isin");
  const name = searchParams.get("name");
  const range = searchParams.get("range") || "6mo";

  if (!isin && !name) {
    return NextResponse.json({ error: "isin or name required" }, { status: 400 });
  }

  const suffix = isin ? preferredSuffix(isin) : ".PA";

  try {
    let symbol: string | null = null;

    // Step 1: Try direct ISIN search
    if (isin) {
      symbol = await searchYahooSymbol(isin, suffix);
    }

    // Step 2: Try company name search (with PA preference for French)
    if (!symbol && name) {
      symbol = await searchYahooSymbol(name, suffix);
    }

    // Step 3: Try with first word only (e.g. "UBISOFT" instead of "UBISOFT ENTERTAINMENT")
    if (!symbol && name) {
      const firstWord = name.split(" ")[0];
      if (firstWord.length >= 4 && firstWord !== name) {
        symbol = await searchYahooSymbol(firstWord, suffix);
      }
    }

    // Step 4: Try first 2 words
    if (!symbol && name) {
      const twoWords = name.split(" ").slice(0, 2).join(" ");
      if (twoWords !== name && twoWords !== name.split(" ")[0]) {
        symbol = await searchYahooSymbol(twoWords, suffix);
      }
    }

    if (!symbol) {
      return NextResponse.json({ error: "Symbol not found", isin, name }, { status: 404 });
    }

    const { points, meta } = await fetchYahooChart(symbol, range);
    if (points.length === 0) {
      // Try fallback: if symbol was found but no data, try again with name
      if (name && symbol) {
        const shortName = name.split(" ").slice(0, 2).join(" ");
        const altSymbol = await searchYahooSymbol(shortName, ".PA");
        if (altSymbol && altSymbol !== symbol) {
          const { points: pts2, meta: meta2 } = await fetchYahooChart(altSymbol, range);
          if (pts2.length > 0) {
            const first = pts2[0];
            const latest = pts2[pts2.length - 1];
            const change = ((latest.close - first.close) / first.close) * 100;
            return NextResponse.json(
              { symbol: altSymbol, isin, latest: latest.close, change: Math.round(change * 100) / 100, points: pts2, currency: meta2.currency },
              { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } }
            );
          }
        }
      }
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
        currency: meta.currency,
        points,
      },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
