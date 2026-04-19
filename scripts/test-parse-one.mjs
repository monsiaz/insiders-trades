// Test parsing a single "failed" declaration
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AMF_API = "https://bdif.amf-france.org/back/api/v1";

async function extractPdfText(buffer) {
  try {
    const pdfjsLib = await import("../node_modules/pdfjs-dist/legacy/build/pdf.mjs");
    const mod = pdfjsLib.default || pdfjsLib;
    mod.GlobalWorkerOptions.workerSrc = "";
    mod.GlobalWorkerOptions.workerPort = null;
    const task = mod.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true });
    const pdf = await task.promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str ?? "").join(" ") + "\n";
    }
    return fullText;
  } catch (e) {
    console.error("pdfjs error:", e.message);
    return null;
  }
}

async function main() {
  const p = new PrismaClient();
  // Get 5 unparsed IDs to test
  const unparsed = await p.declaration.findMany({
    where: { type: "DIRIGEANTS", transactionNature: null },
    select: { amfId: true },
    take: 10,
    orderBy: { pubDate: "desc" }
  });
  await p.$disconnect();

  let successCount = 0;
  let failCount = 0;
  let tooShortCount = 0;

  for (const { amfId } of unparsed) {
    try {
      const metaRes = await fetch(`${AMF_API}/informations/${amfId}?lang=fr`, {
        headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(10000)
      });
      const meta = await metaRes.json();
      const pdfDoc = (meta.documents || []).find(d => d.accessible && d.nomFichier?.toLowerCase().endsWith(".pdf"));
      if (!pdfDoc?.path) { console.log(amfId, "→ NO PDF"); failCount++; continue; }

      const pdfRes = await fetch(`${AMF_API}/documents/${pdfDoc.path}`, {
        headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000)
      });
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      const text = await extractPdfText(buf);
      
      if (!text || text.trim().length < 30) {
        console.log(amfId, `→ EMPTY TEXT (${text?.trim().length ?? 0} chars, ${buf.length} bytes)`);
        tooShortCount++;
      } else {
        successCount++;
        console.log(amfId, `→ GOT TEXT (${text.trim().length} chars)`);
        console.log("   First 200:", text.trim().slice(0, 200).replace(/\n/g, " ↵ "));
      }
    } catch (e) {
      console.log(amfId, "→ ERROR:", e.message);
      failCount++;
    }
  }

  console.log("\nResults:", { successCount, failCount, tooShortCount });
}

main().catch(e => { console.error(e); process.exit(1); });
