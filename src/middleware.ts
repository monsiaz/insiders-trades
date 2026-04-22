/**
 * Beta lockdown middleware.
 *
 * Every page and every non-cron API require a valid session JWT.
 * Allow-listed paths (see PUBLIC_PREFIXES) bypass the check so that
 * auth pages, the auth API, cron/secret endpoints and the site chrome
 * (favicon, fonts, etc.) remain reachable for unauthenticated visitors.
 *
 * For pages, a missing/invalid session triggers a 302 redirect to
 * /auth/login with a ?next= parameter to bounce back after login.
 * For APIs, we return a 401 JSON body (no redirect).
 */
import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET_RAW = process.env.JWT_SECRET;
const JWT_SECRET = JWT_SECRET_RAW
  ? new TextEncoder().encode(JWT_SECRET_RAW)
  : null;

const COOKIE_NAME = "it_session";

/** Paths reachable without an authenticated session (during beta). */
const PUBLIC_PREFIXES: string[] = [
  // Auth pages
  "/auth/",
  // Public marketing / methodology / API docs
  "/fonctionnement",
  "/methodologie",
  "/performance",
  "/strategie",
  "/docs",
  // Public REST API v1 (API-key auth, handled per-route)
  "/api/v1/",
  "/api/docs",
  "/api/openapi.json",
  // MCP server (JSON-RPC over HTTP, API-key auth inside)
  "/api/mcp",
  // Auth API
  "/api/auth/",
  // Cron / webhook / scheduled jobs · gated by CRON_SECRET header or secret query
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

/** Exact pathnames that are public (site chrome). */
const PUBLIC_EXACT = new Set<string>([
  "/robots.txt",
  "/sitemap.xml",
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

function unauthorized(req: NextRequest): NextResponse {
  if (isApiRequest(req.nextUrl.pathname)) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        reason: "beta-access-required",
        hint: "Log in at /auth/login with the beta credentials.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
  // Page: redirect to login
  const url = new URL("/auth/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  const res = NextResponse.redirect(url);
  res.cookies.delete(COOKIE_NAME);
  return res;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Public → let through
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Without a JWT secret at runtime, refuse to serve protected routes
  // (safer than silently letting everyone through).
  if (!JWT_SECRET) {
    return unauthorized(req);
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return unauthorized(req);

  try {
    await jwtVerify(token, JWT_SECRET);
    return NextResponse.next();
  } catch {
    return unauthorized(req);
  }
}

export const config = {
  /**
   * Run middleware on every request EXCEPT:
   *   - Next.js internals (`_next/*`)
   *   - Files with an extension (favicon, images, fonts, manifest, sitemaps…)
   * This keeps the beta guard in front of every page + API route while
   * still letting the site's CSS/fonts/logos render on the login screen.
   */
  matcher: [
    "/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
