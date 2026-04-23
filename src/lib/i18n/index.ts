export type Locale = "en" | "fr";

// ── French AMF role → English translation table ────────────────────────────
const FR_TO_EN_ROLES: [string, string][] = [
  ["Président-directeur général",                 "Chairman & CEO"],
  ["Président du Conseil d'administration",       "Chairman of the Board"],
  ["Vice-Président du Conseil d'administration",  "Vice-Chairman of the Board"],
  ["Membre du Conseil d'administration",          "Board Member"],
  ["Administrateur indépendant",                  "Independent Director"],
  ["Administrateur référent",                     "Lead Independent Director"],
  ["Administrateur",                              "Director"],
  ["Président du Directoire",                     "Management Board Chairman"],
  ["Membre du Directoire",                        "Management Board Member"],
  ["Président du Conseil de Surveillance",        "Supervisory Board Chairman"],
  ["Vice-Président du Conseil de Surveillance",   "Supervisory Board Vice-Chair"],
  ["Membre du Conseil de Surveillance",           "Supervisory Board Member"],
  ["Directeur général délégué",                   "Deputy CEO"],
  ["Directeur général adjoint",                   "Deputy Chief Executive"],
  ["Directeur général",                           "Chief Executive Officer"],
  ["Directeur financier",                         "Chief Financial Officer"],
  ["Directeur des opérations",                    "Chief Operating Officer"],
  ["Directeur technique",                         "Chief Technology Officer"],
  ["Secrétaire général",                          "General Secretary"],
  ["Censeur",                                     "Non-Voting Board Observer"],
  ["Personne étroitement liée",                   "Closely associated person"],
  ["Actionnaire",                                 "Shareholder"],
];

/**
 * Translate a French AMF insider role label to English.
 * Returns the original string if no match is found or if locale is "fr".
 */
export function translateRole(role: string | null | undefined, locale: string): string | null | undefined {
  if (locale === "fr" || !role) return role;
  const lower = role.toLowerCase();
  for (const [fr, en] of FR_TO_EN_ROLES) {
    if (lower.includes(fr.toLowerCase())) return en;
  }
  return role;
}
export const locales: Locale[] = ["en", "fr"];
export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  fr: "Français",
};

export const localeFlags: Record<Locale, string> = {
  en: "🇬🇧",
  fr: "🇫🇷",
};

export function isValidLocale(l: string): l is Locale {
  return locales.includes(l as Locale);
}

/** Strip locale prefix from a pathname (/fr/companies → /companies, /companies → /companies) */
export function stripLocale(pathname: string): string {
  for (const locale of locales) {
    if (locale === defaultLocale) continue;
    if (pathname === `/${locale}`) return "/";
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
  }
  return pathname;
}

/** Get the localized version of a path */
export function localePath(pathname: string, locale: Locale): string {
  const stripped = stripLocale(pathname);
  if (locale === defaultLocale) return stripped || "/";
  return `/${locale}${stripped === "/" ? "" : stripped}`;
}

/** Extract locale from pathname */
export function getLocaleFromPathname(pathname: string): Locale {
  for (const locale of locales) {
    if (locale === defaultLocale) continue;
    if (pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)) return locale;
  }
  return defaultLocale;
}

export type Dictionary = typeof import("./dictionaries/fr.json");

const cache: Partial<Record<Locale, Dictionary>> = {};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  if (cache[locale]) return cache[locale]!;
  const dict = (await import(`./dictionaries/${locale}.json`)) as { default: Dictionary };
  cache[locale] = dict.default;
  return dict.default;
}

/** Tiny synchronous helper — use on client after passing dict as prop */
export function t(dict: Dictionary, key: string, vars?: Record<string, string | number>): string {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let val: any = dict;
  for (const p of parts) {
    if (val == null || typeof val !== "object") return key;
    val = val[p];
  }
  if (typeof val !== "string") return key;
  if (vars) {
    return val.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`));
  }
  return val;
}
