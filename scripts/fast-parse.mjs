/**
 * fast-parse.mjs — Local parallel PDF parser
 * Runs CONCURRENCY workers simultaneously, no Vercel overhead.
 * Usage: node scripts/fast-parse.mjs [concurrency=20]
 */

import { PrismaClient } from "@prisma/client";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONCURRENCY = parseInt(process.argv[2] ?? "20", 10);
const BATCH_SIZE = 200; // how many to fetch per DB query

const prisma = new PrismaClient({ log: ["error"] });

// ─── PDF text extraction via pdfjs-dist ────────────────────────────────────

async function extractPdfText(buffer) {
  try {
    const pdfjsLib = await import("../node_modules/pdfjs-dist/legacy/build/pdf.mjs");
    const pdfjsLibModule = pdfjsLib.default || pdfjsLib;

    // Disable worker in Node.js
    pdfjsLibModule.GlobalWorkerOptions.workerSrc = "";
    pdfjsLibModule.GlobalWorkerOptions.workerPort = null;

    const loadingTask = pdfjsLibModule.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines = content.items.map((item) => item.str ?? "").join(" ");
      fullText += lines + "\n";
    }
    return fullText;
  } catch {
    return null;
  }
}

// ─── AMF PDF fetch ──────────────────────────────────────────────────────────

const AMF_API = "https://bdif.amf-france.org/back/api/v1";

async function fetchAndParse(amfId) {
  // 1. Get metadata
  const metaRes = await fetch(`${AMF_API}/informations/${amfId}?lang=fr`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!metaRes.ok) return null;
  const meta = await metaRes.json();

  const pdfDoc = (meta.documents || []).find(
    (d) => d.accessible && d.nomFichier?.toLowerCase().endsWith(".pdf")
  );
  if (!pdfDoc?.path) return null;

  const pdfUrl = `${AMF_API}/documents/${pdfDoc.path}`;

  // 2. Download PDF
  const pdfRes = await fetch(pdfUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!pdfRes.ok) return null;

  const buf = Buffer.from(await pdfRes.arrayBuffer());
  const text = await extractPdfText(buf);
  if (!text || text.trim().length < 30) return null;

  return { text, pdfUrl };
}

// ─── Parsing helpers (ported from pdf-parser.ts) ──────────────────────────

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
  const cleaned = raw.replace(/[^\d,. ]/g, "").trim()
    .replace(/\s/g, "")
    .replace(/,(\d{1,2})$/, ".$1")
    .replace(/,/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : val;
}

function parseDate(raw) {
  if (!raw) return undefined;
  const months = { janvier:1, février:2, mars:3, avril:4, mai:5, juin:6,
    juillet:7, août:8, septembre:9, octobre:10, novembre:11, décembre:12 };
  const mFr = raw.match(/(\d{1,2})\s+([a-zéûôê]+)\s+(\d{4})/i);
  if (mFr) {
    const month = months[mFr[2].toLowerCase()];
    if (month) return new Date(Date.UTC(+mFr[1], month - 1, +mFr[3]));
  }
  const mIso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return new Date(Date.UTC(+mIso[1], +mIso[2] - 1, +mIso[3]));
  const mSlash = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mSlash) return new Date(Date.UTC(+mSlash[3], +mSlash[2] - 1, +mSlash[1]));
  const iso = new Date(raw);
  return isNaN(iso.getTime()) ? undefined : iso;
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
const COUNTRY_CODES = new Set([
  "FR","DE","US","GB","NL","BE","IT","ES","CH","LU","SE","NO","DK","FI",
  "PT","AT","IE","CA","AU","JP","HK","SG","KY","BMU","GG","JE","IM",
]);

function isLikelyIsin(s) {
  if (s.length !== 12) return false;
  if (COUNTRY_CODES.has(s.slice(0, 2))) return true;
  const digits = (s.slice(2).match(/\d/g) || []).length;
  return digits >= 6;
}

function extractIsin(text) {
  const norm = normalizeApostrophes(text);
  const textNl = norm.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (const label of ["CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER", "CODE ISIN", "ISIN"]) {
    const val = extractField(norm, label);
    if (val) {
      const m = val.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);
      if (m && isLikelyIsin(m[1])) return m[1];
    }
  }
  const dashes = "[-–—−\u2012\u2013\u2014]";
  const hm = textNl.match(new RegExp(`\n([A-Z]{2}[A-Z0-9]{9}[0-9])\\s*${dashes}\\s*[A-Z0-9]`));
  if (hm && isLikelyIsin(hm[1])) return hm[1];
  const head = textNl.slice(0, 600);
  for (const m of head.matchAll(STRICT_ISIN_RE)) {
    if (isLikelyIsin(m[1])) return m[1];
  }
  return undefined;
}

function extractInsiderInfo(text) {
  const norm = normalizeApostrophes(text).replace(/\r\n/g, "\n");
  const sectionMatch = norm.match(
    /NOM\s*[/\/]\s*FONCTION[\s\S]{0,300}?LIEE\s*:\s*\n([\s\S]*?)(?=\n(?:NOTIFICATION|COORDONNEES|$))/i
  );
  let raw = sectionMatch ? sectionMatch[1].trim() : "";
  if (!raw) {
    const alt = norm.match(/SOUS LA RESPONSABILITE EXCLUSIVE DU DECLARANT\.[\s\S]*?\n\n([\s\S]*?)(?=\nNOTIFICATION|\nCOORDONNEES)/i);
    if (alt) raw = alt[1].trim();
  }
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
  const dateRaw = extractField(text, "DATE DE LA TRANSACTION");
  result.transactionDate = parseDate(dateRaw);
  return result;
}

// ─── Worker ────────────────────────────────────────────────────────────────

async function processOne(decl) {
  try {
    const fetched = await fetchAndParse(decl.amfId);

    if (!fetched) {
      await prisma.declaration.update({
        where: { id: decl.id },
        data: { pdfParsed: true }, // mark as attempted
      });
      return { ok: false };
    }

    const details = parsePdfText(fetched.text, fetched.pdfUrl);

    await prisma.declaration.update({
      where: { id: decl.id },
      data: {
        pdfParsed: true,
        pdfUrl: fetched.pdfUrl,
        insiderName: details.insiderName ?? undefined,
        insiderFunction: details.insiderFunction ?? undefined,
        transactionNature: details.transactionNature ?? undefined,
        instrumentType: details.instrumentType ?? undefined,
        isin: details.isin ?? undefined,
        unitPrice: details.unitPrice ?? undefined,
        volume: details.volume ?? undefined,
        totalAmount: details.totalAmount ?? undefined,
        currency: details.currency ?? undefined,
        transactionDate: details.transactionDate ?? undefined,
        transactionVenue: details.transactionVenue ?? undefined,
      },
    });
    return { ok: true, hasIsin: !!details.isin, hasAmount: !!details.totalAmount };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  const [total, parsed] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true } }),
  ]);
  const remaining = total - parsed;

  console.log(`🚀 Fast-parse: ${remaining} remaining / ${total} total`);
  console.log(`   Workers: ${CONCURRENCY} parallel`);
  console.log(`   Estimated time: ~${Math.round(remaining / (CONCURRENCY * 0.5) / 60)} min\n`);

  let done = 0, success = 0, withIsin = 0, withAmount = 0;

  while (true) {
    // Fetch a batch of unparsed declarations
    const batch = await prisma.declaration.findMany({
      where: { type: "DIRIGEANTS", pdfParsed: false },
      orderBy: { pubDate: "desc" },
      take: BATCH_SIZE,
      select: { id: true, amfId: true },
    });

    if (batch.length === 0) break;

    // Process in chunks of CONCURRENCY
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(processOne));

      for (const r of results) {
        done++;
        if (r.ok) { success++; if (r.hasIsin) withIsin++; if (r.hasAmount) withAmount++; }
      }

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const rate = Math.round(done / elapsed * 60);
      const remaining2 = remaining - done;
      const eta = rate > 0 ? Math.round(remaining2 / rate) : '?';

      process.stdout.write(
        `\r  ✓ ${done}/${remaining} | rate: ${rate}/min | ETA: ${eta}min | isin: ${withIsin} | amount: ${withAmount}    `
      );
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n\n✅ Done in ${Math.floor(elapsed/60)}m${elapsed%60}s`);
  console.log(`   Processed: ${done} | Success: ${success} | With ISIN: ${withIsin} | With Amount: ${withAmount}`);

  const [finalTotal, finalParsed, finalIsin, finalAmount] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", isin: { not: null } } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", totalAmount: { not: null } } }),
  ]);
  console.log(`\nDB status:`);
  console.log(`  Total: ${finalTotal} | Parsed: ${finalParsed} (${Math.round(finalParsed/finalTotal*100)}%)`);
  console.log(`  ISIN: ${finalIsin} | Amount: ${finalAmount}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
