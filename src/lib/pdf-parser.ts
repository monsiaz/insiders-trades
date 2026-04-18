export interface TradeDetails {
  insiderName?: string;
  insiderFunction?: string;
  transactionNature?: string;
  instrumentType?: string;
  isin?: string;
  unitPrice?: number;
  volume?: number;
  totalAmount?: number;
  currency?: string;
  transactionDate?: Date;
  transactionVenue?: string;
  pdfUrl?: string;
}

function extractField(text: string, label: string): string | undefined {
  // Normalize: replace curly/typographic apostrophes with straight apostrophe for matching
  const normalized = text.replace(/[\u2018\u2019\u02BC\u0060]/g, "'");
  const labelNorm = label.replace(/[\u2018\u2019\u02BC\u0060]/g, "'");

  const patterns = [
    new RegExp(`${labelNorm}\\s*:\\s*(.+?)(?=\\n[A-ZÉÈÊËÀÂÙÛÎÏÔÇ]{3}|$)`, "is"),
    new RegExp(`${labelNorm}\\s*:\\s*(.+)`, "i"),
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) return match[1].trim();
  }
  return undefined;
}

function parsePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const match = raw.match(/[\d\s.,]+/);
  if (!match) return undefined;
  const cleaned = match[0].replace(/\s/g, "").replace(",", ".");
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : val;
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const months: Record<string, number> = {
    janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
  };
  const m = raw.match(/(\d{1,2})\s+([a-zéûô]+)\s+(\d{4})/i);
  if (m) {
    const day = parseInt(m[1]);
    const month = months[m[2].toLowerCase()];
    const year = parseInt(m[3]);
    if (month) return new Date(year, month - 1, day);
  }
  // Try ISO format
  const iso = new Date(raw);
  if (!isNaN(iso.getTime())) return iso;
  return undefined;
}

function parseCurrency(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.includes("Euro") || raw.includes("EUR")) return "EUR";
  if (raw.includes("USD") || raw.includes("Dollar")) return "USD";
  if (raw.includes("GBP") || raw.includes("Pound")) return "GBP";
  const m = raw.match(/[A-Z]{3}/);
  return m ? m[0] : "EUR";
}

function extractInsiderInfo(text: string): { name?: string; function?: string } {
  // The header "NOM /FONCTION..." spans 2 lines before the colon
  // Match the full section including multi-line header
  const sectionMatch = text.match(
    /NOM\s*\/\s*FONCTION[\s\S]{0,200}?LIEE\s*:\s*\n+([\s\S]*?)(?=\n\s*NOTIFICATION|\nCOORDONNEES)/i
  );
  if (!sectionMatch) return {};

  const raw = sectionMatch[1].trim();

  // Look for "liée à FIRSTNAME LASTNAME, FUNCTION" pattern
  const lieMatch = raw.match(/li[eé]e?\s+à\s+([\w\s\-ÉÈÊËÀÂÙÛÎÏÔÇ]+?)(?:,\s*(.+?))?(?:\n|$)/i);
  if (lieMatch) {
    const name = lieMatch[1].trim().replace(/\s+/g, " ");
    const func = lieMatch[2]?.trim() || undefined;
    return { name: name || undefined, function: func };
  }

  // Direct person: "FIRSTNAME LASTNAME, FUNCTION" or just name on first line
  const firstLine = raw.split("\n")[0].trim();
  const commaIdx = firstLine.indexOf(",");
  if (commaIdx > 0) {
    return {
      name: firstLine.substring(0, commaIdx).trim(),
      function: firstLine.substring(commaIdx + 1).trim() || undefined,
    };
  }

  // Fallback: take first non-empty line, capped at 120 chars
  return { name: firstLine.substring(0, 120) || undefined };
}

export function parsePdfText(text: string, pdfUrl?: string): TradeDetails {
  const result: TradeDetails = { pdfUrl };

  // Extract insider name and function
  const insiderInfo = extractInsiderInfo(text);
  result.insiderName = insiderInfo.name;
  result.insiderFunction = insiderInfo.function;

  // Transaction fields
  result.transactionNature = extractField(text, "NATURE DE LA TRANSACTION");
  result.instrumentType = extractField(text, "DESCRIPTION DE L'INSTRUMENT FINANCIER");
  result.isin = extractField(text, "CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER");
  result.transactionVenue = extractField(text, "LIEU DE LA TRANSACTION");

  // ISIN fallback: the PDF header line is always "<AMFID>\n<ISIN> - <ref>\n<date>"
  if (!result.isin) {
    const headerMatch = text.match(/\n([A-Z]{2}[A-Z0-9]{10})\s*[-–]\s*DD/);
    if (headerMatch) result.isin = headerMatch[1];
  }

  // Price / volume - use "INFORMATIONS AGREGEES" section for total values
  const agregSection = text.match(/INFORMATIONS AGREGEES\s*\n([\s\S]*?)(?=\nTRANSACTION|\nDATE DE RECEPTION|$)/i);
  if (agregSection) {
    const ag = agregSection[1];
    const priceMatch = ag.match(/PRIX\s*:\s*([\d\s.,]+(?:\s*Euro|\s*EUR)?)/i);
    const volMatch = ag.match(/VOLUME\s*:\s*([\d\s.,]+)/i);
    if (priceMatch) {
      result.unitPrice = parsePrice(priceMatch[1]);
      result.currency = parseCurrency(priceMatch[1]) ?? "EUR";
    }
    if (volMatch) result.volume = parsePrice(volMatch[1]);
  }

  if (!result.unitPrice) {
    const priceRaw = extractField(text, "PRIX UNITAIRE");
    result.unitPrice = parsePrice(priceRaw);
    result.currency = parseCurrency(priceRaw) ?? "EUR";
  }
  if (!result.volume) {
    result.volume = parsePrice(extractField(text, "VOLUME"));
  }

  // Calculate total amount
  if (result.unitPrice && result.volume) {
    result.totalAmount = Math.round(result.unitPrice * result.volume * 100) / 100;
  }

  // Transaction date
  const dateRaw = extractField(text, "DATE DE LA TRANSACTION");
  result.transactionDate = parseDate(dateRaw);

  return result;
}
