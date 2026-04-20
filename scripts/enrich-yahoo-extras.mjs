/**
 * scripts/enrich-yahoo-extras.mjs
 *
 * Targeted refresh of Yahoo quoteSummary fields that fail under high load
 * (analyst consensus, target price, institutional ownership, short ratio, ROE, ROA).
 * Runs slowly (1 company at a time, 600ms delay) so Yahoo doesn't rate-limit.
 *
 * Usage:  node scripts/enrich-yahoo-extras.mjs [--limit=N]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 9999);
const DELAY = 650; // ms between calls (slow enough to avoid rate limit)

const UAs = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
];
const ua = () => UAs[Math.floor(Math.random() * UAs.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let yf = null;
async function loadYf() {
  if (yf) return yf;
  const lib = await import("yahoo-finance2");
  yf = lib.default?.default ?? lib.default ?? lib;
  yf.suppressNotices?.(["yahooSurvey"]);
  return yf;
}

async function fetchExtras(symbol) {
  const lib = await loadYf();
  try {
    const r = await lib.quoteSummary(
      symbol,
      { modules: ["financialData", "defaultKeyStatistics", "summaryDetail"] },
      { validateResult: false },
    );
    const fd = r.financialData ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const sd = r.summaryDetail ?? {};
    const n = (v) => (v?.raw != null ? v.raw : typeof v === "number" ? v : null);
    return {
      // Valuation (may already exist but refresh in case)
      trailingPE:   n(sd.trailingPE),
      forwardPE:    n(ks.forwardPE),
      priceToBook:  n(ks.priceToBook),
      beta:         n(ks.beta),
      // Profitability
      profitMargin: n(fd.profitMargins),
      returnOnEquity: n(fd.returnOnEquity),
      returnOnAssets: n(fd.returnOnAssets),
      debtToEquity: n(fd.debtToEquity),
      // Ownership
      heldByInsiders: n(ks.heldPercentInsiders),
      heldByInstitutions: n(ks.heldPercentInstitutions),
      shortRatio: n(ks.shortRatio),
      // Analyst consensus
      analystReco: fd.recommendationKey ?? null,
      analystScore: n(fd.recommendationMean),
      targetMean: n(fd.targetMeanPrice),
      targetHigh: n(fd.targetHighPrice),
      targetLow:  n(fd.targetLowPrice),
      numAnalysts: n(fd.numberOfAnalystOpinions),
      // Technicals
      fiftyTwoWeekHigh: n(sd.fiftyTwoWeekHigh),
      fiftyTwoWeekLow:  n(sd.fiftyTwoWeekLow),
      fiftyDayAverage:  n(sd.fiftyDayAverage),
      twoHundredDayAverage: n(sd.twoHundredDayAverage),
      dividendYield:    n(sd.dividendYield),
      // Price
      currentPrice: n(fd.currentPrice) ?? n(sd.regularMarketPrice),
    };
  } catch (err) {
    if (/Too Many Requests/i.test(err.message)) {
      // Back off and let caller retry
      throw new Error("RATE_LIMIT");
    }
    return null;
  }
}

async function main() {
  const companies = await prisma.company.findMany({
    where: { yahooSymbol: { not: null } },
    take: LIMIT,
    orderBy: { analystAt: { sort: "asc", nulls: "first" } },
    select: { id: true, name: true, yahooSymbol: true },
  });
  console.log(`\n📊 Enriching extras for ${companies.length} companies (serial, ${DELAY}ms/call)\n`);

  const safe = (v) => (v != null && isFinite(v) && !isNaN(v) ? v : undefined);
  let ok = 0, fail = 0, limited = 0;
  const startTime = Date.now();
  let consecutiveLimits = 0;

  for (let i = 0; i < companies.length; i++) {
    const co = companies[i];
    const pct = Math.round((i / companies.length) * 100);
    let data;
    try {
      data = await fetchExtras(co.yahooSymbol);
    } catch (e) {
      if (e.message === "RATE_LIMIT") {
        limited++;
        consecutiveLimits++;
        const wait = Math.min(30000, 3000 * 2 ** Math.min(consecutiveLimits, 5));
        console.log(`  [${i + 1}/${companies.length}] ${co.name} — RATE LIMIT, waiting ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      data = null;
    }

    if (!data) {
      fail++;
      console.log(`  [${i + 1}/${companies.length}] ✗ ${co.name}`);
      await sleep(DELAY);
      continue;
    }

    consecutiveLimits = 0;

    // Count how many fields we got
    const hit = Object.values(data).filter((v) => v != null).length;
    if (hit === 0) {
      fail++;
      await sleep(DELAY);
      continue;
    }

    await prisma.company.update({
      where: { id: co.id },
      data: {
        trailingPE:    safe(data.trailingPE),
        forwardPE:     safe(data.forwardPE),
        priceToBook:   safe(data.priceToBook),
        beta:          safe(data.beta),
        profitMargin:  safe(data.profitMargin),
        returnOnEquity: safe(data.returnOnEquity),
        returnOnAssets: safe(data.returnOnAssets),
        debtToEquity:  safe(data.debtToEquity),
        heldByInsiders: safe(data.heldByInsiders),
        heldByInstitutions: safe(data.heldByInstitutions),
        shortRatio:    safe(data.shortRatio),
        analystReco:   data.analystReco ?? undefined,
        analystScore:  safe(data.analystScore),
        targetMean:    safe(data.targetMean),
        targetHigh:    safe(data.targetHigh),
        targetLow:     safe(data.targetLow),
        numAnalysts:   data.numAnalysts ? Math.round(data.numAnalysts) : undefined,
        fiftyTwoWeekHigh: safe(data.fiftyTwoWeekHigh),
        fiftyTwoWeekLow:  safe(data.fiftyTwoWeekLow),
        fiftyDayAverage:  safe(data.fiftyDayAverage),
        twoHundredDayAverage: safe(data.twoHundredDayAverage),
        dividendYield:    safe(data.dividendYield),
        currentPrice:     safe(data.currentPrice),
        analystAt:     new Date(),
        priceAt:       new Date(),
      },
    });
    ok++;

    if ((i + 1) % 25 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      console.log(
        `  [${(i + 1).toString().padStart(3)}/${companies.length}] ${pct}% ` +
        `✓${ok} ✗${fail} ⏸${limited} · ${elapsed}s elapsed`
      );
    }

    await sleep(DELAY);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`✅ Done in ${elapsed}s`);
  console.log(`   Success : ${ok}`);
  console.log(`   Fail    : ${fail}`);
  console.log(`   Limited : ${limited}`);

  const [nROE, nAnalyst, nTarget, n52w, nShort, nInst] = await Promise.all([
    prisma.company.count({ where: { returnOnEquity: { not: null } } }),
    prisma.company.count({ where: { analystScore: { not: null } } }),
    prisma.company.count({ where: { targetMean: { not: null } } }),
    prisma.company.count({ where: { fiftyTwoWeekHigh: { not: null } } }),
    prisma.company.count({ where: { shortRatio: { not: null } } }),
    prisma.company.count({ where: { heldByInstitutions: { not: null } } }),
  ]);
  console.log(`\n📈 Coverage:`);
  console.log(`   ROE         : ${nROE}`);
  console.log(`   analystScore: ${nAnalyst}`);
  console.log(`   targetMean  : ${nTarget}`);
  console.log(`   52w high    : ${n52w}`);
  console.log(`   shortRatio  : ${nShort}`);
  console.log(`   heldByInst  : ${nInst}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
