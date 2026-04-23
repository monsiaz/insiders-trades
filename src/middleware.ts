/**
 * Middleware — locale routing + beta lockdown.
 *
 * LOCALE ROUTING
 * ─────────────
 * EN is the default locale (no URL prefix). FR lives at /fr/…
 *
 * • /fr/*          → rewritten internally to /*  (URL stays /fr/*)
 *                    + x-locale: fr header injected for server components
 * • /en/*          → 301 redirect to /*  (canonical: no /en/ prefix)
 * • everything else → x-locale: en header injected
 *
 * BETA LOCKDOWN
 * ─────────────
 * Every page and API require a valid session JWT unless the path is
 * allow-listed in PUBLIC_PREFIXES / PUBLIC_EXACT below.
 */
import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET_RAW = process.env.JWT_SECRET;
const JWT_SECRET = JWT_SECRET_RAW
  ? new TextEncoder().encode(JWT_SECRET_RAW)
  : null;

const COOKIE_NAME = "it_session";
const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

// ── Locale config ────────────────────────────────────────────────────────────
const NON_DEFAULT_LOCALES = ["fr"] as const;
type NonDefaultLocale = (typeof NON_DEFAULT_LOCALES)[number];

function getLocaleFromPath(pathname: string): { locale: string; stripped: string } {
  for (const locale of NON_DEFAULT_LOCALES) {
    if (pathname === `/${locale}`) return { locale, stripped: "/" };
    if (pathname.startsWith(`/${locale}/`)) return { locale, stripped: pathname.slice(locale.length + 1) };
  }
  return { locale: "en", stripped: pathname };
}

// ── Auth allow-list ──────────────────────────────────────────────────────────

/** Paths reachable without an authenticated session (during beta). */
const PUBLIC_PREFIXES: string[] = [
  "/auth/",
  "/fonctionnement",
  "/methodologie",
  "/performance",
  "/strategie",
  "/pitch",
  "/docs",
  "/api/v1/",
  "/api/docs",
  "/api/openapi.json",
  "/api/mcp",
  "/api/auth/",
  "/api/cron",
  "/api/sync",
  "/api/sync-latest",
  "/api/sync-batch",
  "/api/migrate",
  "/api/reparse",
  "/api/enrich",
  "/api/enrich-mcap",
  "/api/fetch-all-amf",
  "/api/score-signals",
  "/api/backtest/compute",
  "/api/admin/fetch-logos",
];

/** Exact pathnames that are always public. */
const PUBLIC_EXACT = new Set<string>([
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap-static.xml",
  "/sitemap-companies.xml",
  "/sitemap-insiders.xml",
  "/fr/sitemap-static.xml",
  "/fr/sitemap-companies.xml",
  "/fr/sitemap-insiders.xml",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(prefix)) return true;
  }
  return false;
}

function isApiRequest(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

function unauthorized(req: NextRequest, originalPathname: string): NextResponse {
  if (isApiRequest(originalPathname)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        reason: "beta-access-required",
        hint: "Log in at /auth/login with the beta credentials.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  const url = new URL("/auth/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  const res = NextResponse.redirect(url);
  res.cookies.delete(COOKIE_NAME);
  return res;
}

// ── Main middleware ──────────────────────────────────────────────────────────
export async function middleware(req: NextRequest) {
  const rawPath = req.nextUrl.pathname;

  // 1. Canonical redirect: /en/* → /* (avoid duplicate content)
  if (rawPath === "/en" || rawPath.startsWith("/en/")) {
    const stripped = rawPath === "/en" ? "/" : rawPath.slice(3);
    const target = new URL(stripped || "/", req.url);
    target.search = req.nextUrl.search;
    return NextResponse.redirect(target, 301);
  }

  // 2. Trailing-slash redirect: /foo/ → /foo (except root /)
  // Exceptions: sitemap and robots files which Next.js serves with trailing slashes internally
  if (
    rawPath !== "/" &&
    rawPath.endsWith("/") &&
    !rawPath.endsWith(".xml/") &&
    !rawPath.endsWith(".txt/")
  ) {
    const noSlash = rawPath.slice(0, -1);
    const target = new URL(noSlash, req.url);
    target.search = req.nextUrl.search;
    return NextResponse.redirect(target, 301);
  }

  // 3. Detect locale
  const { locale, stripped } = getLocaleFromPath(rawPath);

  // 4. Auth check uses the STRIPPED path (so /fr/fonctionnement → /fonctionnement)
  const authPath = stripped;
  const isPublic = isPublicPath(authPath);

  if (!isPublic) {
    if (!JWT_SECRET) return unauthorized(req, authPath);
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return unauthorized(req, authPath);
    try {
      await jwtVerify(token, JWT_SECRET);
    } catch {
      return unauthorized(req, authPath);
    }
  }

  // 5. For non-default locale: rewrite to stripped path, inject locale header
  if (locale !== "en") {
    const rewriteUrl = new URL(stripped === "/" ? "/" : stripped, req.url);
    rewriteUrl.search = req.nextUrl.search;
    const response = NextResponse.rewrite(rewriteUrl);
    response.headers.set("x-locale", locale);
    response.headers.set("x-original-path", rawPath);
    return response;
  }

  // 6. Default locale (EN) — inject header and pass through
  const response = NextResponse.next();
  response.headers.set("x-locale", "en");
  response.headers.set("x-original-path", rawPath);
  return response;
}

export const config = {
  matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
