/**
 * Canonical insider role normalization.
 * Handles accented/unaccented, uppercase, French/English, feminine forms, abbreviations.
 *
 * Roles:
 *   PDG/DG   — CEO, President, Managing Director, DG, PDG, Gérant
 *   CFO/DAF  — CFO, Directeur Financier, DAF
 *   Directeur — other C-suite executives, Comité Exécutif, Directoire
 *   CA/Board  — Board members, Administrateur, Conseil, Surveillance
 *   Autre    — everything else (legal entities, undetermined)
 */

/** Strip diacritics for accent-insensitive matching */
function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export type InsiderRole = "PDG/DG" | "CFO/DAF" | "Directeur" | "CA/Board" | "Autre";

export function normalizeRole(fn: string | null | undefined): InsiderRole {
  if (!fn) return "Autre";
  const raw = fn.trim();
  const f = deaccent(raw).toLowerCase();

  // ── Abbreviations & acronyms ─────────────────────────────────────────────
  if (/\bpdg\b/.test(f) || /\bp\.d\.g\b/.test(f)) return "PDG/DG";
  if (/\bdg\b/.test(f)  || /\bd\.g\b/.test(f))   return "PDG/DG";
  if (/\bceo\b/.test(f) || /\bc\.e\.o\b/.test(f)) return "PDG/DG";
  if (/\bcfo\b/.test(f) || /\bc\.f\.o\b/.test(f)) return "CFO/DAF";
  if (/\bdaf\b/.test(f) || /\bd\.a\.f\b/.test(f)) return "CFO/DAF";
  // PCA = Président du Conseil d'Administration → Board
  if (/\bpca\b/.test(f) || /\bp\.c\.a\b/.test(f)) return "CA/Board";

  // ── Chief executive / president roles ────────────────────────────────────
  // Order matters: more specific patterns first
  if (f.includes("president-directeur") || f.includes("president directeur")) return "PDG/DG";
  if (f.includes("directeur general delegue") || f.includes("directeur-general delegue")) return "PDG/DG";
  if (f.includes("directeur general") || f.includes("directeur-general")) return "PDG/DG";
  if (f.includes("directeur executif")) return "PDG/DG";
  if (f.includes("managing director")) return "PDG/DG";
  if (f.includes("chief executive")) return "PDG/DG";
  if (f.includes("president du directoire")) return "PDG/DG";

  // "Gérant" = company manager (SARL equivalent of PDG)
  if (/\bgerant\b/.test(f) || /\bgerante\b/.test(f)) return "PDG/DG";

  // "Président" alone, or "Président de X" (president of an entity)
  // But NOT "Président du Conseil" (→ CA/Board, handled below)
  if (f.includes("president") && !f.includes("conseil") && !f.includes("surveillance") && !f.includes("honneur")) {
    return "PDG/DG";
  }
  if (f.includes("president d'honneur") || f.includes("president honoraire")) return "CA/Board";

  // ── Financial executive ──────────────────────────────────────────────────
  if (f.includes("directeur financier") || f.includes("directrice financier") ||
      f.includes("directeur finance") || f.includes("directeur de la finance") ||
      f.includes("chief financial") || f.includes("directeur administratif et financier")) {
    return "CFO/DAF";
  }

  // ── Other executives (non-financial directors, comité exécutif) ──────────
  if (f.includes("comite executif") || f.includes("comite exécutif") ||
      f.includes("comite de direction") || f.includes("comite de gestion") ||
      f.includes("executive committee")) return "Directeur";

  if (f.includes("membre du directoire") || f.includes("directoire")) return "Directeur";

  if (f.includes("directeur") || f.includes("directrice") || // Directeur Commercial etc.
      f.includes("director") ||   // English
      f.includes("chief ")) return "Directeur";

  // ── Board / supervisory ──────────────────────────────────────────────────
  // "Administrateur / Administratrice" — all genders
  if (f.includes("administrateur") || f.includes("administratrice") ||
      f.includes("administrateur") /* normalize handles accent */) {
    return "CA/Board";
  }
  if (f.includes("conseil d") || f.includes("conseil de") || f.includes("conseil ")) return "CA/Board";
  if (f.includes("board") || f.includes("supervisory") || f.includes("surveillance")) return "CA/Board";
  if (f.includes("censeur")) return "CA/Board";
  if (f.includes("membre du conseil")) return "CA/Board";

  // ── Catch remaining "dirigeant" (generic) ─────────────────────────────────
  if (f.includes("dirigeant")) return "PDG/DG";

  return "Autre";
}

/**
 * Signal score contribution based on insider role.
 * Higher score = stronger signal weight.
 */
export function roleFunctionScore(fn: string | null | undefined): number {
  const role = normalizeRole(fn);
  switch (role) {
    case "PDG/DG":    return 15;  // CEO/President has highest informational advantage
    case "CFO/DAF":   return 14;  // CFO has detailed financial knowledge
    case "Directeur": return 10;  // Other executives
    case "CA/Board":  return 7;   // Board members have less day-to-day insight
    case "Autre":     return 3;
  }
}

/**
 * Map a role to a short display label.
 */
export function roleDisplayLabel(fn: string | null | undefined): string {
  return normalizeRole(fn);
}
