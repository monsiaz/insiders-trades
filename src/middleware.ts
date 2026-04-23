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
 * TRAILING SLASH
 * ─────────────
 * All page URLs end with /.  Any URL without a trailing slash is 301-redirected
 * to the slash version.  File extensions (.xml, .txt, …) are excluded.
 * Note: next.config.ts also has `trailingSlash: true` which handles EN routes
 * at the routing level; this middleware covers FR paths + edge cases.
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

// ── Locale config ────────────────────────────────────────────────────────────
const NON_DEFAULT_LOCALES = ["fr"] as const;

function getLocaleFromPath(pathname: string): { locale: string; stripped: string } {
  for (const locale of NON_DEFAULT_LOCALES) {
    // /fr  or  /fr/
    if (pathname === `/${locale}` || pathname === `/${locale}/`) {
      return { locale, stripped: "/" };
    }
    // /fr/companies/  →  /companies/
    if (pathname.startsWith(`/${locale}/`)) {
      return { locale, stripped: pathname.slice(locale.length + 1) || "/" };
    }
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
  "/api/version",
  "/api/freshness",
  "/api/home-data",
  "/api/health",
  "/api/translate-news",
];

/** Exact pathnames that are always public (file-extension routes). */
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
  // Normalize: strip trailing slash for prefix/exact checks (except root)
  const p = pathname !== "/" && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;

  if (PUBLIC_EXACT.has(pathname) || PUBLIC_EXACT.has(p)) return true;
  for (const prefix of PUBLIC_PREFIXES) {
    if (p === prefix || p.startsWith(prefix) || pathname.startsWith(prefix)) return true;
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
        hint: "Log in at /auth/login/ with the beta credentials.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  // Redirect to the login page with a trailing slash
  const url = new URL("/auth/login/", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  const res = NextResponse.redirect(url);
  res.cookies.delete(COOKIE_NAME);
  return res;
}

// ── Helper: path has a file extension ────────────────────────────────────────
function hasFileExtension(pathname: string): boolean {
  // Match things like .xml, .txt, .json, .png, .webp, etc.
  return /\.[a-zA-Z0-9]{1,6}$/.test(pathname);
}

// ── Main middleware ──────────────────────────────────────────────────────────
export async function middleware(req: NextRequest) {
  const rawPath = req.nextUrl.pathname;

  // 1. Canonical redirect: /en/* → /*  (no /en/ prefix in canonical URLs)
  if (rawPath === "/en" || rawPath === "/en/" || rawPath.startsWith("/en/")) {
    const stripped = (rawPath === "/en" || rawPath === "/en/") ? "/" : rawPath.slice(3);
    // Ensure the destination has a trailing slash (unless it's root)
    const dest = stripped === "/" ? "/" : (stripped.endsWith("/") ? stripped : stripped + "/");
    const target = new URL(dest, req.url);
    target.search = req.nextUrl.search;
    return NextResponse.redirect(target, 301);
  }

  // 2. Trailing-slash enforcement: /foo → /foo/
  // Skip: root /,  file-extension paths (.xml .txt etc.), API routes
  if (
    rawPath !== "/" &&
    !rawPath.endsWith("/") &&
    !rawPath.startsWith("/api/") &&
    !hasFileExtension(rawPath)
  ) {
    const target = new URL(rawPath + "/", req.url);
    target.search = req.nextUrl.search;
    return NextResponse.redirect(target, 301);
  }

  // 3. Detect locale from path
  const { locale, stripped } = getLocaleFromPath(rawPath);

  // 4. Auth check uses the STRIPPED path  (/fr/fonctionnement/ → /fonctionnement/)
  const isPublic = isPublicPath(stripped);

  if (!isPublic) {
    if (!JWT_SECRET) return unauthorized(req, stripped);
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return unauthorized(req, stripped);
    try {
      await jwtVerify(token, JWT_SECRET);
    } catch {
      return unauthorized(req, stripped);
    }
  }

  // 5. For non-default locale: rewrite to stripped path, inject locale header
  // IMPORTANT: headers must be passed as REQUEST headers (request: { headers })
  // so that `headers()` in Server Components can read them.
  // Setting them only on response.headers would make them browser-only.
  if (locale !== "en") {
    const rewriteUrl = new URL(stripped === "/" ? "/" : stripped, req.url);
    rewriteUrl.search = req.nextUrl.search;
    const reqHeaders = new Headers(req.headers);
    reqHeaders.set("x-locale", locale);
    reqHeaders.set("x-original-path", rawPath);
    return NextResponse.rewrite(rewriteUrl, { request: { headers: reqHeaders } });
  }

  // 6. Default locale (EN) — inject headers and pass through
  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-locale", "en");
  reqHeaders.set("x-original-path", rawPath);
  return NextResponse.next({ request: { headers: reqHeaders } });
}

export const config = {
  matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
