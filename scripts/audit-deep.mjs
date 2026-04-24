import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" };
const h = (s) => console.log(`\n${C.bold}${C.cyan}━━ ${s} ━━${C.reset}`);
const warn = (n, what) => {
  if (n === 0) return console.log(`${C.green}✓${C.reset} ${what}: 0`);
  const col = n > 100 ? C.red : n > 10 ? C.yellow : C.dim;
  console.log(`${col}✗${C.reset} ${what}: ${n}`);
};

// ── 0. Base counts
h("BASELINE");
const total = await p.declaration.count({ where: { type: "DIRIGEANTS" } });
const amfIds = await p.declaration.count({ where: { type: "DIRIGEANTS", amfId: { not: "" } } });
console.log(`Declarations DIRIGEANTS : ${total}`);
console.log(`avec amfId non vide    : ${amfIds}`);

// ── 1. Dup detection
h("DUPLICATES DETECTION");

// 1a. Same amfId twice (should be impossible due to unique constraint, but let's confirm)
const dupAmfIdsRows = await p.$queryRawUnsafe(`
  SELECT "amfId", COUNT(*)::int AS n FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND "amfId" <> ''
  GROUP BY "amfId" HAVING COUNT(*) > 1
`);
warn(dupAmfIdsRows.length, "Duplicate amfId (should be impossible)");

// 1b. Same (companyId, insiderName, transactionDate, totalAmount) — likely same trade scraped twice
const dupTrades = await p.$queryRawUnsafe(`
  SELECT "companyId", "insiderName", "transactionDate", "totalAmount", COUNT(*)::int AS n
  FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND "insiderName" IS NOT NULL
    AND "transactionDate" IS NOT NULL AND "totalAmount" IS NOT NULL
  GROUP BY "companyId", "insiderName", "transactionDate", "totalAmount"
  HAVING COUNT(*) > 1
  ORDER BY n DESC LIMIT 20
`);
warn(dupTrades.length, "Suspected dup trades (company+insider+date+amount match)");
if (dupTrades.length) {
  console.log(`   Top collisions (n=count):`);
  dupTrades.slice(0, 5).forEach(r => console.log(`     n=${r.n}  ${r.insiderName?.slice(0, 40)} @ ${new Date(r.transactionDate).toISOString().slice(0, 10)} / ${r.totalAmount}`));
}

// ── 2. Value plausibility
h("VALUE PLAUSIBILITY");

// 2a. Negative or zero amounts where parse succeeded
const badAmounts = await p.declaration.count({
  where: { type: "DIRIGEANTS", totalAmount: { lt: 0 } }
});
warn(badAmounts, "totalAmount < 0");

const zeroPriceWithAmount = await p.declaration.count({
  where: { type: "DIRIGEANTS", unitPrice: { lte: 0 }, totalAmount: { gt: 0 } }
});
warn(zeroPriceWithAmount, "unitPrice ≤ 0 but totalAmount > 0 (inconsistent)");

// 2b. price × volume vs totalAmount — allow 5% tolerance
const ampereTest = await p.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND "unitPrice" > 0 AND volume > 0 AND "totalAmount" > 0
    AND ABS("unitPrice" * volume - "totalAmount") > 0.05 * "totalAmount"
    AND ABS("unitPrice" * volume - "totalAmount") > 5
`);
warn(ampereTest[0].n, "price × volume ≠ totalAmount (> 5% discrepancy)");

// 2c. Future dates
const futureDates = await p.declaration.count({
  where: { type: "DIRIGEANTS", transactionDate: { gt: new Date() } }
});
warn(futureDates, "transactionDate > today (future)");

// 2d. pubDate < transactionDate is IMPOSSIBLE under MAR (must declare within 3 days of trade)
const impossibleDates = await p.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND "transactionDate" IS NOT NULL
    AND "pubDate" < "transactionDate"
`);
warn(impossibleDates[0].n, "pubDate < transactionDate (should be impossible)");

// 2e. Extreme leak: publication more than 12 months after transaction = likely bad OCR
const suspiciousLag = await p.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND "transactionDate" IS NOT NULL
    AND "pubDate" - "transactionDate" > INTERVAL '365 days'
`);
warn(suspiciousLag[0].n, "pubDate > transactionDate + 365d (likely bad parse)");

// 2f. totalAmount > 1B € = implausible for a single insider trade
const hugeAmounts = await p.declaration.count({
  where: { type: "DIRIGEANTS", totalAmount: { gt: 1_000_000_000 } }
});
warn(hugeAmounts, "totalAmount > 1B€ (implausible)");

// ── 3. Insider / Function quality
h("INSIDER / FUNCTION QUALITY");

const emptyInsider = await p.declaration.count({
  where: { type: "DIRIGEANTS", OR: [{ insiderName: null }, { insiderName: "" }] }
});
warn(emptyInsider, "Empty insiderName");

const truncatedFunctions = await p.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND "insiderFunction" ~ '\\(par personnes *$'
`);
warn(truncatedFunctions[0].n, "insiderFunction truncated at '(par personnes'");

const veryLongName = await p.declaration.count({
  where: { type: "DIRIGEANTS", insiderName: { contains: ",", mode: "insensitive" } }
});
warn(veryLongName, "insiderName contains ',' (likely name+function mashed)");

// Samples of suspicious insider names
const weirdNames = await p.$queryRawUnsafe(`
  SELECT "insiderName", COUNT(*)::int AS n FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND ("insiderName" ~ '\\d' OR LENGTH("insiderName") > 60 OR "insiderName" ~ ':$')
  GROUP BY "insiderName" ORDER BY n DESC LIMIT 10
`);
if (weirdNames.length) {
  console.log(`   ${C.yellow}Samples of suspicious insiderName:${C.reset}`);
  weirdNames.forEach(w => console.log(`     n=${w.n}  "${w.insiderName}"`));
}

// ── 4. ISIN quality
h("ISIN QUALITY");

const missingIsin = await p.declaration.count({
  where: { type: "DIRIGEANTS", isin: null }
});
warn(missingIsin, "Missing ISIN on DIRIGEANTS");

// Bad-looking ISINs (should be 2 letters + 10 alphanum)
const badIsin = await p.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND isin IS NOT NULL
    AND NOT (isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$')
`);
warn(badIsin[0].n, "ISIN malformed (not matching ^[A-Z]{2}[A-Z0-9]{9}[0-9]$)");

// Companies with multiple ISINs — may indicate bad scraping or corporate action
const companiesMultiIsin = await p.$queryRawUnsafe(`
  SELECT c.slug, COUNT(DISTINCT d.isin)::int AS ni FROM "Declaration" d
  JOIN "Company" c ON c.id = d."companyId"
  WHERE d.type = 'DIRIGEANTS' AND d.isin IS NOT NULL
  GROUP BY c.slug HAVING COUNT(DISTINCT d.isin) > 1
  ORDER BY ni DESC LIMIT 10
`);
warn(companiesMultiIsin.length, "Companies with ≥ 2 distinct ISINs");
if (companiesMultiIsin.length) {
  companiesMultiIsin.slice(0, 5).forEach(c => console.log(`     ${c.slug} : ${c.ni} distinct ISINs`));
}

// ── 5. Transaction nature hygiene
h("TRANSACTION NATURE HYGIENE");

// Nature values that are suspiciously short or long
const shortNatures = await p.$queryRawUnsafe(`
  SELECT "transactionNature", COUNT(*)::int AS n FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND LENGTH("transactionNature") < 5
  GROUP BY "transactionNature" ORDER BY n DESC LIMIT 10
`);
if (shortNatures.length) {
  console.log(`   ${C.yellow}Suspiciously short natures (< 5 chars):${C.reset}`);
  shortNatures.forEach(n => console.log(`     n=${n.n}  "${n.transactionNature}"`));
} else {
  console.log(`${C.green}✓${C.reset} No suspiciously short natures`);
}

const longNatures = await p.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND LENGTH("transactionNature") > 80
`);
warn(longNatures[0].n, "transactionNature > 80 chars (likely bad parse)");

// ── 6. Company / amfToken coverage
h("COMPANY ENRICHMENT");

const [companies, withMcap, withYahoo, withLogo, withDesc] = await Promise.all([
  p.company.count(),
  p.company.count({ where: { marketCap: { not: null } } }),
  p.company.count({ where: { yahooSymbol: { not: null } } }),
  p.company.count({ where: { logoUrl: { not: null } } }),
  p.company.count({ where: { descriptionFr: { not: null } } }),
]);
const pct = (n) => ((n / companies) * 100).toFixed(1) + "%";
console.log(`Total companies             : ${companies}`);
console.log(`  with marketCap            : ${withMcap}  (${pct(withMcap)})`);
console.log(`  with Yahoo symbol         : ${withYahoo} (${pct(withYahoo)})`);
console.log(`  with logo URL             : ${withLogo}  (${pct(withLogo)})`);
console.log(`  with AI description (FR)  : ${withDesc}  (${pct(withDesc)})`);

// ── 7. Scoring coverage
h("SCORING COVERAGE");

const [scored, unscored] = await Promise.all([
  p.declaration.count({ where: { type: "DIRIGEANTS", signalScore: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", signalScore: null, pdfParsed: true, totalAmount: { not: null } } }),
]);
console.log(`Scored declarations        : ${scored} (${((scored/total)*100).toFixed(1)}%)`);
warn(unscored, "Parsed + has amount but NO signalScore");

// Distribution of signalScore
const scoreHist = await p.$queryRawUnsafe(`
  SELECT
    CASE
      WHEN "signalScore" < 20 THEN '00-20'
      WHEN "signalScore" < 40 THEN '20-40'
      WHEN "signalScore" < 60 THEN '40-60'
      WHEN "signalScore" < 80 THEN '60-80'
      ELSE '80+'
    END AS bucket,
    COUNT(*)::int AS n
  FROM "Declaration"
  WHERE type = 'DIRIGEANTS' AND "signalScore" IS NOT NULL
  GROUP BY bucket ORDER BY bucket
`);
console.log(`   Score distribution (v3):`);
scoreHist.forEach(b => {
  const bar = "█".repeat(Math.round(b.n / 400));
  console.log(`     ${b.bucket}  ${String(b.n).padStart(5)} ${C.cyan}${bar}${C.reset}`);
});

// ── 8. Backtest coverage
h("BACKTEST COVERAGE");

const [btTotal, btWithPrice, bt90, bt365] = await Promise.all([
  p.backtestResult.count(),
  p.backtestResult.count({ where: { priceAtTrade: { gt: 0 } } }),
  p.backtestResult.count({ where: { return90d: { not: null } } }),
  p.backtestResult.count({ where: { return365d: { not: null } } }),
]);
console.log(`BacktestResult rows        : ${btTotal}`);
console.log(`  with priceAtTrade > 0    : ${btWithPrice} (${((btWithPrice/btTotal)*100).toFixed(1)}%)`);
console.log(`  with return90d           : ${bt90}       (${((bt90/btTotal)*100).toFixed(1)}%)`);
console.log(`  with return365d          : ${bt365}      (${((bt365/btTotal)*100).toFixed(1)}%)`);

const eligibleNoBt = await p.$queryRawUnsafe(`
  SELECT COUNT(*)::int AS n FROM "Declaration" d
  LEFT JOIN "BacktestResult" b ON b."declarationId" = d.id
  WHERE d.type = 'DIRIGEANTS' AND d."pdfParsed" = true
    AND d."transactionDate" IS NOT NULL
    AND d."transactionDate" < NOW() - INTERVAL '95 days'
    AND b.id IS NULL
`);
warn(eligibleNoBt[0].n, "Parsed + tx > 95d ago but NO BacktestResult");

// ── 9. Sanity-check recent activity
h("RECENT INGESTION (last 7 days)");

const recent = await p.declaration.count({
  where: { type: "DIRIGEANTS", pubDate: { gte: new Date(Date.now() - 7 * 86400_000) } }
});
console.log(`Declarations published in last 7d : ${recent}`);

const recentUnparsed = await p.declaration.count({
  where: {
    type: "DIRIGEANTS",
    pubDate: { gte: new Date(Date.now() - 7 * 86400_000) },
    pdfParsed: false,
  }
});
warn(recentUnparsed, "Recent (7d) DIRIGEANTS NOT parsed");

console.log("\n");
await p.$disconnect();
