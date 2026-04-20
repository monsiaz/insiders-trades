/**
 * fix-zero-price-acquisitions.mjs
 *
 * For declarations where:
 *   - transactionNature = "Acquisition"
 *   - unitPrice = 0
 *   - volume > 0
 *   - totalAmount = null
 *
 * Re-parses the PDF and:
 *   1. If comments / PDF text mention a real price (cours de référence, cours d'acquisition, etc.)
 *      → updates unitPrice + totalAmount with that price, keeps nature = "Acquisition"
 *   2. If no price found
 *      → reclassifies transactionNature = "Acquisition d'actions gratuites"
 *
 * Usage: node scripts/fix-zero-price-acquisitions.mjs [--dry-run] [--concurrency=N]
 */

import { PrismaClient } from "@prisma/client";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import path from "path";
import os from "os";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CONCURRENCY = parseInt(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "15");

const prisma = new PrismaClient({ log: ["error"] });

// ── PDF extraction ────────────────────────────────────────────────────────────
function extractWithPoppler(buf) {
  const tmp = path.join(os.tmpdir(), `amf-fix-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  try {
    writeFileSync(tmp, buf);
    const r = spawnSync("pdftotext", [tmp, "-"], { timeout: 12000, encoding: "utf8" });
    return r.stdout ?? "";
  } finally { try { unlinkSync(tmp); } catch {} }
}

function parsePrice(raw) {
  if (!raw) return undefined;
  const cleaned = raw
    .replace(/[^\d,. ]/g, "").trim()
    .replace(/\s/g, "")
    .replace(/,(\d{1,2})$/, ".$1")
    .replace(/,/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) || val <= 0 ? undefined : val;
}

/**
 * Try to extract an implicit price from PDF comments / full text.
 * Patterns observed in AMF PDFs:
 *   - "Cours de référence : 76,8 €"
 *   - "cours d'acquisition unitaire de 17,21 €"
 *   - "Cours d'ouverture : 4,04€"
 *   - "au cours de 12,50 €"
 *   - "au prix de 8,00 euros"
 *   - "Valeur des actions : 49,35 euros"
 *   - "cours moyen de 5,42 €"
 */
function extractImplicitPrice(text) {
  const patterns = [
    /[Cc]ours\s+de\s+r[eé]f[eé]rence\s*:?\s*([\d\s.,]+)\s*[€EeUu]/,
    /[Cc]ours\s+d['']acquisition\s+unitaire\s+de\s+([\d\s.,]+)\s*[€EeUu]/,
    /[Cc]ours\s+d['']ouverture\s*:?\s*([\d\s.,]+)\s*[€EeUu]/,
    /[Cc]ours\s+moyen\s+de\s+([\d\s.,]+)\s*[€EeUu]/,
    /au\s+cours\s+de\s+([\d\s.,]+)\s*[€EeUu]/i,
    /au\s+prix\s+de\s+([\d\s.,]+)\s*(?:€|euro)/i,
    /[Vv]aleur\s+des\s+actions\s*:?\s*([\d\s.,]+)\s*[€EeUu]/,
    /[Pp]rix\s+de\s+march[eé]\s*:?\s*([\d\s.,]+)\s*[€EeUu]/,
    /[Cc]ours\s+de\s+clôture\s*:?\s*([\d\s.,]+)\s*[€EeUu]/,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const price = parsePrice(m[1]);
      if (price && price > 0 && price < 1_000_000) return price;
    }
  }
  return undefined;
}

// ── Process one declaration ───────────────────────────────────────────────────
async function processDeclaration(decl, stats) {
  try {
    if (!decl.pdfUrl) {
      // No PDF: safe to reclassify as free shares
      if (!DRY_RUN) {
        await prisma.declaration.update({
          where: { id: decl.id },
          data: { transactionNature: "Acquisition d'actions gratuites" },
        });
      }
      stats.reclassifiedNoUrl++;
      return;
    }

    const res = await fetch(decl.pdfUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      stats.fetchFail++;
      return;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const text = extractWithPoppler(buf);

    if (!text || text.trim().length < 30) {
      stats.emptyText++;
      return;
    }

    const implicitPrice = extractImplicitPrice(text);

    if (implicitPrice) {
      // Found a real price in comments → update price + amount, keep "Acquisition"
      const totalAmount = Math.round(implicitPrice * decl.volume * 100) / 100;
      if (!DRY_RUN) {
        await prisma.declaration.update({
          where: { id: decl.id },
          data: { unitPrice: implicitPrice, totalAmount },
        });
      }
      stats.priceRecovered++;
      stats.priceRecoveredSamples.push({
        amfId: decl.amfId,
        company: decl.company?.name,
        implicitPrice,
        volume: decl.volume,
        totalAmount,
      });
    } else {
      // No price found → reclassify as free share attribution
      if (!DRY_RUN) {
        await prisma.declaration.update({
          where: { id: decl.id },
          data: { transactionNature: "Acquisition d'actions gratuites" },
        });
      }
      stats.reclassified++;
    }
  } catch (err) {
    stats.errors++;
    console.error(`  [error] ${decl.amfId}:`, err.message?.slice(0, 80));
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔧  fix-zero-price-acquisitions.mjs — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`    concurrency=${CONCURRENCY}\n`);

  const records = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      transactionNature: "Acquisition",
      unitPrice: 0,
      volume: { gt: 0 },
      totalAmount: null,
    },
    select: {
      id: true, amfId: true, pdfUrl: true, volume: true,
      company: { select: { name: true } },
    },
    orderBy: { pubDate: "desc" },
  });

  console.log(`📊  Found ${records.length} "Acquisition" at price=0 to process.\n`);

  const stats = {
    total: records.length,
    priceRecovered: 0,
    reclassified: 0,
    reclassifiedNoUrl: 0,
    fetchFail: 0,
    emptyText: 0,
    errors: 0,
    priceRecoveredSamples: [],
  };

  for (let i = 0; i < records.length; i += CONCURRENCY) {
    const batch = records.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(d => processDeclaration(d, stats)));
    const pct = Math.round((i + batch.length) / records.length * 100);
    process.stdout.write(
      `\r  Progress: ${i + batch.length}/${records.length} (${pct}%)  ` +
      `priceFound=${stats.priceRecovered}  reclassified=${stats.reclassified}  fail=${stats.fetchFail + stats.errors}  `
    );
    if (i + CONCURRENCY < records.length) await new Promise(r => setTimeout(r, 400));
  }

  console.log("\n");
  console.log("════════════════════════════════════════════════════════");
  console.log("              RÉSULTATS");
  console.log("════════════════════════════════════════════════════════");
  console.log(`Total traité                          : ${stats.total}`);
  console.log(`💰 Prix récupéré dans commentaires    : ${stats.priceRecovered}`);
  console.log(`🎁 Reclassé → "actions gratuites"     : ${stats.reclassified}`);
  console.log(`🎁 Reclassé (sans PDF URL)            : ${stats.reclassifiedNoUrl}`);
  console.log(`❌ PDF fetch failures                  : ${stats.fetchFail}`);
  console.log(`⚠️  PDF vide                           : ${stats.emptyText}`);
  console.log(`💥 Erreurs                             : ${stats.errors}`);
  console.log("════════════════════════════════════════════════════════");

  if (stats.priceRecoveredSamples.length > 0) {
    console.log("\n📈 Exemples de prix récupérés dans les commentaires :");
    stats.priceRecoveredSamples.slice(0, 15).forEach(s => {
      console.log(`  ${s.amfId} | ${s.company} | ${s.implicitPrice}€ × ${s.volume} = ${s.totalAmount}€`);
    });
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
