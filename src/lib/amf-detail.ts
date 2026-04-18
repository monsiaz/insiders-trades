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
      (d) => d.accessible && d.nomFichier?.toLowerCase().endsWith(".pdf")
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

    // Step 3: Extract text (with fallback for corrupted XRef tables)
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

async function extractPdfText(buffer: Buffer): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (
    buf: Buffer,
    opts?: Record<string, unknown>
  ) => Promise<{ text: string }>;

  // Attempt 1: normal parsing
  try {
    const data = await pdfParse(buffer, { max: 0 });
    if (data.text && data.text.trim().length > 20) return data.text;
  } catch {
    // Fall through to attempt 2
  }

  // Attempt 2: relaxed parsing (tolerant of bad XRef entries)
  try {
    const data = await pdfParse(buffer, {
      max: 0,
      // Some pdf-parse builds accept a `version` override
      version: "v1.10.100",
    });
    if (data.text && data.text.trim().length > 20) return data.text;
  } catch {
    // Fall through
  }

  // Attempt 3: try extracting text from raw buffer using a simple heuristic
  // (reads printable ASCII runs between PDF stream markers)
  try {
    const raw = buffer.toString("latin1");
    const text = extractTextFromRawPdf(raw);
    if (text && text.trim().length > 50) return text;
  } catch {
    // Give up
  }

  return null;
}

/**
 * Minimal fallback: extract printable text from raw PDF bytes.
 * Useful for PDFs with corrupted XRef tables that pdf-parse can't handle.
 */
function extractTextFromRawPdf(raw: string): string {
  const parts: string[] = [];

  // Extract text between BT and ET (PDF text blocks)
  const btEt = raw.matchAll(/BT\s*([\s\S]*?)\s*ET/g);
  for (const m of btEt) {
    const block = m[1];
    // Extract strings in parentheses: (Hello World)
    const strMatches = block.matchAll(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/g);
    for (const s of strMatches) {
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

  if (parts.length === 0) {
    // Try extracting text from stream objects directly
    const streams = raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g);
    for (const s of streams) {
      const printable = s[1].replace(/[^\x20-\x7E\n\r\t]/g, " ");
      if (printable.match(/[A-Za-z]{3}/)) parts.push(printable);
    }
  }

  return parts.join(" ").replace(/ {2,}/g, " ").trim();
}
