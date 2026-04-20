/**
 * scripts/backfill-company-isin.mjs
 *
 * Backfill Company.isin from Declaration.isin for companies that have an ISIN
 * in their declarations but not in the Company table.
 * Excludes XS (international) and EU (eurozone bond) ISINs.
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Find the most common ISIN per company from their declarations
  const rows = await prisma.$queryRaw`
    SELECT
      c.id,
      c.name,
      d.isin,
      COUNT(*) as cnt
    FROM "Company" c
    JOIN "Declaration" d ON d."companyId" = c.id
    WHERE c.isin IS NULL
      AND c."yahooSymbol" IS NULL
      AND d.isin IS NOT NULL
      AND LENGTH(d.isin) = 12
      AND d.isin NOT LIKE 'XS%'
      AND d.isin NOT LIKE 'EU%'
      AND d.isin NOT LIKE 'US%'
    GROUP BY c.id, c.name, d.isin
    ORDER BY c.id, cnt DESC
  `;

  // Pick the most frequent ISIN per company
  const bestIsin = new Map();
  for (const row of rows) {
    if (!bestIsin.has(row.id)) bestIsin.set(row.id, { name: row.name, isin: row.isin, cnt: Number(row.cnt) });
  }

  console.log(`\nFound ${bestIsin.size} companies to backfill with ISIN\n`);

  let updated = 0;
  for (const [companyId, { name, isin }] of bestIsin) {
    try {
      await prisma.company.update({ where: { id: companyId }, data: { isin } });
      console.log(`  ✓ ${name} → ${isin}`);
      updated++;
    } catch (e) {
      console.error(`  ✗ ${name}: ${e.message}`);
    }
  }

  console.log(`\n✅ Backfilled ${updated} companies with ISIN`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
