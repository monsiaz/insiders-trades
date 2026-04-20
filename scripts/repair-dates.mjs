/**
 * repair-dates.mjs — Fix anomalous transactionDate values in the DB.
 *
 * Target: declarations where transactionDate is:
 *   - Before 2003-01-01 (old parser bug: JS Date(year, ...) adds 1900 for 2-digit years)
 *   - After today + 18 months (OCR transposition, e.g. "2025" → "2925")
 *
 * Strategy: re-download and re-parse the PDF using pdftotext (poppler),
 * then store the corrected date (and other fields if they also improve).
 *
 * Usage:
 *   node scripts/repair-dates.mjs [--dry-run] [--limit=N] [--concurrency=N]
 */

import { PrismaClient } from "@prisma/client";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync, appendFileSync } from "fs";
import path from "path";
import os from "os";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "99999");
const CONCURRENCY = parseInt(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "15");
const VERBOSE = args.includes("--verbose");

const prisma = new PrismaClient({ log: ["error"] });
const LOG_FILE = path.join(process.cwd(), "scripts", "repair-dates-report.json");

// ── Date validity bounds ─────────────────────────────────────────────────────
const MIN_DATE = new Date("2003-01-01");
const MAX_DATE = new Date(Date.now() + 18 * 30 * 24 * 60 * 60 * 1000);

function isAnomalous(d) {
  if (!d) return false;
  return d < MIN_DATE || d > MAX_DATE;
}

// ── PDF extraction ───────────────────────────────────────────────────────────
function extractWithPoppler(buf) {
  const tmp = path.join(os.tmpdir(), `amf-repair-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  try {
    writeFileSync(tmp, buf);
    const r = spawnSync("pdftotext", [tmp, "-"], { timeout: 15000, encoding: "utf8" });
    return r.stdout ?? "";
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

// ── Parsing helpers ──────────────────────────────────────────────────────────
function normalizeApostrophes(s) {
  return s.replace(/[\u2018\u2019\u02BC\u0060\u00B4]/g, "'");
}

const KNOWN_LABELS = [
  "DATE DE LA TRANSACTION", "LIEU DE LA TRANSACTION", "NATURE DE LA TRANSACTION",
  "DESCRIPTION DE L'INSTRUMENT FINANCIER", "CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER",
  "CODE ISIN", "PRIX UNITAIRE", "VOLUME", "INFORMATIONS AGREGEES",
  "INFORMATION DETAILLEE PAR OPERATION", "NOTIFICATION INITIALE",
  "NOTIFICATION INITIALE / MODIFICATION", "COORDONNEES DE L'EMETTEUR",
  "DETAIL DE LA TRANSACTION", "NOM / FONCTION", "NOM /FONCTION",
  "TRANSACTION LIEE", "DATE DE RECEPTION", "COMMENTAIRES",
];

function normalizeFieldBreaks(text) {
  let t = normalizeApostrophes(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  for (const label of KNOWN_LABELS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`(?<!\n)(${escaped}\\s*:)`, "gi"), "\n$1");
  }
  return t;
}

function extractField(text, label) {
  const l = normalizeApostrophes(label);
  const escaped = l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = text.match(new RegExp(`${escaped}\\s*:\\s*([^\n]+)`, "i"));
  if (m) {
    const val = m[1].trim().replace(/ {2,}/g, " ");
    if (val) return val;
  }
  return undefined;
}

function parsePrice(raw) {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^\d,. ]/g, "").trim().replace(/\s/g, "")
    .replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : val;
}

function parseDate(raw) {
  if (!raw) return undefined;
  const months = {
    janvier:1, "f\u00e9vrier":2, mars:3, avril:4, mai:5, juin:6,
    juillet:7, "ao\u00fbt":8, septembre:9, octobre:10, novembre:11, "d\u00e9cembre":12
  };

  // French long form: "07 mai 2024" or "7 mai 24"
  const mFr = raw.match(/(\d{1,2})\s+([a-z\u00e9\u00fb\u00f4\u00ea]+)\s+(\d{2,4})/i);
  if (mFr) {
    const day = parseInt(mFr[1]);
    const month = months[mFr[2].toLowerCase()];
    let year = parseInt(mFr[3]);
    if (mFr[3].length === 2) year += year <= 50 ? 2000 : 1900;
    if (month) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (d >= MIN_DATE && d <= MAX_DATE) return d;
    }
  }

  // ISO: "2024-05-07"
  const mIso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) {
    const d = new Date(Date.UTC(+mIso[1], +mIso[2] - 1, +mIso[3]));
    if (d >= MIN_DATE && d <= MAX_DATE) return d;
  }

  // DD/MM/YYYY
  const mSlash4 = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mSlash4) {
    const d = new Date(Date.UTC(+mSlash4[3], +mSlash4[2] - 1, +mSlash4[1]));
    if (d >= MIN_DATE && d <= MAX_DATE) return d;
  }

  // DD/MM/YY (2-digit year, older PDFs)
  const mSlash2 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mSlash2) {
    const yr = +mSlash2[3];
    const year = yr <= 50 ? 2000 + yr : 1900 + yr;
    const d = new Date(Date.UTC(year, +mSlash2[2] - 1, +mSlash2[1]));
    if (d >= MIN_DATE && d <= MAX_DATE) return d;
  }

  return undefined;
}

function parseCurrency(raw) {
  if (!raw) return "EUR";
  const r = raw.toLowerCase();
  if (r.includes("euro") || r.includes("eur") || r.includes("€")) return "EUR";
  if (r.includes("usd") || r.includes("dollar")) return "USD";
  if (r.includes("gbp") || r.includes("pound") || r.includes("sterling")) return "GBP";
  if (r.includes("chf")) return "CHF";
  const m = raw.match(/[A-Z]{3}/);
  return m ? m[0] : "EUR";
}

const STRICT_ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/g;
const COUNTRY_CODES = new Set(["FR","DE","US","GB","NL","BE","IT","ES","CH","LU","SE","NO","DK","FI","PT","AT","IE","CA","AU","JP","HK","SG"]);

function isLikelyIsin(s) {
  if (s.length !== 12) return false;
  const cc = s.slice(0, 2);
  if (COUNTRY_CODES.has(cc)) return true;
  const body = s.slice(2);
  return (body.match(/\d/g) || []).length >= 6;
}

function extractIsin(text) {
  const norm = normalizeApostrophes(text);
  for (const label of ["CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER", "CODE ISIN", "ISIN"]) {
    const val = extractField(norm, label);
    if (val) {
      const m = val.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);
      if (m && isLikelyIsin(m[1])) return m[1];
    }
  }
  const dashes = "[-–—−\u2012\u2013\u2014]";
  const headerMatch = norm.replace(/\r/g, "\n").match(
    new RegExp(`\n([A-Z]{2}[A-Z0-9]{9}[0-9])\\s*${dashes}\\s*[A-Z0-9]`)
  );
  if (headerMatch && isLikelyIsin(headerMatch[1])) return headerMatch[1];
  for (const m of norm.slice(0, 600).matchAll(STRICT_ISIN_RE)) {
    if (isLikelyIsin(m[1])) return m[1];
  }
  return undefined;
}

function parseDeclaration(rawText, pdfUrl) {
  const text = normalizeFieldBreaks(rawText);
  const dateRaw = extractField(text, "DATE DE LA TRANSACTION");
  const transactionDate = parseDate(dateRaw);
  const isin = extractIsin(text);
  const nature = extractField(text, "NATURE DE LA TRANSACTION");

  let unitPrice, volume, totalAmount, currency;
  const agregSection = text.match(/INFORMATIONS AGREGEES\s*\n([\s\S]*?)(?=\nTRANSACTION LIEE|\nDATE DE RECEPTION|$)/i);
  if (agregSection) {
    const ag = agregSection[1];
    const priceMatch = ag.match(/PRIX\s*:\s*([\d\s.,]+(?:\s*[A-Za-z\u00C0-\u024F\s€$£]+)?)/i);
    const volMatch = ag.match(/VOLUME\s*:\s*([\d\s.,]+)/i);
    if (priceMatch) { unitPrice = parsePrice(priceMatch[1]); currency = parseCurrency(priceMatch[1]); }
    if (volMatch) volume = parsePrice(volMatch[1]);
  }
  if (unitPrice == null) {
    const priceRaw = extractField(text, "PRIX UNITAIRE");
    if (priceRaw) { unitPrice = parsePrice(priceRaw); currency = parseCurrency(priceRaw); }
  }
  if (volume == null) volume = parsePrice(extractField(text, "VOLUME"));
  if (!currency) currency = "EUR";

  if (unitPrice != null && unitPrice > 0 && volume != null) {
    totalAmount = Math.round(unitPrice * volume * 100) / 100;
  }

  return { transactionDate, isin, transactionNature: nature, unitPrice, volume, totalAmount, currency, pdfUrl };
}

// ── Fetch PDF from AMF ────────────────────────────────────────────────────────
async function fetchPdf(pdfUrl) {
  const res = await fetch(pdfUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

// ── Worker ───────────────────────────────────────────────────────────────────
async function repairDeclaration(decl, stats) {
  try {
    if (!decl.pdfUrl) { stats.noUrl++; return; }

    const buf = await fetchPdf(decl.pdfUrl);
    if (!buf) { stats.fetchFail++; return; }

    const rawText = extractWithPoppler(buf);
    if (!rawText || rawText.trim().length < 50) { stats.emptyText++; return; }

    const parsed = parseDeclaration(rawText, decl.pdfUrl);
    const newDate = parsed.transactionDate;

    if (!newDate) {
      stats.dateNotFound++;
      if (VERBOSE) console.log(`  [no-date] ${decl.amfId} — raw: "${extractField(normalizeFieldBreaks(rawText), "DATE DE LA TRANSACTION") ?? "(none)"}"`);
      return;
    }

    const oldDate = decl.transactionDate;
    const dateFixed = oldDate ? newDate.getTime() !== new Date(oldDate).getTime() : true;

    const updates = {};
    if (dateFixed) updates.transactionDate = newDate;
    // Also patch ISIN if we newly extract one
    if (!decl.isin && parsed.isin) updates.isin = parsed.isin;
    // Patch totalAmount if missing and we can compute it
    if (!decl.totalAmount && parsed.totalAmount) updates.totalAmount = parsed.totalAmount;

    if (Object.keys(updates).length === 0) { stats.alreadyCorrect++; return; }

    if (!DRY_RUN) {
      await prisma.declaration.update({ where: { id: decl.id }, data: updates });
    }

    stats.fixed++;
    if (VERBOSE || stats.fixed <= 10) {
      console.log(`  [fixed] ${decl.amfId} | date: ${oldDate?.toISOString().slice(0,10)} → ${newDate.toISOString().slice(0,10)}${parsed.isin && updates.isin ? ` | isin: ${parsed.isin}` : ""}`);
    }

    stats.samples.push({
      amfId: decl.amfId,
      company: decl.company?.name,
      oldDate: oldDate?.toISOString().slice(0,10),
      newDate: newDate.toISOString().slice(0,10),
      isinAdded: updates.isin ?? null,
    });

  } catch (err) {
    stats.errors++;
    if (VERBOSE) console.error(`  [error] ${decl.amfId}:`, err.message);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔧  repair-dates.mjs — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`    concurrency=${CONCURRENCY}  limit=${LIMIT}\n`);

  const toRepair = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      OR: [
        { transactionDate: { lt: MIN_DATE } },
        { transactionDate: { gt: MAX_DATE } },
      ],
    },
    orderBy: { pubDate: "desc" },
    take: LIMIT,
    select: {
      id: true, amfId: true, pdfUrl: true,
      transactionDate: true, isin: true, totalAmount: true,
      company: { select: { name: true } },
    },
  });

  console.log(`📊  Found ${toRepair.length} declarations with anomalous dates to repair.`);
  if (toRepair.length === 0) { console.log("✅  Nothing to repair!"); await prisma.$disconnect(); return; }

  // Year distribution of the bad dates
  const yearCounts = {};
  for (const d of toRepair) {
    const yr = d.transactionDate ? new Date(d.transactionDate).getFullYear() : "null";
    yearCounts[yr] = (yearCounts[yr] ?? 0) + 1;
  }
  console.log("  Bad year distribution:", Object.entries(yearCounts).sort(([a],[b]) => +a - +b).map(([y,c]) => `${y}:${c}`).join("  "));

  const stats = {
    total: toRepair.length,
    fixed: 0,
    alreadyCorrect: 0,
    dateNotFound: 0,
    fetchFail: 0,
    emptyText: 0,
    noUrl: 0,
    errors: 0,
    samples: [],
  };

  // Process in batches
  for (let i = 0; i < toRepair.length; i += CONCURRENCY) {
    const batch = toRepair.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(d => repairDeclaration(d, stats)));
    const pct = Math.round((i + batch.length) / toRepair.length * 100);
    process.stdout.write(`\r  Progress: ${i + batch.length}/${toRepair.length} (${pct}%)  fixed=${stats.fixed}  fail=${stats.fetchFail + stats.errors}  `);
    // Rate-limit
    if (i + CONCURRENCY < toRepair.length) await new Promise(r => setTimeout(r, 500));
  }

  console.log("\n");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("                     REPAIR REPORT");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Total with anomalous dates : ${stats.total}`);
  console.log(`✅ Fixed                   : ${stats.fixed}`);
  console.log(`➖ Already correct          : ${stats.alreadyCorrect}`);
  console.log(`❓ Date not found in PDF    : ${stats.dateNotFound}`);
  console.log(`❌ PDF fetch failures       : ${stats.fetchFail}`);
  console.log(`⚠️  Empty PDF text          : ${stats.emptyText}`);
  console.log(`🔗 No PDF URL              : ${stats.noUrl}`);
  console.log(`💥 Errors                  : ${stats.errors}`);
  console.log("═══════════════════════════════════════════════════════════════");

  // Save report
  const report = {
    generatedAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    stats,
    badYearDistribution: yearCounts,
    sampleFixes: stats.samples.slice(0, 100),
  };

  if (!DRY_RUN) {
    appendFileSync(LOG_FILE, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to ${LOG_FILE}`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
