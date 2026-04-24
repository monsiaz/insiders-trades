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

// ── Normalizers ────────────────────────────────────────────────────────────

/** Replace typographic apostrophes / backticks with standard ' */
function normalizeApostrophes(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC\u0060\u00B4]/g, "'");
}

/**
 * Known AMF field labels. Inserted as regex alternation to ensure each label
 * always starts on its own line (handles pdfjs-dist output where space is used
 * instead of \n between text blocks).
 */
const KNOWN_LABELS = [
  "DATE DE LA TRANSACTION",
  "LIEU DE LA TRANSACTION",
  "NATURE DE LA TRANSACTION",
  "DESCRIPTION DE L'INSTRUMENT FINANCIER",
  "CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER",
  "CODE ISIN",
  "PRIX UNITAIRE",
  "VOLUME",
  "INFORMATIONS AGREGEES",
  "INFORMATION DETAILLEE PAR OPERATION",
  "NOTIFICATION INITIALE",
  "NOTIFICATION INITIALE / MODIFICATION",
  "COORDONNEES DE L'EMETTEUR",
  "DETAIL DE LA TRANSACTION",
  "NOM / FONCTION",
  "NOM /FONCTION",
  "TRANSACTION LIEE",
  "DATE DE RECEPTION",
  "COMMENTAIRES",
];

/**
 * Ensure each known field label starts on its own line.
 * pdfjs-dist sometimes uses a space between text blocks instead of \n,
 * causing fields to run together: "NATURE : Cession DESCRIPTION : Action"
 */
function normalizeFieldBreaks(text: string): string {
  let t = normalizeApostrophes(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"));
  for (const label of KNOWN_LABELS) {
    // Escape regex special chars in label
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Insert newline before label if not already at start of line
    t = t.replace(new RegExp(`(?<!\n)(${escaped}\\s*:)`, "gi"), "\n$1");
  }
  return t;
}

// ── Field extraction ───────────────────────────────────────────────────────

/**
 * Extract the value following a labelled field in AMF PDF text.
 *
 * The text passed here should already be normalized by normalizeFieldBreaks(),
 * meaning each known label is on its own line. So we simply take everything
 * from the colon to the end of the line (no complex lookaheads needed).
 *
 * If opts.stopAtLabel is true, we also cut the captured value if it starts
 * containing another known label text — guards against pdfjs-dist runs where
 * field labels are concatenated on the same line.
 */
function extractField(text: string, label: string, opts: { maxLen?: number } = {}): string | undefined {
  const l = normalizeApostrophes(label);
  const escaped = l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const m = text.match(new RegExp(`${escaped}\\s*:\\s*([^\n]+)`, "i"));
  if (m) {
    let val = m[1].trim().replace(/ {2,}/g, " ");
    // Guard: if the value contains another known AMF label that bled in,
    // cut at the boundary.
    for (const otherLabel of KNOWN_LABELS) {
      if (otherLabel === l) continue;
      const idx = val.toUpperCase().indexOf(otherLabel);
      if (idx > 0) { val = val.substring(0, idx).trim(); break; }
    }
    // Also strip trailing "DESCRIPTION ...", "CODE ...", "PRIX ...", "VOLUME ..."
    val = val.replace(/\s+(DESCRIPTION|CODE|PRIX|VOLUME|DATE|LIEU|NATURE)\s+.*$/i, "").trim();
    if (opts.maxLen && val.length > opts.maxLen) val = val.substring(0, opts.maxLen).trim();
    if (val) return val;
  }

  return undefined;
}

// ── Price / volume parsing ─────────────────────────────────────────────────

function parsePrice(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  // Accept formats: "6.5000", "6,5000", "1 742,00", "1742.00"
  // Strip everything except digits, commas, dots
  const cleaned = raw
    .replace(/[^\d,. ]/g, "")
    .trim()
    .replace(/\s/g, "")
    .replace(/,(\d{1,2})$/, ".$1") // trailing comma-decimal: 6,50 → 6.50
    .replace(/,/g, ""); // remaining commas are thousands separators
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : val;
}

/** Earliest plausible AMF transaction date (AMF BDIF starts ~2003) */
const MIN_DATE = new Date("2003-01-01");
/** Latest plausible date = today + 18 months (for future-dated instruments) */
const MAX_DATE = new Date(Date.now() + 18 * 30 * 24 * 60 * 60 * 1000);

function isPlausibleDate(d: Date): boolean {
  return d >= MIN_DATE && d <= MAX_DATE;
}

function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const months: Record<string, number> = {
    janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
    juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
  };

  // "07 mai 2024" or "7 mai 24" (French long form, 2 or 4 digit year)
  const mFr = raw.match(/(\d{1,2})\s+([a-zéûôê]+)\s+(\d{2,4})/i);
  if (mFr) {
    const day = parseInt(mFr[1]);
    const month = months[mFr[2].toLowerCase()];
    let year = parseInt(mFr[3]);
    if (mFr[3].length === 2) year += year <= 50 ? 2000 : 1900;
    if (month) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (isPlausibleDate(d)) return d;
    }
  }

  // "2024-05-07" (ISO)
  const mIso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) {
    const d = new Date(Date.UTC(+mIso[1], +mIso[2] - 1, +mIso[3]));
    if (isPlausibleDate(d)) return d;
  }

  // "07/05/2024" (DD/MM/YYYY)
  const mSlash4 = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mSlash4) {
    const d = new Date(Date.UTC(+mSlash4[3], +mSlash4[2] - 1, +mSlash4[1]));
    if (isPlausibleDate(d)) return d;
  }

  // "07/05/24" (DD/MM/YY · 2-digit year, common in older AMF PDFs)
  const mSlash2 = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mSlash2) {
    const yr = +mSlash2[3];
    const year = yr <= 50 ? 2000 + yr : 1900 + yr;
    const d = new Date(Date.UTC(year, +mSlash2[2] - 1, +mSlash2[1]));
    if (isPlausibleDate(d)) return d;
  }

  return undefined;
}

function parseCurrency(raw: string | undefined): string {
  if (!raw) return "EUR";
  const r = raw.toLowerCase();
  if (r.includes("euro") || r.includes("eur") || r.includes("€")) return "EUR";
  if (r.includes("usd") || r.includes("dollar") || r.includes("états-unis")) return "USD";
  if (r.includes("gbp") || r.includes("pound") || r.includes("sterling")) return "GBP";
  if (r.includes("chf")) return "CHF";
  const m = raw.match(/[A-Z]{3}/);
  return m ? m[0] : "EUR";
}

// ── ISIN extraction ────────────────────────────────────────────────────────

/**
 * Strict ISIN pattern: 2-letter country code + 9 alphanumeric + 1 digit (check digit).
 * This avoids matching uppercase words like NOTIFICATION, MODIFICATION, RESPONSABILI.
 */
const STRICT_ISIN_RE = /\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/g;

/** Known country codes to further filter ISIN candidates */
const COUNTRY_CODES = new Set([
  "FR", "DE", "US", "GB", "NL", "BE", "IT", "ES", "CH", "LU",
  "SE", "NO", "DK", "FI", "PT", "AT", "IE", "CA", "AU", "JP",
  "HK", "SG", "KY", "BMU", "GG", "JE", "IM",
]);

function isLikelyIsin(s: string): boolean {
  if (s.length !== 12) return false;
  const cc = s.slice(0, 2);
  // Must start with known country code OR have mostly digit national code
  if (COUNTRY_CODES.has(cc)) return true;
  // Allow if at least 6 of the 10 body chars are digits
  const body = s.slice(2);
  const digits = (body.match(/\d/g) || []).length;
  return digits >= 6;
}

function extractIsin(text: string): string | undefined {
  const norm = normalizeApostrophes(text);
  const textNl = norm.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 1. Explicit field (older PDFs 2019-2023)
  const fieldLabels = [
    "CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER",
    "CODE ISIN",
    "ISIN",
  ];
  for (const label of fieldLabels) {
    const val = extractField(norm, label);
    if (val) {
      const m = val.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);
      if (m && isLikelyIsin(m[1])) return m[1];
    }
  }

  // 2. Header pattern (newer PDFs 2024+):
  //    "<AMFID>\n<ISIN> - <ref>\n<date>"
  //    The ref may be DDxxxxxx, CP.xx.xxxxx, FORMxxxx, etc. · match anything after dash.
  const dashes = "[-–·−\u2012\u2013\u2014]";
  const headerMatch = textNl.match(
    new RegExp(`\n([A-Z]{2}[A-Z0-9]{9}[0-9])\\s*${dashes}\\s*[A-Z0-9]`)
  );
  if (headerMatch && isLikelyIsin(headerMatch[1])) return headerMatch[1];

  // 3. ISIN anywhere in the first 600 chars (header zone), strict pattern
  const head = textNl.slice(0, 600);
  for (const m of head.matchAll(STRICT_ISIN_RE)) {
    if (isLikelyIsin(m[1])) return m[1];
  }

  return undefined;
}

// ── Insider name & function ────────────────────────────────────────────────

/**
 * Phrases that are label-text (NOT a real insider name). If the extracted
 * "name" matches one of these, we reject it and retry with a different strategy.
 * This guards against the pdfjs-dist collapse bug where the regex captures the
 * label header itself ("PERSONNE ETROITEMENT LIEE :") as the name.
 */
const LABEL_NOISE = [
  /^PERSONNE\s+ETROITEMENT\s+LIEE\s*:?$/i,
  /^PERSONNE\s+EXERCANT\s+DES\s+RESPONSABILITES/i,
  /^NOM\s*[/\\]?\s*FONCTION/i,
  /^NOTIFICATION\s+INITIALE/i,
  /^COORDONNEES/i,
  /^DETAIL\s+DE\s+LA\s+TRANSACTION/i,
  /^SOUS\s+LA\s+RESPONSABILITE/i,
  /^LA\s+PRESENTE\s+NOTIFICATION/i,
];

function isLabelNoise(s: string): boolean {
  const norm = s.trim();
  if (norm.length === 0) return true;
  return LABEL_NOISE.some((re) => re.test(norm));
}

/**
 * Clean a captured function/role string: strip trailing/leading punctuation,
 * cut at dangling open parenthesis ("(par personnes morales..." → "(par personnes morales)"
 * or truncate at the word boundary if unbalanced), cap length.
 */
function cleanFunction(s: string | undefined): string | undefined {
  if (!s) return undefined;
  let cleaned = s.trim();
  // Remove trailing orphan punctuation
  cleaned = cleaned.replace(/[,.\s;:]+$/, "").trim();
  // If it ends with an unbalanced open paren, cut before it
  const opens = (cleaned.match(/\(/g) ?? []).length;
  const closes = (cleaned.match(/\)/g) ?? []).length;
  if (opens > closes) {
    const lastOpen = cleaned.lastIndexOf("(");
    if (lastOpen > 0) cleaned = cleaned.substring(0, lastOpen).trim();
  }
  cleaned = cleaned.substring(0, 120).trim();
  return cleaned.length >= 2 ? cleaned : undefined;
}

function cleanName(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const cleaned = s.trim().replace(/\s+/g, " ").substring(0, 160).trim();
  if (cleaned.length < 2) return undefined;
  if (isLabelNoise(cleaned)) return undefined;
  return cleaned;
}

/**
 * Tokenise a raw "NAME, FUNCTION" or "NAME FUNCTION" candidate line.
 * Handles both "Claude GUILLEMOT, PRESIDENT DIRECTEUR GENERAL"
 * and "Claude GUILLEMOT PRESIDENT DIRECTEUR GENERAL" (comma lost by pdfjs).
 */
function splitNameFunction(raw: string): { name?: string; function?: string } {
  const line = raw.trim();

  // Case 1: "NAME, FUNCTION" with comma
  const commaIdx = line.indexOf(",");
  if (commaIdx > 2) {
    const name = line.substring(0, commaIdx);
    const fn = line.substring(commaIdx + 1);
    return { name: cleanName(name), function: cleanFunction(fn) };
  }

  // Case 2: no comma → try to split on transition from name-case to role-case.
  // A name is typically "Firstname LASTNAME" (Proper + UPPER), role is UPPER.
  // Match: "(Capital lowercase-capital UPPER) (UPPER+)" pattern.
  const m = line.match(/^([A-ZÉÈÊËÀÂÙÛÎÏÔÇ][a-zéèêëàâùûîïôç]+(?:\s+[A-ZÉÈÊËÀÂÙÛÎÏÔÇ][A-ZÉÈÊËÀÂÙÛÎÏÔÇ\-'']+)+)\s+(PRESIDENT|DIRECTEUR|CHAIRMAN|CEO|CFO|ADMINISTRATEUR|MEMBRE|GERANT|DGD|DGA|PDG|PCA|DAF)/);
  if (m) {
    return { name: cleanName(m[1]), function: cleanFunction(line.substring(m[1].length)) };
  }

  // Case 3: just take the whole line as name (no function separated)
  return { name: cleanName(line) };
}

function extractInsiderInfo(text: string): { name?: string; function?: string } {
  // Normalize for matching
  const norm = normalizeApostrophes(text).replace(/\r\n/g, "\n");

  // Strategy 1: tolerant capture after "LIEE :" (with \s+ instead of strict \n,
  // because pdfjs-dist sometimes emits a single space between the label and
  // the name instead of a newline). We look for the next non-empty span.
  const sectionMatchV2 = norm.match(
    /NOM\s*[/\\]\s*FONCTION[\s\S]{0,400}?LIEE\s*:\s*([\s\S]{2,800}?)(?=\n\s*(?:NOTIFICATION|COORDONNEES|DETAIL\s+DE\s+LA)|$)/i
  );
  let raw = sectionMatchV2 ? sectionMatchV2[1].trim() : "";

  if (!raw) {
    // Strategy 2: section after the long disclaimer line
    const alt = norm.match(
      /SOUS LA RESPONSABILITE EXCLUSIVE DU DECLARANT\.[\s\S]*?\n\n([\s\S]*?)(?=\nNOTIFICATION|\nCOORDONNEES)/i
    );
    if (alt) raw = alt[1].trim();
  }

  if (!raw) {
    // Strategy 3: look for "NOM /FONCTION" and take the next non-empty lines
    const directMatch = norm.match(/NOM\s*[/\\]\s*FONCTION[^\n]*\n\n?([\s\S]{1,300}?)(?=\nNOTIFICATION|\nCOORDONNEES|\n\n)/i);
    if (directMatch) raw = directMatch[1].trim();
  }

  if (!raw) return {};

  // Handle: "Personne liée à FIRSTNAME LASTNAME, FUNCTION"
  const lieMatch = raw.match(/li[eé]e?\s+à\s+([\w\s\-ÉÈÊËÀÂÙÛÎÏÔÇ]+?)(?:,\s*(.+?))?(?:\n|$)/i);
  if (lieMatch) {
    const name = cleanName(lieMatch[1]);
    if (name) {
      return { name, function: cleanFunction(lieMatch[2]) };
    }
  }

  // Iterate lines and find the FIRST that isn't label noise.
  // This is the key fix: if line 1 captured is "PERSONNE ETROITEMENT LIEE :",
  // we skip it and try line 2 (the real name).
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (isLabelNoise(line)) continue;
    const result = splitNameFunction(line);
    if (result.name) return result;
  }

  return {};
}

// ── Opening price from comments (used for attributions) ───────────────────

function extractOpeningPrice(text: string): number | undefined {
  // "Cours d'ouverture : 4,04€" or "Cours d'ouverture : 4.04 Euro"
  const m = text.match(/[Cc]ours\s+d['']ouverture\s*:?\s*([\d.,\s]+)\s*[€EeUuRr]/);
  if (m) return parsePrice(m[1]);
  return undefined;
}

// ── Main parser ────────────────────────────────────────────────────────────

export function parsePdfText(rawText: string, pdfUrl?: string): TradeDetails {
  const result: TradeDetails = { pdfUrl };

  if (!rawText || rawText.trim().length < 50) return result;

  // Normalize: ensure each field label is on its own line
  const text = normalizeFieldBreaks(rawText);

  // ── Insider ──
  const insiderInfo = extractInsiderInfo(text);
  result.insiderName = insiderInfo.name;
  result.insiderFunction = insiderInfo.function;

  // ── Transaction metadata ──
  // Cap lengths to avoid field bleed (v3 data-quality fix)
  result.transactionNature = extractField(text, "NATURE DE LA TRANSACTION", { maxLen: 60 });
  result.instrumentType = extractField(text, "DESCRIPTION DE L'INSTRUMENT FINANCIER", { maxLen: 80 });
  result.transactionVenue = extractField(text, "LIEU DE LA TRANSACTION", { maxLen: 80 });

  // ── ISIN ──
  result.isin = extractIsin(text);

  // ── Price / Volume ──
  // Prefer INFORMATIONS AGREGEES section (totals across multiple operations)
  const agregSection = text.match(
    /INFORMATIONS AGREGEES\s*\n([\s\S]*?)(?=\nTRANSACTION LIEE|\nDATE DE RECEPTION|$)/i
  );
  if (agregSection) {
    const ag = agregSection[1];
    const priceMatch = ag.match(/PRIX\s*:\s*([\d\s.,]+(?:\s*[A-Za-z\u00C0-\u024F\s€$£]+)?)/i);
    const volMatch = ag.match(/VOLUME\s*:\s*([\d\s.,]+)/i);
    if (priceMatch) {
      result.unitPrice = parsePrice(priceMatch[1]);
      result.currency = parseCurrency(priceMatch[1]);
    }
    if (volMatch) result.volume = parsePrice(volMatch[1]);
  }

  // Fallback to INFORMATION DETAILLEE section
  if (result.unitPrice == null) {
    const priceRaw = extractField(text, "PRIX UNITAIRE");
    if (priceRaw) {
      result.unitPrice = parsePrice(priceRaw);
      result.currency = parseCurrency(priceRaw);
    }
  }
  if (!result.currency) result.currency = "EUR";

  if (result.volume == null) {
    result.volume = parsePrice(extractField(text, "VOLUME"));
  }

  // ── Total amount ──
  const nature = (result.transactionNature ?? "").toLowerCase();
  const isAttribution = nature.includes("attribution") || nature.includes("gratuites");
  const isExercice = nature.includes("exercice") || nature.includes("option");

  if (result.unitPrice != null && result.unitPrice > 0 && result.volume != null) {
    // Standard: price × volume
    const computed = Math.round(result.unitPrice * result.volume * 100) / 100;
    // Sanity cap: single-insider trades > 1B€ are implausible, reject as garbage OCR.
    result.totalAmount = computed > 1_000_000_000 ? undefined : computed;
  } else if ((isAttribution || isExercice) && result.volume != null && result.volume > 0) {
    // For free share attributions: try to compute value from opening price
    const openPrice = extractOpeningPrice(text);
    if (openPrice && openPrice > 0) {
      result.totalAmount = Math.round(openPrice * result.volume * 100) / 100;
      result.unitPrice = openPrice; // use opening price as reference
    } else {
      // Keep totalAmount as undefined · volume alone tells the story
      result.unitPrice = 0;
    }
  }

  // ── Date ──
  const dateRaw = extractField(text, "DATE DE LA TRANSACTION");
  result.transactionDate = parseDate(dateRaw);

  return result;
}

// ── Debug helper ──────────────────────────────────────────────────────────

export function debugParse(text: string): Record<string, unknown> {
  const norm = normalizeFieldBreaks(text);
  return {
    isinField: extractField(norm, "CODE D'IDENTIFICATION DE L'INSTRUMENT FINANCIER"),
    isinExtracted: extractIsin(text),
    insiderSection: norm.match(
      /NOM\s*[/\/]\s*FONCTION[\s\S]{0,300}?LIEE\s*:\s*\n([\s\S]{0,200})/i
    )?.[1]?.slice(0, 200),
    agregSection: norm.match(
      /INFORMATIONS AGREGEES\s*\n([\s\S]{0,300})/i
    )?.[1]?.slice(0, 200),
    textHead: text.slice(0, 300),
  };
}
