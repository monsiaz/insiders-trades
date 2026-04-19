/**
 * OCR test on 10 image-based AMF PDFs
 *
 * Pipeline per declaration:
 *   1. Download PDF via AMF API
 *   2. Convert each page to PNG via ImageMagick (magick)
 *   3. Run Tesseract with -l fra (French) on each PNG
 *   4. Check if key fields are recognizable
 *
 * Requirements: magick (ImageMagick v7), tesseract-ocr with fra language pack
 */

import { PrismaClient } from "@prisma/client";
import { execSync, spawnSync } from "child_process";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import path from "path";
import os from "os";

const prisma = new PrismaClient();
const AMF_API = "https://bdif.amf-france.org/back/api/v1";
const SAMPLE_SIZE = 10;

// Check tools
function checkTool(cmd) {
  try { execSync(`which ${cmd}`, { stdio: "ignore" }); return true; } catch { return false; }
}

async function downloadPdf(amfId) {
  const metaRes = await fetch(`${AMF_API}/informations/${amfId}?lang=fr`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!metaRes.ok) return null;
  const meta = await metaRes.json();
  const pdfDoc = (meta.documents || []).find(d => d.accessible && d.nomFichier?.toLowerCase().endsWith(".pdf"));
  if (!pdfDoc?.path) return null;

  const pdfRes = await fetch(`${AMF_API}/documents/${pdfDoc.path}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!pdfRes.ok) return null;
  return { buf: Buffer.from(await pdfRes.arrayBuffer()), name: pdfDoc.nomFichier };
}

function pdfToImages(pdfPath, outputDir) {
  // Use magick to convert PDF pages to PNG at 300 DPI
  const result = spawnSync("magick", [
    "-density", "300",
    "-quality", "90",
    pdfPath,
    path.join(outputDir, "page-%02d.png"),
  ], { timeout: 30000 });
  if (result.status !== 0) {
    // Try GhostScript fallback
    const gs = spawnSync("gs", [
      "-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m",
      "-r300", "-dTextAlphaBits=4", "-dGraphicsAlphaBits=4",
      `-sOutputFile=${path.join(outputDir, "page-%02d.png")}`,
      pdfPath,
    ], { timeout: 30000 });
    return gs.status === 0;
  }
  return true;
}

function runTesseract(imagePath) {
  const result = spawnSync("tesseract", [
    imagePath, "stdout",
    "-l", "fra",
    "--oem", "3",    // LSTM engine
    "--psm", "3",    // fully automatic page segmentation
  ], { timeout: 20000, encoding: "utf8" });
  return result.stdout || "";
}

function parseFields(text) {
  const t = text.replace(/\n/g, " ").replace(/  +/g, " ");
  return {
    hasNature: /NATURE DE LA TRANSACTION/i.test(t),
    hasPrix: /PRIX UNITAIRE|PRIX\s*:/i.test(t),
    hasVolume: /\bVOLUME\b/i.test(t),
    hasNom: /NOM\s*[\/|]\s*FONCTION/i.test(t),
    hasIsin: /\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/.test(t),
    hasDate: /DATE DE LA TRANSACTION/i.test(t),
    charCount: t.trim().length,
    preview: t.trim().slice(0, 400),
  };
}

async function main() {
  console.log("=== OCR Test on 10 image-based AMF PDFs ===\n");

  // Check tools
  const hasMagick   = checkTool("magick");
  const hasTesseract = checkTool("tesseract");
  const hasGs       = checkTool("gs");

  console.log(`Tools: magick=${hasMagick} tesseract=${hasTesseract} ghostscript=${hasGs}`);
  if (!hasTesseract) { console.error("Tesseract not found!"); process.exit(1); }

  // Check French language pack
  const langCheck = spawnSync("tesseract", ["--list-langs"], { encoding: "utf8" });
  const hasFra = langCheck.stdout.includes("fra");
  const lang = hasFra ? "fra" : "eng";
  console.log(`Tesseract languages: ${langCheck.stdout.trim().replace(/\n/g, ", ")} → using: ${lang}\n`);

  // Get 10 unparsed declarations
  const decls = await prisma.declaration.findMany({
    where: { type: "DIRIGEANTS", transactionNature: null },
    select: { id: true, amfId: true, pubDate: true },
    orderBy: { pubDate: "desc" },
    take: SAMPLE_SIZE,
  });
  await prisma.$disconnect();

  console.log(`Testing ${decls.length} declarations:\n`);

  const tmpBase = path.join(os.tmpdir(), "amf-ocr-test");
  if (existsSync(tmpBase)) rmSync(tmpBase, { recursive: true });
  mkdirSync(tmpBase, { recursive: true });

  const results = [];

  for (const decl of decls) {
    const dir = path.join(tmpBase, decl.amfId);
    mkdirSync(dir, { recursive: true });

    process.stdout.write(`  ${decl.amfId} (${decl.pubDate.toISOString().slice(0,10)})…`);

    // 1. Download
    const downloaded = await downloadPdf(decl.amfId);
    if (!downloaded) { console.log(" ✗ no PDF"); results.push({ amfId: decl.amfId, success: false, reason: "no PDF" }); continue; }

    const pdfPath = path.join(dir, "declaration.pdf");
    writeFileSync(pdfPath, downloaded.buf);
    process.stdout.write(` PDF:${downloaded.buf.length}B`);

    // 2. Convert to image
    const converted = pdfToImages(pdfPath, dir);
    if (!converted) { console.log(" ✗ conversion failed"); results.push({ amfId: decl.amfId, success: false, reason: "conversion failed" }); continue; }

    // Find generated PNGs
    const { readdirSync } = await import("fs");
    const pngs = readdirSync(dir).filter(f => f.endsWith(".png")).sort();
    process.stdout.write(` pages:${pngs.length}`);

    if (!pngs.length) { console.log(" ✗ no images"); results.push({ amfId: decl.amfId, success: false, reason: "no images" }); continue; }

    // 3. OCR all pages
    let fullText = "";
    for (const png of pngs) {
      const t = runTesseract(path.join(dir, png));
      fullText += t + "\n";
    }

    // 4. Parse
    const fields = parseFields(fullText);
    const success = fields.charCount > 100;
    results.push({ amfId: decl.amfId, success, fields });

    console.log(` chars:${fields.charCount} | fields:${[
      fields.hasNom ? "NOM" : "",
      fields.hasNature ? "NATURE" : "",
      fields.hasDate ? "DATE" : "",
      fields.hasPrix ? "PRIX" : "",
      fields.hasVolume ? "VOL" : "",
      fields.hasIsin ? "ISIN" : "",
    ].filter(Boolean).join(",")||"none"}`);

    if (success && fields.charCount > 200) {
      console.log(`    Preview: ${fields.preview.slice(0, 250).replace(/\n/g, " ↵ ")}\n`);
    }
  }

  // Summary
  const successes = results.filter(r => r.success);
  const withFields = results.filter(r => r.fields?.hasNature || r.fields?.hasNom);

  console.log("\n=== SUMMARY ===");
  console.log(`Total tested:        ${results.length}`);
  console.log(`OCR extracted text:  ${successes.length}/${results.length}`);
  console.log(`With useful fields:  ${withFields.length}/${results.length}`);

  if (withFields.length > 0) {
    console.log("\n🎯 OCR WORKS! At least some image PDFs are parseable.");
    console.log("   Running full OCR pass could unlock significant data.");
  } else if (successes.length > 0) {
    console.log("\n⚠️  OCR extracts some text but fields are not structured enough.");
    console.log("   Results might still be partially useful after regex tuning.");
  } else {
    console.log("\n❌ OCR did not produce usable text on this sample.");
  }

  // Cleanup
  rmSync(tmpBase, { recursive: true });
}

main().catch(e => { console.error(e); process.exit(1); });
