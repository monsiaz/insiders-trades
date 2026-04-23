export type Locale = "en" | "fr";
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
