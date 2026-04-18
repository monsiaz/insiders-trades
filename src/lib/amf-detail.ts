import { parsePdfText, TradeDetails } from "./pdf-parser";

const AMF_API_BASE = "https://bdif.amf-france.org/back/api/v1";
const AMF_DOC_BASE = "https://bdif.amf-france.org/back/api/v1/documents";

interface AmfDocumentInfo {
  path: string;
  nomFichier: string;
  accessible: boolean;
}

export async function fetchDeclarationDetail(amfId: string): Promise<TradeDetails | null> {
  try {
    // Step 1: Get the document metadata to find the PDF path
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

    // Step 2: Download the PDF
    const pdfRes = await fetch(pdfUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!pdfRes.ok) return null;

    const pdfBuffer = await pdfRes.arrayBuffer();

    // Step 3: Parse the PDF text
    const text = await extractPdfText(Buffer.from(pdfBuffer));
    if (!text) return null;

    return parsePdfText(text, pdfUrl);
  } catch (err) {
    console.error(`Error fetching declaration ${amfId}:`, err);
    return null;
  }
}

async function extractPdfText(buffer: Buffer): Promise<string | null> {
  try {
    // pdf-parse v1.1.1 - exports a function directly
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (
      buf: Buffer,
      opts?: Record<string, unknown>
    ) => Promise<{ text: string }>;
    const data = await pdfParse(buffer, { max: 0 });
    return data.text || null;
  } catch (err) {
    console.error("PDF parse error:", err);
    return null;
  }
}
