/**
 * role-utils.ts · Insider role normalization
 *
 * Handles French AND English job titles, accented/unaccented, uppercase,
 * feminine forms, abbreviations, typos and compound phrases.
 *
 * Roles (5 canonical buckets):
 *   PDG/DG · CEO, President, Managing Director, DG, PDG, Gérant, General Manager
 *   CFO/DAF · CFO, Directeur Financier, DAF, Financial Controller
 *   Directeur · Other C-suite: COO, CTO, DGA, DRH, EVP, Comité Exécutif, Head of…
 *   CA/Board · Board member, Administrateur, Conseil, Surveillance, PCA
 *   Autre · Shareholders, legal entities, related persons, unclassifiable
 *
 * Display (normalizeDisplay):
 *   Returns a clean French label from any raw insiderFunction string.
 */

/** Strip diacritics for accent-insensitive matching */
function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export type InsiderRole = "PDG/DG" | "CFO/DAF" | "Directeur" | "CA/Board" | "Autre";

export function normalizeRole(fn: string | null | undefined): InsiderRole {
  if (!fn) return "Autre";
  const raw = fn.trim();
  if (!raw || raw === "-" || raw === "–" || raw === "N/A" || raw.length <= 1) return "Autre";

  const f = deaccent(raw).toLowerCase();

  // ── Block: clearly non-executive (check first to avoid false positives) ────
  // "Actionnaire" · but NOT if also "administrateur/président/directeur" (employee shareholders are board members)
  if ((f.includes("actionnaire") || f.includes("shareholder")) &&
      !f.includes("administrateur") && !f.includes("administratrice") &&
      !f.includes("president") && !f.includes("directeur") && !f.includes("gerant")) {
    return "Autre";
  }
  // "Personne morale" · but NOT if also an exec/board role
  if ((f.includes("personne morale") || f.includes("legal entity")) &&
      !f.includes("administrateur") && !f.includes("administratrice") && !f.includes("president") &&
      !f.includes("directeur") && !f.includes("gerant") && !f.includes("conseil")) {
    return "Autre";
  }
  // Related persons / family
  if (/\b(epouse|epoux|conjoint|conjointe|fils|fille|enfant|neveu|niece|frere|soeur)\b/.test(f) &&
      !f.includes("directeur") && !f.includes("president") && !f.includes("admin")) {
    return "Autre";
  }
  if (/^(fille|fils|epouse|epoux|etudiant|enfant)/.test(f)) return "Autre";
  // Holding / société civile without exec role
  if ((f.includes("holding") || f.includes("societe civile") || f.includes("societe fille") ||
       f.includes("family office") || f.includes("fonds") || f.includes("fond d")) &&
      !f.includes("directeur") && !f.includes("president") && !f.includes("gerant") &&
      !f.includes("administrateur") && !f.includes("conseil")) {
    return "Autre";
  }
  // Trustee / beneficial owner / personne proche
  if (f.includes("trustee") || f.includes("personne proche") || f.includes("beneficial owner")) {
    return "Autre";
  }

  // ── Block: standalone acronyms (word boundaries) ──────────────────────────
  // Order: more specific before more general (PDG before DG, DGD before DG, etc.)

  // PDG/DG acronyms
  if (/\bpdg\b/.test(f) || /\bp\.d\.g\.?\b/.test(f))                            return "PDG/DG";
  if (/\bdgd\b/.test(f) || /\bd\.g\.d\.?\b/.test(f))                            return "PDG/DG"; // DG Délégué
  if (/\bpdt\b/.test(f))                                                          return "PDG/DG"; // Pdt = Président
  if (/\bpres\b/.test(f) && !f.includes("represent"))                            return "PDG/DG"; // Pres = Président
  if (/\bdg\b/.test(f)  || /\bd\.g\.?\b/.test(f))                               return "PDG/DG";
  // "D. G." with spaces (e.g. "D. G. d'une filiale")
  if (/\bd\.\s*g\./.test(f))                                                      return "PDG/DG";
  // "dir" abbreviation for "directeur" in exec context
  if (/\bdir\b.{0,15}g[eé]n[eé]r/.test(f))                                      return "PDG/DG";
  if (/\bceo\b/.test(f) || /\bc\.e\.o\.?\b/.test(f))   return "PDG/DG";
  if (/\bmd\b/.test(f)  && f.includes("managing"))      return "PDG/DG"; // Managing Director

  // CFO/DAF acronyms
  if (/\bcfo\b/.test(f) || /\bc\.f\.o\.?\b/.test(f))   return "CFO/DAF";
  if (/\bdaf\b/.test(f) || /\bd\.a\.f\.?\b/.test(f))   return "CFO/DAF";

  // CA/Board acronyms
  if (/\bpca\b/.test(f) || /\bp\.c\.a\.?\b/.test(f))   return "CA/Board"; // Président Conseil Admin
  // "CA" and "CS" as standalone abbreviations (various typos/forms)
  if (/\bmem[eb]re du ca\b/.test(f) || /\bmembre ca\b/.test(f) || /\bmembre de ca\b/.test(f)) return "CA/Board";
  if (/\bmem[eb]re du cs\b/.test(f) || /\bmembre cs\b/.test(f) || /\bmemebre du cs\b/.test(f)) return "CA/Board";
  if (/\bpresident du ca\b/.test(f)) return "CA/Board";

  // Other exec acronyms → Directeur
  if (/\bdga\b/.test(f) || /\bd\.g\.a\.?\b/.test(f))   return "Directeur"; // DG Adjoint (NOT PDG)
  if (/\bdrh\b/.test(f) || /\bd\.r\.h\.?\b/.test(f))   return "Directeur"; // DRH
  if (/\bcto\b/.test(f) || /\bc\.t\.o\.?\b/.test(f))   return "Directeur"; // Chief Technology Officer
  if (/\bcoo\b/.test(f) || /\bc\.o\.o\.?\b/.test(f))   return "Directeur"; // Chief Operating Officer
  if (/\bcco\b/.test(f) || /\bc\.c\.o\.?\b/.test(f))   return "Directeur"; // Chief Commercial Officer
  if (/\bcio\b/.test(f) || /\bc\.i\.o\.?\b/.test(f))   return "Directeur"; // Chief Information Officer
  if (/\bcso\b/.test(f) || /\bc\.s\.o\.?\b/.test(f))   return "Directeur"; // Chief Strategy Officer
  if (/\bchro\b/.test(f))                               return "Directeur"; // Chief Human Resources Officer
  if (/\bcrco\b/.test(f))                               return "Directeur"; // Chief Risk & Compliance Officer
  if (/\bcfbo\b/.test(f))                               return "Directeur"; // Chief Financial Business Officer
  if (/\bcgco\b/.test(f))                               return "Directeur"; // Chief Governance Compliance Officer
  if (/\bcmo\b/.test(f))                                return "Directeur"; // Chief Marketing Officer
  if (/\bcdo\b/.test(f))                                return "Directeur"; // Chief Digital Officer
  if (/\bcpo\b/.test(f))                                return "Directeur"; // Chief People Officer
  if (/\bclo\b/.test(f))                                return "Directeur"; // Chief Legal Officer
  if (/\bevp\b/.test(f) || /\be\.v\.p\.?\b/.test(f))   return "Directeur"; // Executive Vice President
  if (/\bsvp\b/.test(f) || /\bs\.v\.p\.?\b/.test(f))   return "Directeur"; // Senior Vice President
  // VP: executive VP (not "Vice-Président du conseil" which is CA/Board)
  if (/\bvp\b/.test(f) &&
      !f.includes("vice-president du conseil") && !f.includes("vice president du conseil") &&
      !f.includes("vice-president conseil"))             return "Directeur";

  // ── Block: CEO/President compound phrases (specific → general) ────────────
  if (f.includes("president-directeur") || f.includes("president directeur"))     return "PDG/DG";
  // Typos of "directeur général délégué"
  if (f.includes("directeur general delegue") || f.includes("directeur-general delegue") ||
      f.includes("directeur general deleg") || f.includes("dg deleg") ||
      /d[iu]r[ue]ct[ue][u]?r[a-z]* g[eé]n[eé]r[ae]l[e]? d[eé]l[eé]g/.test(f)) {
    return "PDG/DG";
  }
  if (f.includes("directeur general adjoint"))                                     return "Directeur"; // NOT PDG
  if (f.includes("directeur general") || f.includes("directeur-general") ||
      // Typos like "directerur general", "directeur général", etc.
      /d[iu]r[ue]ct[ue][eu]?r[a-z]* g[eé]n[eé]r[ae]l/.test(f))                  return "PDG/DG";
  if (f.includes("directeur executif") || f.includes("directeur executive"))      return "PDG/DG";
  if (f.includes("managing director"))                                             return "PDG/DG";
  if (f.includes("general manager") || f.includes("manager general"))             return "PDG/DG";
  if (f.includes("chief executive") || f.includes("executive officer"))           return "PDG/DG";
  if (f.includes("executive chairman"))                                            return "PDG/DG";
  if (f.includes("president du directoire") || f.includes("president of the board of directors")) {
    return "PDG/DG"; // Chairman of Board of Directors in some French companies = executive
  }
  // Managing partner
  if (f.includes("managing partner") || f.includes("associe commandite") || f.includes("associee commanditee")) {
    return "PDG/DG";
  }
  // Co-founder (usually CEO/President as well)
  if (f.includes("cofondateur") || f.includes("cofondatrice") ||
      f.includes("co-fondateur") || f.includes("co fondateur") ||
      f.includes("co-fondatrice") || f.includes("cofonder")) {
    return "PDG/DG";
  }
  // Gérant / Gérante / Co-gérant (SARL equivalent of PDG)
  if (/\bgerant\b/.test(f) || /\bgerante\b/.test(f) ||
      f.includes("co-gerant") || f.includes("cogerant") || f.includes("co gerant")) {
    return "PDG/DG";
  }

  // "Président" alone or "Président de X" · but NOT "Président du Conseil/CA/CS/Surveillance"
  // "pressident", "presidente" etc. (typos/feminine/English)
  if (/pr[eé]ss?id[ae]nt/.test(f) &&
      !f.includes("conseil") && !f.includes("surveillance") &&
      !f.includes("honneur") && !f.includes("honoraire") &&
      !f.includes("d'honneur")) {
    return "PDG/DG";
  }

  // Honorary president → Board
  if (f.includes("president d'honneur") || f.includes("president honoraire") ||
      f.includes("president emerite"))                                             return "CA/Board";

  // ── Block: CFO / Financial executive ──────────────────────────────────────
  if (f.includes("directeur financier") || f.includes("directrice financier") ||
      f.includes("directeur finance") || f.includes("directeur de la finance") ||
      f.includes("chief financial") || f.includes("directeur administratif et financier") ||
      f.includes("responsable financ") || f.includes("directeur financier groupe")) {
    return "CFO/DAF";
  }
  // Financial Controller
  if (f.includes("financial controller") || f.includes("controleur financier") ||
      f.includes("financial control") || f.includes("group controller") ||
      f.includes("principal accounting officer") || f.includes("accounting officer")) {
    return "CFO/DAF";
  }

  // ── Block: Executive committee / Directorate ───────────────────────────────
  if (f.includes("comite executif") || f.includes("comite de direction") ||
      f.includes("comite de gestion") || f.includes("executive committee") ||
      f.includes("comite excom") || f.includes("leadership team")) {
    return "Directeur";
  }
  if (f.includes("exco") || f.includes("comex"))                                  return "Directeur";
  if (f.includes("membre du directoire") || f.includes("membre directoire") ||
      f.includes("directoire"))                                                    return "Directeur";
  if (f.includes("membre direction") || f.includes("membre de la direction"))     return "Directeur";
  if (f.includes("membre du comite direction") || f.includes("membre comite direction")) {
    return "Directeur";
  }

  // ── Block: Other senior executives ────────────────────────────────────────
  if (f.includes("secretaire general") || f.includes("secretary general") ||
      f.includes("general counsel") || f.includes("general secretary"))           return "Directeur";
  if (f.includes("head of") || f.includes("head,") || f.includes("head "))       return "Directeur";
  if (f.includes("country manager"))                                              return "Directeur";
  if (f.includes("salarié directeur") || f.includes("salarie directeur"))        return "Directeur";
  if (f.includes("group ") && (
    f.includes("officer") || f.includes("manager") || f.includes("director") ||
    f.includes("controller") || f.includes("chief") || f.includes("supply") ||
    f.includes("people") || f.includes("legal") || f.includes("commercial")))    {
    return "Directeur";
  }
  if (f.includes("responsable") && (
    f.includes("informatique") || f.includes("operations") || f.includes("operationnel") ||
    f.includes("pays") || f.includes("marketing") || f.includes("juridique") ||
    f.includes("communication") || f.includes("achats") || f.includes("gestion") ||
    f.includes("ressources") || f.includes("portefeuille") || f.includes("maintenance"))) {
    return "Directeur";
  }
  if (f.includes("cadre") && (f.includes("commercial") || f.includes("superieur") || f.includes("direction"))) {
    return "Directeur";
  }

  // Generic "directeur/director/chief"
  if (f.includes("directeur") || f.includes("directrice") ||
      f.includes("director") || f.includes("chief "))                            return "Directeur";

  // ── Block: Board / Supervisory ────────────────────────────────────────────
  // Handle typos of "administrateur/administratrice" (OCR errors in AMF data)
  // Covers: admiistrateur, adminstrateur, adminsitrateur, adminisrateur, admini, etc.
  if (/\badmin[a-z]{3,}/.test(f))                                                return "CA/Board";
  if (f.includes("administrateur") || f.includes("administratrice"))             return "CA/Board";

  // "Conseil" patterns · use word boundary for "conseil" at end of string
  if (/\bconseil\b/.test(f))                                                      return "CA/Board";
  if (f.includes("board") || f.includes("supervisory"))                           return "CA/Board";
  if (f.includes("surveillance"))                                                  return "CA/Board";
  if (f.includes("censeur"))                                                       return "CA/Board";
  if (f.includes("conseiller") || f.includes("conseillere"))                      return "CA/Board";
  if (f.includes("representant permanent") || f.includes("representant legal") ||
      f.includes("representant legale") || f.includes("permanent representative")) return "CA/Board";
  if (f.includes("secretaire du conseil") || /\bsecretaire\b$/.test(f))          return "CA/Board"; // Secrétaire alone = Secrétaire du Conseil
  // "Chairman" without executive qualifier = non-exec Chairman of the Board
  if (f.includes("chairman") && !f.includes("executive"))                         return "CA/Board";
  if (f.includes("member of the") || f.includes("member on") ||
      f.includes("member of board") || f.includes("member board"))                return "CA/Board"; // "Member of the board" etc.

  // "Membre" alone or truncated (in AMF context = board member unless already caught above)
  if (/\bmembre\b/.test(f))                                                        return "CA/Board";

  // ── Catch-all: "dirigeant" ────────────────────────────────────────────────
  if (f.includes("dirigeant"))                                                     return "PDG/DG";

  return "Autre";
}

// ── Display normalization (EN→FR, clean labels) ───────────────────────────────

/**
 * Maps common English/abbrev insider functions to clean French display strings.
 * Preserves the original if already in French or unknown.
 */
const EN_TO_FR: Array<[RegExp, string]> = [
  // CEO / President
  [/\bceo\b/i,                                  "Directeur Général"],
  [/\bchief executive officer\b/i,              "Directeur Général"],
  [/\bchief executive\b/i,                      "Directeur Général"],
  [/\bmanaging director\b/i,                    "Directeur Général"],
  [/\bgeneral manager\b/i,                      "Directeur Général"],
  [/\bmanager general\b/i,                      "Directeur Général"],
  [/\bexecutive chairman\b/i,                   "Président Directeur Général"],
  [/\bchairman (and|&) ceo\b/i,                "Président Directeur Général"],
  [/\bchairman of the board\b/i,               "Président du Conseil d'Administration"],
  [/\bmanaging partner\b/i,                     "Associé Gérant"],

  // CFO
  [/\bcfo\b/i,                                  "Directeur Financier"],
  [/\bchief financial officer\b/i,              "Directeur Financier"],
  [/\bfinancial controller\b/i,                 "Contrôleur Financier"],
  [/\bprincipal accounting officer\b/i,         "Directeur Comptable"],
  [/\bgroup controller\b/i,                     "Contrôleur de Gestion Groupe"],

  // Directeur
  [/\bcoo\b/i,                                  "Directeur des Opérations"],
  [/\bchief operating officer\b/i,              "Directeur des Opérations"],
  [/\bcto\b/i,                                  "Directeur Technique"],
  [/\bchief technology officer\b/i,             "Directeur Technique"],
  [/\bcio\b/i,                                  "Directeur Informatique"],
  [/\bchief information officer\b/i,            "Directeur Informatique"],
  [/\bcco\b/i,                                  "Directeur Commercial"],
  [/\bchief commercial officer\b/i,             "Directeur Commercial"],
  [/\bcmo\b/i,                                  "Directeur Marketing"],
  [/\bchief marketing officer\b/i,              "Directeur Marketing"],
  [/\bcso\b/i,                                  "Directeur Stratégie"],
  [/\bchief strategy officer\b/i,               "Directeur Stratégie"],
  [/\bcdo\b/i,                                  "Directeur Digital"],
  [/\bchief digital officer\b/i,               "Directeur Digital"],
  [/\bchro\b/i,                                 "Directeur des Ressources Humaines"],
  [/\bgroup (chro|people officer)\b/i,          "Directeur RH Groupe"],
  [/\bchief people officer\b/i,                 "Directeur des Ressources Humaines"],
  [/\bclegal officer|chief legal officer\b/i,   "Directeur Juridique"],
  [/\bgeneral counsel\b/i,                      "Directeur Juridique"],
  [/\bgroup general counsel\b/i,               "Directeur Juridique Groupe"],
  [/\bcrco\b/i,                                 "Directeur Risques & Conformité"],
  [/\bcfbo\b/i,                                 "Directeur Financier & Métiers"],
  [/\bevp\b/i,                                  "VP Exécutif"],
  [/\bexecutive vice.?president\b/i,            "VP Exécutif"],
  [/\bsvp\b/i,                                  "VP Senior"],
  [/\bsenior vice.?president\b/i,               "VP Senior"],
  [/\bvice.?president\b/i,                      "Vice-Président"],
  [/\bhead of\b/i,                              "Responsable"],
  [/\bcountry manager\b/i,                      "Directeur Pays"],
  [/\bexco member\b/i,                          "Membre du Comité Exécutif"],
  [/\bexecutive committee member\b/i,           "Membre du Comité Exécutif"],
  [/\bboard member\b/i,                         "Administrateur"],
  [/\bmember of the board\b/i,                  "Administrateur"],
  [/\bmember of the supervisory board\b/i,      "Membre du Conseil de Surveillance"],
  [/\bdirector on (the )?board\b/i,             "Administrateur"],
  [/\bshareholder\b/i,                          "Actionnaire"],
];

/**
 * Returns a clean French display label for any insider function string.
 * Translates English → French, normalizes casing/whitespace.
 * Falls back to the cleaned original if no translation matches.
 */
export function normalizeDisplay(fn: string | null | undefined): string {
  if (!fn) return "";
  const raw = fn.trim();

  // Try EN→FR translation
  for (const [pattern, fr] of EN_TO_FR) {
    if (pattern.test(raw)) return fr;
  }

  // Already French or unknown: clean up excessive whitespace and return
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * Signal score contribution based on insider role.
 * Higher score = stronger signal weight.
 */
export function roleFunctionScore(fn: string | null | undefined): number {
  const role = normalizeRole(fn);
  switch (role) {
    case "PDG/DG":    return 15;
    case "CFO/DAF":   return 14;
    case "Directeur": return 10;
    case "CA/Board":  return 7;
    case "Autre":     return 3;
  }
}

/**
 * Map a role to a short display label.
 */
export function roleDisplayLabel(fn: string | null | undefined): string {
  return normalizeRole(fn);
}

/**
 * French label for each canonical role.
 */
export const ROLE_LABELS: Record<InsiderRole, string> = {
  "PDG/DG":    "PDG · Directeur Général",
  "CFO/DAF":   "Directeur Financier",
  "Directeur": "Cadre Dirigeant",
  "CA/Board":  "Administrateur · Conseil",
  "Autre":     "Autre",
};
