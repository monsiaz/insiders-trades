import { parsePdfText, debugParse, TradeDetails } from "./pdf-parser";

const AMF_API_BASE = "https://bdif.amf-france.org/back/api/v1";
const AMF_DOC_BASE = "https://bdif.amf-france.org/back/api/v1/documents";

interface AmfDocumentInfo {
  path: string;
  nomFichier: string;
  accessible: boolean;
}

export async function fetchDeclarationDetail(
  amfId: string,
  debug = false
): Promise<TradeDetails | null> {
  try {
    // Step 1: Get document metadata to find the PDF path
    const metaRes = await fetch(`${AMF_API_BASE}/informations/${amfId}?lang=fr`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!metaRes.ok) return null;
    const meta = await metaRes.json();

    const docs: AmfDocumentInfo[] = meta.documents || [];
    const pdfDoc = docs.find(
      (d) =>
        d.accessible &&
        d.nomFichier?.toLowerCase().match(/\.(pdf)$/)
    );

    if (!pdfDoc?.path) return null;

    const pdfUrl = `${AMF_DOC_BASE}/${pdfDoc.path}`;

    // Step 2: Download PDF
    const pdfRes = await fetch(pdfUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(20000),
    });

    if (!pdfRes.ok) return null;

    const pdfBuffer = await pdfRes.arrayBuffer();

    // Step 3: Extract text (pdfjs-dist first, pdf-parse as fallback)
    const text = await extractPdfText(Buffer.from(pdfBuffer));
    if (!text || text.trim().length < 30) return null;

    const result = parsePdfText(text, pdfUrl);

    if (debug) {
      console.log(`[DEBUG] ${amfId}:`, JSON.stringify(debugParse(text), null, 2));
    }

    return result;
  } catch (err) {
    console.error(`Error fetching declaration ${amfId}:`, err);
    return null;
  }
}

/**
 * Extract plain text from a PDF buffer.
 * Tries pdfjs-dist first (handles modern/compressed PDFs), then pdf-parse as fallback.
 */
async function extractPdfText(buffer: Buffer): Promise<string | null> {
  // Attempt 1: pdfjs-dist (handles bad XRef tables, compressed streams)
  try {
    const text = await extractWithPdfjs(buffer);
    if (text && text.trim().length > 30) return text;
  } catch {
    // fall through
  }

  // Attempt 2: pdf-parse (good for older flat PDFs)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (
      buf: Buffer,
      opts?: Record<string, unknown>
    ) => Promise<{ text: string }>;
    const data = await pdfParse(buffer, { max: 0 });
    if (data.text && data.text.trim().length > 30) return data.text;
  } catch {
    // fall through
  }

  // Attempt 3: raw BT/ET block extraction (last resort for uncompressed streams)
  try {
    const raw = buffer.toString("latin1");
    const text = extractRawPdfText(raw);
    if (text && text.trim().length > 50) return text;
  } catch {
    // give up
  }

  return null;
}

/**
 * Use pdfjs-dist to extract text with proper line-break preservation.
 */
async function extractWithPdfjs(buffer: Buffer): Promise<string> {
  // Dynamic import to avoid bundling issues
  const { getDocument } = await import(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    "pdfjs-dist/legacy/build/pdf.mjs"
  );

  const data = new Uint8Array(buffer);
  const loadingTask = getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    // Suppress font warning — we don't need font rendering
    standardFontDataUrl: undefined,
  });

  // Suppress non-critical warnings (type cast needed as pdfjs types are incomplete)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (loadingTask as any).onUnsupportedFeature = () => {};

  const pdf = await loadingTask.promise;
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    for (const item of content.items as Array<{ str: string; hasEOL: boolean }>) {
      fullText += item.str;
      fullText += item.hasEOL ? "\n" : " ";
    }
    fullText += "\n";
  }

  return fullText;
}

/**
 * Fallback: minimal text extraction from raw PDF bytes (uncompressed streams only).
 */
function extractRawPdfText(raw: string): string {
  const parts: string[] = [];

  // Extract strings from PDF BT/ET text blocks
  for (const block of raw.matchAll(/BT\s*([\s\S]*?)\s*ET/g)) {
    for (const s of block[1].matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g)) {
      const decoded = s[1]
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\\\/g, "\\")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")");
      parts.push(decoded);
    }
  }

  return parts.join(" ").replace(/ {2,}/g, " ").trim();
}
