/**
 * scripts/resolve-missing-symbols.mjs
 *
 * More aggressive symbol resolution for companies with ISIN but no Yahoo symbol.
 * Strategies (in order):
 *   1. Try ISIN directly as ticker via Yahoo chart API (ISIN.PA format)
 *   2. Try Euronext's suggest API → extract ticker → try ticker.PA on Yahoo
 *   3. Try OpenFIGI API (free, ISIN → Bloomberg ticker → convert to Yahoo)
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const DELAY = 400;

const UAs = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
];
const ua = () => UAs[Math.floor(Math.random() * UAs.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Strategy 1: ISIN direct as Yahoo symbol ───────────────────────────────────

async function tryIsinDirect(isin) {
  const suffixes = [".PA", ".EPA", ".AS", ".BR", ".DE", ".L", ".MI", ".MC"];
  const suffix = isin.startsWith("FR") || isin.startsWith("LU") ? ".PA" :
    isin.startsWith("NL") ? ".AS" : isin.startsWith("BE") ? ".BR" :
    isin.startsWith("DE") ? ".DE" : isin.startsWith("GB") ? ".L" : ".PA";

  const sym = `${isin}${suffix}`;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": ua() }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (meta?.symbol) return meta.symbol; // Yahoo returns the canonical symbol
  } catch {}
  return null;
}

// ── Strategy 2: Euronext suggest API ─────────────────────────────────────────

async function tryEuronext(isin, name) {
  const queries = [isin, name];
  for (const q of queries) {
    try {
      const url = `https://live.euronext.com/en/search_instruments/suggest?query=${encodeURIComponent(q)}&limit=5`;
      const res = await fetch(url, {
        headers: { "User-Agent": ua(), Accept: "application/json", Referer: "https://live.euronext.com" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const items = data?.suggestions ?? data?.instruments ?? data ?? [];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const isinMatch = item.isin ?? item.ISIN ?? item.instrumentIsin;
        const ticker = item.mnemonic ?? item.mnemo ?? item.ticker ?? item.symbol;
        if (isinMatch === isin && ticker) {
          // Verify the ticker exists on Yahoo
          const yahooCand = `${ticker}.PA`;
          const chartOk = await tryYahooChart(yahooCand);
          if (chartOk) return yahooCand;
        }
      }
    } catch {}
    await sleep(200);
  }
  return null;
}

// ── Strategy 3: OpenFIGI ──────────────────────────────────────────────────────
// Free API: https://www.openfigi.com/api — up to 25k requests/day, no auth needed for basic

async function tryOpenFIGI(isin) {
  try {
    const body = JSON.stringify([{ idType: "ID_ISIN", idValue: isin, exchCode: "EPA" }]);
    const res = await fetch("https://api.openfigi.com/v3/mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hits = data?.[0]?.data ?? [];
    if (!hits.length) return null;
    // OpenFIGI returns Bloomberg tickers; try to convert to Yahoo
    for (const hit of hits) {
      const bbg = hit.ticker; // Bloomberg ticker (e.g. "AL" for Alstom)
      if (!bbg) continue;
      // Yahoo usually uses the same ticker + .PA for Euronext Paris
      const yahooCand = `${bbg}.PA`;
      const ok = await tryYahooChart(yahooCand);
      if (ok) return yahooCand;
    }
  } catch {}
  return null;
}

// ── Strategy 4: Yahoo search with newsCount=0 ─────────────────────────────────

async function tryYahooSearch(isin, name) {
  // Clean name variations
  const variants = [isin];
  if (name) {
    variants.push(name);
    const clean = name
      .replace(/\bS\.?A\.?S?\b|\bS\.?E\b|\bS\.?C\.?A\b/gi, "")
      .replace(/\bGROUPE\b|\bSOCIETE\b|\bFRANCE\b/gi, "")
      .trim();
    if (clean !== name) variants.push(clean);
    variants.push(clean.split(" ")[0]);
  }
  for (const q of variants) {
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&lang=fr&region=FR`;
      const res = await fetch(url, { headers: { "User-Agent": ua() }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      const quotes = (data?.quotes ?? []).filter(q => ["EQUITY", "ETF"].includes(q.quoteType) && q.symbol);
      const match = quotes.find(q => q.symbol?.endsWith(".PA")) ?? quotes[0];
      if (match?.symbol) return match.symbol;
    } catch {}
    await sleep(150);
  }
  return null;
}

async function tryYahooChart(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": ua() }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
  } catch { return false; }
}

// ── Fetch and store financials once symbol found ──────────────────────────────

async function fetchAndStore(companyId, symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const res = await fetch(url, { headers: { "User-Agent": ua() }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return false;
    await prisma.company.update({
      where: { id: companyId },
      data: {
        yahooSymbol: symbol,
        currentPrice: meta.regularMarketPrice,
        financialsAt: new Date(),
        analystAt: new Date(),
        marketCapAt: new Date(),
      },
    });
    return true;
  } catch { return false; }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const companies = await prisma.company.findMany({
    where: { yahooSymbol: null, isin: { not: null } },
    select: { id: true, name: true, isin: true },
    orderBy: { name: "asc" },
  });

  console.log(`\n🔍 Aggressive symbol resolution for ${companies.length} companies with ISIN\n${"─".repeat(60)}`);
  const stats = { resolved: 0, failed: 0 };

  for (let i = 0; i < companies.length; i++) {
    const co = companies[i];
    const label = `[${i + 1}/${companies.length}] ${co.name}`;
    let symbol = null;

    // Strategy 1: ISIN.PA direct
    symbol = await tryIsinDirect(co.isin);
    if (symbol) { console.log(`${label} → ISIN direct: ${symbol}`); }
    await sleep(150);

    // Strategy 2: Euronext suggest (if ISIN direct failed)
    if (!symbol) {
      symbol = await tryEuronext(co.isin, co.name);
      if (symbol) { console.log(`${label} → Euronext: ${symbol}`); }
      await sleep(200);
    }

    // Strategy 3: OpenFIGI
    if (!symbol) {
      symbol = await tryOpenFIGI(co.isin);
      if (symbol) { console.log(`${label} → OpenFIGI: ${symbol}`); }
      await sleep(200);
    }

    // Strategy 4: Yahoo search (last resort, already tried before but with fresh UA)
    if (!symbol) {
      symbol = await tryYahooSearch(co.isin, co.name);
      if (symbol) { console.log(`${label} → YahooSearch: ${symbol}`); }
    }

    if (symbol) {
      const stored = await fetchAndStore(co.id, symbol);
      if (stored) {
        stats.resolved++;
        console.log(`${label} → ✓ ${symbol} (price stored)`);
      } else {
        // Store symbol at minimum, even if no price data
        await prisma.company.update({ where: { id: co.id }, data: { yahooSymbol: symbol } }).catch(() => {});
        stats.resolved++;
        console.log(`${label} → ✓ ${symbol} (no price, symbol cached)`);
      }
    } else {
      stats.failed++;
      console.log(`${label} → ✗ all strategies failed`);
      // Mark as attempted
      await prisma.company.update({ where: { id: co.id }, data: { financialsAt: new Date() } }).catch(() => {});
    }

    await sleep(DELAY);
  }

  const [withPrice, total] = await Promise.all([
    prisma.company.count({ where: { currentPrice: { not: null } } }),
    prisma.company.count(),
  ]);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ Done — resolved: ${stats.resolved}, failed: ${stats.failed}`);
  console.log(`📈 Final coverage: ${withPrice}/${total} (${(withPrice/total*100).toFixed(0)}%)`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
