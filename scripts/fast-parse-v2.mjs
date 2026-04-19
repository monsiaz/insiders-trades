/**
 * fast-parse-v2.mjs — Local PDF parser using pdftotext (poppler)
 *
 * pdfjs fails on these AMF PDFs (font encoding issues).
 * pdftotext from poppler handles them perfectly.
 *
 * Targets: declarations with pdfParsed=false OR transactionNature=null
 *
 * Usage:
 *   node scripts/fast-parse-v2.mjs [--concurrency=20] [--reset]
 *   --reset: re-parse declarations already marked pdfParsed=true but with no transactionNature
 */

import { PrismaClient } from "@prisma/client";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import path from "path";
import os from "os";

const args = process.argv.slice(2);
const CONCURRENCY = parseInt(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "20");
const RESET = args.includes("--reset");
const BATCH_SIZE = 500;

const prisma = new PrismaClient({ log: ["error"] });
const AMF_API = "https://bdif.amf-france.org/back/api/v1";

// ── PDF extraction via pdftotext ────────────────────────────────────────────

function extractWithPoppler(buf) {
  const tmp = path.join(os.tmpdir(), `amf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  try {
    writeFileSync(tmp, buf);
    const r = spawnSync("pdftotext", [tmp, "-"], { timeout: 15000, encoding: "utf8" });
    return r.stdout ?? "";
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

// ── Parsing helpers (same as fast-parse.mjs) ───────────────────────────────

const KNOWN_LABELS = [
  "DATE DE LA TRANSACTION", "LIEU DE LA TRANSACTION", "NATURE DE LA TRANSACTION",
  "DESCRIPTION DE L'INSTRUMENT FINANCIER", "CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER",
  "CODE ISIN", "PRIX UNITAIRE", "VOLUME", "INFORMATIONS AGREGEES",
  "INFORMATION DETAILLEE PAR OPERATION", "NOTIFICATION INITIALE",
  "NOTIFICATION INITIALE / MODIFICATION", "COORDONNEES DE L'EMETTEUR",
  "DETAIL DE LA TRANSACTION", "NOM / FONCTION", "NOM /FONCTION",
  "TRANSACTION LIEE", "DATE DE RECEPTION", "COMMENTAIRES",
];

function normalizeApostrophes(s) {
  return s.replace(/[\u2018\u2019\u02BC\u0060\u00B4]/g, "'");
}

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
  const cleaned = raw.replace(/[^\d,. ]/g, "").trim().replace(/\s/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : val;
}

function parseDate(raw) {
  if (!raw) return undefined;
  const months = { janvier:1, février:2, mars:3, avril:4, mai:5, juin:6, juillet:7, août:8, septembre:9, octobre:10, novembre:11, décembre:12 };
  const mFr = raw.match(/(\d{1,2})\s+([a-zéûôê]+)\s+(\d{4})/i);
  if (mFr) { const month = months[mFr[2].toLowerCase()]; if (month) return new Date(Date.UTC(+mFr[1], month - 1, +mFr[3])); }
  const mIso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return new Date(Date.UTC(+mIso[1], +mIso[2] - 1, +mIso[3]));
  const mSlash = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mSlash) return new Date(Date.UTC(+mSlash[3], +mSlash[2] - 1, +mSlash[1]));
  return undefined;
}

function parseCurrency(raw) {
  if (!raw) return "EUR";
  const r = raw.toLowerCase();
  if (r.includes("euro") || r.includes("eur") || r.includes("€")) return "EUR";
  if (r.includes("usd") || r.includes("dollar")) return "USD";
  if (r.includes("gbp") || r.includes("sterling")) return "GBP";
  if (r.includes("chf")) return "CHF";
  const m = raw.match(/[A-Z]{3}/);
  return m ? m[0] : "EUR";
}

const COUNTRY_CODES = new Set(["FR","DE","US","GB","NL","BE","IT","ES","CH","LU","SE","NO","DK","FI","PT","AT","IE","CA","AU","JP","HK","SG","KY"]);
function isLikelyIsin(s) {
  if (s.length !== 12) return false;
  if (COUNTRY_CODES.has(s.slice(0, 2))) return true;
  return (s.slice(2).match(/\d/g) || []).length >= 6;
}
function extractIsin(text) {
  const norm = normalizeApostrophes(text);
  for (const label of ["CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER", "CODE ISIN", "ISIN"]) {
    const val = extractField(norm, label);
    if (val) { const m = val.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/); if (m && isLikelyIsin(m[1])) return m[1]; }
  }
  const allMatches = [...norm.matchAll(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/g)];
  for (const m of allMatches) { if (isLikelyIsin(m[1])) return m[1]; }
  return undefined;
}

function extractInsiderInfo(text) {
  const norm = normalizeApostrophes(text);
  let raw = extractField(norm, "NOM /FONCTION DE LA PERSONNE EXERCANT DES RESPONSABILITES DIRIGEANTES OU DE LA PERSONNE ETROITEMENT LIEE") ||
            extractField(norm, "NOM / FONCTION") || extractField(norm, "NOM /FONCTION");
  if (!raw) {
    const dm = norm.match(/NOM\s*[/\/]\s*FONCTION[^\n]*\n\n?([\s\S]{1,300}?)(?=\nNOTIFICATION|\nCOORDONNEES|\n\n)/i);
    if (dm) raw = dm[1].trim();
  }
  if (!raw) return {};
  const lieMatch = raw.match(/li[eé]e?\s+à\s+([\w\s\-ÉÈÊËÀÂÙÛÎÏÔÇ]+?)(?:,\s*(.+?))?(?:\n|$)/i);
  if (lieMatch) return { name: lieMatch[1].trim().replace(/\s+/g, " ") || undefined, function: lieMatch[2]?.trim() || undefined };
  const firstLine = raw.split("\n")[0].trim();
  const commaIdx = firstLine.indexOf(",");
  if (commaIdx > 2) return { name: firstLine.substring(0, commaIdx).trim().substring(0, 120), function: firstLine.substring(commaIdx + 1).trim().substring(0, 120) || undefined };
  if (firstLine.length > 2) return { name: firstLine.substring(0, 120) };
  return {};
}

function extractOpeningPrice(text) {
  const m = text.match(/[Cc]ours\s+d['']ouverture\s*:?\s*([\d.,\s]+)\s*[€EeUuRr]/);
  return m ? parsePrice(m[1]) : undefined;
}

function parsePdfText(rawText, pdfUrl) {
  const result = { pdfUrl };
  if (!rawText || rawText.trim().length < 50) return result;
  const text = normalizeFieldBreaks(rawText);
  const insiderInfo = extractInsiderInfo(text);
  result.insiderName = insiderInfo.name;
  result.insiderFunction = insiderInfo.function;
  result.transactionNature = extractField(text, "NATURE DE LA TRANSACTION");
  result.instrumentType = extractField(text, "DESCRIPTION DE L'INSTRUMENT FINANCIER");
  result.transactionVenue = extractField(text, "LIEU DE LA TRANSACTION");
  result.isin = extractIsin(text);

  const agregSection = text.match(/INFORMATIONS AGREGEES\s*\n([\s\S]*?)(?=\nTRANSACTION LIEE|\nDATE DE RECEPTION|$)/i);
  if (agregSection) {
    const ag = agregSection[1];
    const priceMatch = ag.match(/PRIX\s*:\s*([\d\s.,]+(?:\s*[A-Za-z\u00C0-\u024F\s€$£]+)?)/i);
    const volMatch = ag.match(/VOLUME\s*:\s*([\d\s.,]+)/i);
    if (priceMatch) { result.unitPrice = parsePrice(priceMatch[1]); result.currency = parseCurrency(priceMatch[1]); }
    if (volMatch) result.volume = parsePrice(volMatch[1]);
  }
  if (result.unitPrice == null) {
    const priceRaw = extractField(text, "PRIX UNITAIRE");
    if (priceRaw) { result.unitPrice = parsePrice(priceRaw); result.currency = parseCurrency(priceRaw); }
  }
  if (!result.currency) result.currency = "EUR";
  if (result.volume == null) result.volume = parsePrice(extractField(text, "VOLUME"));

  const nature = (result.transactionNature ?? "").toLowerCase();
  const isAttribution = nature.includes("attribution") || nature.includes("gratuites");
  const isExercice = nature.includes("exercice") || nature.includes("option");
  if (result.unitPrice != null && result.unitPrice > 0 && result.volume != null) {
    result.totalAmount = Math.round(result.unitPrice * result.volume * 100) / 100;
  } else if ((isAttribution || isExercice) && result.volume != null && result.volume > 0) {
    const openPrice = extractOpeningPrice(text);
    if (openPrice && openPrice > 0) {
      result.totalAmount = Math.round(openPrice * result.volume * 100) / 100;
      result.unitPrice = openPrice;
    } else {
      result.unitPrice = 0;
    }
  }
  result.transactionDate = parseDate(extractField(text, "DATE DE LA TRANSACTION"));
  return result;
}

// ── AMF fetch ────────────────────────────────────────────────────────────────

async function fetchAndParse(amfId) {
  const metaRes = await fetch(`${AMF_API}/informations/${amfId}?lang=fr`, {
    headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12000),
  });
  if (!metaRes.ok) return null;
  const meta = await metaRes.json();
  const pdfDoc = (meta.documents || []).find(d => d.accessible && d.nomFichier?.toLowerCase().endsWith(".pdf"));
  if (!pdfDoc?.path) return null;
  const pdfRes = await fetch(`${AMF_API}/documents/${pdfDoc.path}`, {
    headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000),
  });
  if (!pdfRes.ok) return null;
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const text = extractWithPoppler(buf);
  if (!text || text.trim().length < 30) return null;
  const pdfUrl = `${AMF_API}/documents/${pdfDoc.path}`;
  return { text, pdfUrl };
}

async function processOne(decl) {
  try {
    const fetched = await fetchAndParse(decl.amfId);
    if (!fetched) {
      await prisma.declaration.update({ where: { id: decl.id }, data: { pdfParsed: true } });
      return { ok: false };
    }
    const details = parsePdfText(fetched.text, fetched.pdfUrl);
    await prisma.declaration.update({
      where: { id: decl.id },
      data: {
        pdfParsed: true,
        pdfUrl: details.pdfUrl ?? undefined,
        insiderName: details.insiderName ?? undefined,
        insiderFunction: details.insiderFunction ?? undefined,
        transactionNature: details.transactionNature ?? undefined,
        instrumentType: details.instrumentType ?? undefined,
        isin: details.isin ?? undefined,
        unitPrice: details.unitPrice ?? undefined,
        volume: details.volume ?? undefined,
        totalAmount: details.totalAmount ?? undefined,
        currency: details.currency ?? undefined,
        transactionVenue: details.transactionVenue ?? undefined,
        transactionDate: details.transactionDate ?? undefined,
      },
    });
    return { ok: true, hasIsin: !!details.isin, hasAmount: !!details.totalAmount };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = Date.now();

  // Count targets
  const where = RESET
    ? { type: "DIRIGEANTS", transactionNature: null }
    : { type: "DIRIGEANTS", pdfParsed: false };

  // If reset, mark all transactionNature=null as pdfParsed=false so the loop picks them up
  if (RESET) {
    console.log("Resetting pdfParsed=false for unparsed declarations…");
    const { count } = await prisma.declaration.updateMany({
      where: { type: "DIRIGEANTS", transactionNature: null },
      data: { pdfParsed: false },
    });
    console.log(`  Reset ${count} declarations\n`);
  }

  const total = await prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: false } });
  console.log(`🚀 fast-parse-v2 (pdftotext) — ${total} to process | concurrency: ${CONCURRENCY}`);
  console.log(`   ETA: ~${Math.round(total / (CONCURRENCY * 0.8) / 60)} min\n`);

  let done = 0, success = 0, withIsin = 0, withAmount = 0;

  while (true) {
    const batch = await prisma.declaration.findMany({
      where: { type: "DIRIGEANTS", pdfParsed: false },
      orderBy: { pubDate: "desc" },
      take: BATCH_SIZE,
      select: { id: true, amfId: true },
    });
    if (batch.length === 0) break;

    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(processOne));
      for (const r of results) {
        done++;
        if (r.ok) { success++; if (r.hasIsin) withIsin++; if (r.hasAmount) withAmount++; }
      }
      const elapsed = Math.round((Date.now() - t0) / 1000);
      const rate = elapsed > 0 ? Math.round(done / elapsed * 60) : 0;
      const eta = rate > 0 ? Math.round((total - done) / rate) : "?";
      process.stdout.write(`\r  ${done}/${total} | ✓ ${success} | rate: ${rate}/min | ETA: ${eta}min | isin: ${withIsin} | €: ${withAmount}    `);
    }
  }

  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`\n\n✅ Done in ${Math.floor(elapsed/60)}m${elapsed%60}s`);
  console.log(`   Processed: ${done} | Success: ${success} | ISIN: ${withIsin} | Amount: ${withAmount}`);

  // Final stats
  const [parsedTotal, withIsinTotal, withAmountTotal] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: { not: null } } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", isin: { not: null } } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", totalAmount: { not: null } } }),
  ]);
  console.log(`\nDB stats:`);
  console.log(`  Parsed (transactionNature): ${parsedTotal} / 25538`);
  console.log(`  With ISIN:   ${withIsinTotal}`);
  console.log(`  With Amount: ${withAmountTotal}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
