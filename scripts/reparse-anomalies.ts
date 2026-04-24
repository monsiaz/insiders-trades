/**
 * Re-parse declarations flagged as anomalous by the data-quality audit.
 *
 * Categories:
 *   --petl          Insider name starts with "PERSONNE ETROITEMENT LIEE"
 *   --dates         pubDate < transactionDate OR pubDate > transactionDate + 365d
 *   --amount        totalAmount > 1B€ (OCR garbage)
 *   --truncated-fn  insiderFunction truncated at "(par personnes"
 *   --long-nature   transactionNature > 80 chars
 *   --all           All of the above (default)
 *
 * Usage:
 *   npx tsx scripts/reparse-anomalies.ts --petl
 *   npx tsx scripts/reparse-anomalies.ts --all
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { fetchDeclarationDetail } from "../src/lib/amf-detail";
import { inferGender } from "../src/lib/gender-utils";
import slugify from "slugify";

const p = new PrismaClient();

const args = process.argv.slice(2);
const mode = args.length === 0 || args.includes("--all") ? "all" : args[0].replace("--", "");

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

// Concurrency control
const CONCURRENCY = 15;
const PAUSE_MS = 80;  // between individual fetches (inside batch)
const BATCH_PAUSE_MS = 800; // between batches (to let AMF breathe)
const BATCH_SIZE = 150;

async function buildTargetIds(): Promise<string[]> {
  const ids = new Set<string>();

  if (mode === "petl" || mode === "all") {
    const rows = await p.declaration.findMany({
      where: { type: "DIRIGEANTS", insiderName: { startsWith: "PERSONNE ETROITEMENT LIEE" } },
      select: { id: true },
    });
    console.log(`  ${C.yellow}PETL                : ${rows.length}${C.reset}`);
    rows.forEach((r) => ids.add(r.id));
  }

  if (mode === "dates" || mode === "all") {
    const inv = await p.$queryRawUnsafe<{ id: string }[]>(`
      SELECT id FROM "Declaration"
      WHERE type = 'DIRIGEANTS' AND "transactionDate" IS NOT NULL
        AND ("pubDate" < "transactionDate"
             OR "pubDate" - "transactionDate" > INTERVAL '365 days')
    `);
    console.log(`  ${C.yellow}Bad dates           : ${inv.length}${C.reset}`);
    inv.forEach((r) => ids.add(r.id));
  }

  if (mode === "amount" || mode === "all") {
    const rows = await p.declaration.findMany({
      where: { type: "DIRIGEANTS", totalAmount: { gt: 1_000_000_000 } },
      select: { id: true },
    });
    console.log(`  ${C.yellow}totalAmount > 1B€   : ${rows.length}${C.reset}`);
    rows.forEach((r) => ids.add(r.id));
  }

  if (mode === "truncated-fn" || mode === "all") {
    const rows = await p.$queryRawUnsafe<{ id: string }[]>(`
      SELECT id FROM "Declaration"
      WHERE type = 'DIRIGEANTS' AND "insiderFunction" ~ '\\(par personnes *$'
    `);
    console.log(`  ${C.yellow}Truncated functions : ${rows.length}${C.reset}`);
    rows.forEach((r) => ids.add(r.id));
  }

  if (mode === "long-nature" || mode === "all") {
    const rows = await p.$queryRawUnsafe<{ id: string }[]>(`
      SELECT id FROM "Declaration"
      WHERE type = 'DIRIGEANTS' AND LENGTH("transactionNature") > 80
    `);
    console.log(`  ${C.yellow}Long natures        : ${rows.length}${C.reset}`);
    rows.forEach((r) => ids.add(r.id));
  }

  return Array.from(ids);
}

async function upsertInsiderForDeclaration(
  declarationId: string,
  companyId: string,
  insiderName: string,
  insiderFunction: string | null,
): Promise<void> {
  const rawName = insiderName.trim().slice(0, 160);
  if (!rawName) return;
  const slug =
    slugify(rawName, { lower: true, strict: true }).slice(0, 100) ||
    rawName.toLowerCase().replace(/\s+/g, "-").slice(0, 100);

  let insider = await p.insider.findUnique({ where: { slug } });
  if (!insider) {
    const gender = inferGender(rawName, insiderFunction);
    insider = await p.insider.create({ data: { name: rawName, slug, gender } });
  } else if (insider.gender === null) {
    const gender = inferGender(rawName, insiderFunction);
    if (gender) await p.insider.update({ where: { id: insider.id }, data: { gender } });
  }

  await p.declaration.update({
    where: { id: declarationId },
    data: { insiderId: insider.id },
  });

  await p.companyInsider.upsert({
    where: { companyId_insiderId: { companyId, insiderId: insider.id } },
    create: { companyId, insiderId: insider.id },
    update: {},
  });
}

interface Outcome {
  id: string;
  amfId: string;
  before: { name: string | null; fn: string | null; amount: number | null };
  after: { name: string | null; fn: string | null; amount: number | null };
  changed: boolean;
  improved: boolean;
  error?: string;
}

async function reparseOne(declId: string): Promise<Outcome> {
  const decl = await p.declaration.findUnique({
    where: { id: declId },
    select: {
      id: true, amfId: true, companyId: true, pubDate: true,
      insiderName: true, insiderFunction: true, totalAmount: true,
    },
  });
  if (!decl) return { id: declId, amfId: "?", before: { name: null, fn: null, amount: null }, after: { name: null, fn: null, amount: null }, changed: false, improved: false, error: "not found" };

  const before = { name: decl.insiderName, fn: decl.insiderFunction, amount: decl.totalAmount };

  try {
    const details = await fetchDeclarationDetail(decl.amfId);
    if (!details) {
      return { id: declId, amfId: decl.amfId, before, after: { name: null, fn: null, amount: null }, changed: false, improved: false, error: "fetch failed" };
    }

    // Date validation (same rule as sync)
    let safeTxDate = details.transactionDate ?? null;
    if (safeTxDate) {
      if (safeTxDate > decl.pubDate) safeTxDate = null;
      else if (decl.pubDate.getTime() - safeTxDate.getTime() > 365 * 86400_000) safeTxDate = null;
    }

    await p.declaration.update({
      where: { id: declId },
      data: {
        pdfParsed: true,
        insiderName: details.insiderName ?? null,
        insiderFunction: details.insiderFunction ?? null,
        transactionNature: details.transactionNature ?? null,
        instrumentType: details.instrumentType ?? null,
        isin: details.isin ?? null,
        unitPrice: details.unitPrice ?? null,
        volume: details.volume ?? null,
        totalAmount: details.totalAmount ?? null,
        currency: details.currency ?? null,
        transactionDate: safeTxDate,
        transactionVenue: details.transactionVenue ?? null,
        pdfUrl: details.pdfUrl ?? null,
      },
    });

    if (details.insiderName) {
      await upsertInsiderForDeclaration(
        declId, decl.companyId, details.insiderName, details.insiderFunction ?? null,
      ).catch(() => {});
    }

    const after = {
      name: details.insiderName ?? null,
      fn: details.insiderFunction ?? null,
      amount: details.totalAmount ?? null,
    };
    const changed =
      before.name !== after.name || before.fn !== after.fn || before.amount !== after.amount;
    const nameWasBroken = (before.name ?? "").startsWith("PERSONNE ETROITEMENT LIEE");
    const nameIsNowProper = (after.name ?? "").length > 2 && !(after.name ?? "").startsWith("PERSONNE ETROITEMENT");
    const improved = nameWasBroken ? nameIsNowProper : changed;

    return { id: declId, amfId: decl.amfId, before, after, changed, improved };
  } catch (err) {
    return { id: declId, amfId: decl.amfId, before, after: { name: null, fn: null, amount: null }, changed: false, improved: false, error: String(err).slice(0, 120) };
  }
}

async function processInBatches(ids: string[]): Promise<{
  processed: number; improved: number; changed: number; failed: number;
}> {
  let processed = 0, improved = 0, changed = 0, failed = 0;
  const t0 = Date.now();

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);

    // Concurrency-limited processing inside the batch
    for (let j = 0; j < batch.length; j += CONCURRENCY) {
      const slice = batch.slice(j, j + CONCURRENCY);
      const outcomes = await Promise.all(slice.map((id) => reparseOne(id)));
      for (const o of outcomes) {
        processed++;
        if (o.error) failed++;
        if (o.changed) changed++;
        if (o.improved) improved++;
      }
      // Tiny pause between concurrent packs
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    const rate = processed / Math.max(1, (Date.now() - t0) / 1000);
    const eta = Math.round((ids.length - processed) / rate);
    console.log(
      `${C.cyan}[${processed}/${ids.length}]${C.reset} ` +
      `improved=${C.green}${improved}${C.reset} ` +
      `changed=${changed} ` +
      `failed=${C.red}${failed}${C.reset} ` +
      `${C.dim}(${elapsed}s elapsed, ETA ${eta}s @ ${rate.toFixed(1)}/s)${C.reset}`,
    );

    // Polite pause between batches
    if (i + BATCH_SIZE < ids.length) await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
  }

  return { processed, improved, changed, failed };
}

// ── Main ──────────────────────────────────────────────────────────────────
(async () => {
  console.log(`${C.cyan}━━ Re-parse anomalies (mode: ${mode}) ━━${C.reset}\n`);

  const ids = await buildTargetIds();
  console.log(`\n${C.cyan}Total unique declarations to re-parse: ${ids.length}${C.reset}\n`);

  if (ids.length === 0) {
    console.log(`${C.green}✓ Nothing to fix. Base is clean for this category.${C.reset}`);
    await p.$disconnect();
    process.exit(0);
  }

  const stats = await processInBatches(ids);

  console.log(`\n${C.cyan}━━ Summary ━━${C.reset}`);
  console.log(`  Processed: ${stats.processed}`);
  console.log(`  Improved : ${C.green}${stats.improved}${C.reset} (${((stats.improved / stats.processed) * 100).toFixed(1)}%)`);
  console.log(`  Changed  : ${stats.changed}`);
  console.log(`  Failed   : ${C.red}${stats.failed}${C.reset}`);

  await p.$disconnect();
})();
