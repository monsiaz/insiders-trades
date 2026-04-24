/**
 * Shared locale-path utility.
 *
 * In this app, FR lives at /fr/… and EN has no prefix.
 * All internal navigation links must use this helper so that a user browsing
 * in French stays in French when clicking through to detail pages.
 *
 * Usage:
 *   import { lp } from "@/lib/locale-path";
 *   <Link href={lp(isFr, `/company/${slug}`)} />
 */

/**
 * Returns a locale-prefixed path.
 *   lp(true,  "/company/foo") → "/fr/company/foo"
 *   lp(false, "/company/foo") → "/company/foo"
 */
export function lp(isFr: boolean, path: string): string {
  if (!isFr) return path;
  if (path.startsWith("/fr/") || path === "/fr") return path;
  return `/fr${path}`;
}

/**
 * Hook-free version for server components that already know the locale.
 * Accepts the locale string directly.
 */
export function lpl(locale: "fr" | "en", path: string): string {
  return lp(locale === "fr", path);
}
