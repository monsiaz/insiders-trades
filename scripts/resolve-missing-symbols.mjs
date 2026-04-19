/**
 * Resolve Yahoo Finance symbols for companies missing them.
 * Uses ISIN → Yahoo search to find the correct ticker.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function searchYahoo(query) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=0&quotesCount=5&enableFuzzyQuery=false`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const quotes = data?.quotes ?? [];
    // Prefer EQUITY quotes on Euronext Paris (.PA) or on Euronext Amsterdam (.AS)
    const eq = quotes.find(q => q.quoteType === "EQUITY" && (q.symbol?.endsWith(".PA") || q.symbol?.endsWith(".AS") || q.symbol?.endsWith(".BR")));
    if (eq) return eq.symbol;
    // Any equity fallback
    const anyEq = quotes.find(q => q.quoteType === "EQUITY");
    return anyEq?.symbol ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const companies = await prisma.company.findMany({
    where: { yahooSymbol: null, isin: { not: null } },
    select: { id: true, name: true, isin: true },
  });

  console.log(`Resolving ${companies.length} companies…\n`);

  let resolved = 0;
  for (const co of companies) {
    // Try ISIN first, then name
    let sym = await searchYahoo(co.isin);
    if (!sym) sym = await searchYahoo(co.name);

    if (sym) {
      await prisma.company.update({ where: { id: co.id }, data: { yahooSymbol: sym } });
      console.log(`  ✓ ${co.name} → ${sym}`);
      resolved++;
    } else {
      console.log(`  ✗ ${co.name} (${co.isin}) — not found`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nResolved: ${resolved}/${companies.length}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
