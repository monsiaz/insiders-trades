/**
 * repair-ocr-dates.mjs — Fix OCR-transposed years in transactionDate.
 *
 * Some AMF PDFs have dates where OCR confused digits:
 *   "2025" → "2925" (0→9), "2025" → "2502" (digit swap), "2022" → "2202", etc.
 *
 * This script handles the small set of records that repair-dates.mjs couldn't fix
 * because the raw PDF text also contains the corrupted year.
 *
 * Strategy: For each anomalous date, fetch PDF, look for the raw date field,
 * then try OCR correction heuristics:
 *   - Year > 2099: try replacing one digit at a time with probable correct values
 *   - Use pubDate as constraint: corrected year must be ≤ pubDate.year + 2
 */

import { PrismaClient } from "@prisma/client";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import path from "path";
import os from "os";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const prisma = new PrismaClient({ log: ["error"] });

const MIN_DATE = new Date("2003-01-01");

function extractWithPoppler(buf) {
  const tmp = path.join(os.tmpdir(), `amf-ocr-${Date.now()}.pdf`);
  try {
    writeFileSync(tmp, buf);
    const r = spawnSync("pdftotext", [tmp, "-"], { timeout: 12000, encoding: "utf8" });
    return r.stdout ?? "";
  } finally { try { unlinkSync(tmp); } catch {} }
}

function normalizeApostrophes(s) { return s.replace(/[\u2018\u2019\u02BC\u0060\u00B4]/g, "'"); }

const KNOWN_LABELS = ["DATE DE LA TRANSACTION","LIEU DE LA TRANSACTION","NATURE DE LA TRANSACTION",
  "DESCRIPTION DE L'INSTRUMENT FINANCIER","CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER",
  "CODE ISIN","PRIX UNITAIRE","VOLUME","INFORMATIONS AGREGEES","INFORMATION DETAILLEE PAR OPERATION",
  "NOTIFICATION INITIALE","NOTIFICATION INITIALE / MODIFICATION","COORDONNEES DE L'EMETTEUR",
  "DETAIL DE LA TRANSACTION","NOM / FONCTION","NOM /FONCTION","TRANSACTION LIEE","DATE DE RECEPTION","COMMENTAIRES"];

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
  return m ? m[1].trim().replace(/ {2,}/g, " ") || undefined : undefined;
}

const months = {
  janvier:1,"f\u00e9vrier":2,mars:3,avril:4,mai:5,juin:6,
  juillet:7,"ao\u00fbt":8,septembre:9,octobre:10,novembre:11,"d\u00e9cembre":12
};

/**
 * Try to fix an OCR-corrupted year by:
 * 1. Digit transpositions (2025→2502 etc.)
 * 2. Single digit substitutions (2925 → 2025, 3202 → 2025/2032)
 * maxYear: the publication year + 2 (upper bound)
 */
function tryFixYear(badYear, maxYear) {
  const s = String(badYear);
  const candidates = new Set();

  // Try all single-digit replacements
  for (let pos = 0; pos < s.length; pos++) {
    for (let d = 0; d <= 9; d++) {
      const candidate = parseInt(s.slice(0, pos) + d + s.slice(pos + 1));
      if (candidate >= 2003 && candidate <= maxYear) candidates.add(candidate);
    }
  }

  // Try digit swaps (any two positions)
  for (let i = 0; i < s.length; i++) {
    for (let j = i + 1; j < s.length; j++) {
      const arr = s.split("");
      [arr[i], arr[j]] = [arr[j], arr[i]];
      const candidate = parseInt(arr.join(""));
      if (candidate >= 2003 && candidate <= maxYear) candidates.add(candidate);
    }
  }

  // Return sorted list (prefer years closest to maxYear)
  return [...candidates].sort((a, b) => Math.abs(b - maxYear) - Math.abs(a - maxYear));
}

async function main() {
  console.log(`\n🔧  repair-ocr-dates.mjs — ${DRY_RUN ? "DRY RUN" : "LIVE"}\n`);

  const MAX_DATE = new Date(Date.now() + 18 * 30 * 24 * 60 * 60 * 1000);

  const records = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      OR: [
        { transactionDate: { lt: MIN_DATE } },
        { transactionDate: { gt: MAX_DATE } },
      ],
    },
    orderBy: { pubDate: "desc" },
    select: { id: true, amfId: true, pdfUrl: true, transactionDate: true, pubDate: true, company: { select: { name: true } } },
  });

  console.log(`Found ${records.length} remaining anomalous dates.\n`);

  let fixed = 0, noFix = 0, errors = 0;

  for (const decl of records) {
    try {
      if (!decl.pdfUrl) { noFix++; continue; }

      const res = await fetch(decl.pdfUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) { noFix++; continue; }

      const buf = Buffer.from(await res.arrayBuffer());
      const rawText = extractWithPoppler(buf);
      if (!rawText || rawText.trim().length < 30) { noFix++; continue; }

      const text = normalizeFieldBreaks(rawText);
      const dateRaw = extractField(text, "DATE DE LA TRANSACTION");
      if (!dateRaw) { noFix++; continue; }

      // Extract the raw year from the PDF date field
      // Try French: "12 février 3202" → try to fix 3202
      const mFr = dateRaw.match(/(\d{1,2})\s+([a-z\u00e9\u00fb\u00f4\u00ea]+)\s+(\d{4})/i);
      if (!mFr) { noFix++; continue; }

      const day = parseInt(mFr[1]);
      const month = months[mFr[2].toLowerCase()];
      const badYear = parseInt(mFr[3]);
      if (!month) { noFix++; continue; }

      // Max year allowed = pubDate.year + 2
      const maxYear = new Date(decl.pubDate).getFullYear() + 2;
      const candidates = tryFixYear(badYear, maxYear);

      if (candidates.length === 0) {
        console.log(`  [no-fix] ${decl.amfId} ${decl.company?.name} — raw: "${dateRaw}" (no candidate for badYear=${badYear}, maxYear=${maxYear})`);
        noFix++;
        continue;
      }

      // Use first candidate (best match based on proximity to pubDate)
      const correctedYear = candidates[0];
      const newDate = new Date(Date.UTC(correctedYear, month - 1, day));

      if (isNaN(newDate.getTime()) || newDate < MIN_DATE) { noFix++; continue; }

      console.log(`  [fix] ${decl.amfId} | ${decl.company?.name} | "${dateRaw}" → ${newDate.toISOString().slice(0,10)} (year ${badYear}→${correctedYear})`);

      if (!DRY_RUN) {
        await prisma.declaration.update({ where: { id: decl.id }, data: { transactionDate: newDate } });
      }
      fixed++;

    } catch (err) {
      errors++;
      console.error(`  [error] ${decl.amfId}:`, err.message?.slice(0,80));
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n══════════════════════════════════`);
  console.log(`OCR repair: fixed=${fixed}  no-fix=${noFix}  errors=${errors}`);
  console.log(`══════════════════════════════════`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
