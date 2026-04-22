/**
 * API v1 authentication helpers.
 *
 *   const ctx = await requireApiKey(req);
 *   if (ctx instanceof NextResponse) return ctx; // 401 / 403
 *   // ctx.user, ctx.key — use at will
 *
 * Also provides `withApi()` that handles auth + latency metadata + JSON wrap.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveApiKey, bumpKeyUsage } from "./api-key";

export interface ApiContext {
  key: NonNullable<Awaited<ReturnType<typeof resolveApiKey>>>;
  user: NonNullable<Awaited<ReturnType<typeof resolveApiKey>>>["user"];
  ip: string | null;
  userAgent: string | null;
  startedAt: number;
}

export async function requireApiKey(req: NextRequest): Promise<ApiContext | NextResponse> {
  const authHeader = req.headers.get("authorization") ?? "";
  const xApiKey = req.headers.get("x-api-key") ?? "";

  // Accept either "Authorization: Bearer <key>" or "X-Api-Key: <key>"
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const plaintext = (xApiKey || bearer || "").trim();

  if (!plaintext) {
    return errorJson(
      401,
      "missing_api_key",
      "Clé API manquante. Ajoutez un header `Authorization: Bearer <your_key>` ou `X-Api-Key: <your_key>`."
    );
  }

  const key = await resolveApiKey(plaintext);
  if (!key) {
    return errorJson(
      401,
      "invalid_api_key",
      "Clé API invalide, inconnue ou révoquée. Générez une nouvelle clé depuis votre compte."
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  const userAgent = req.headers.get("user-agent") ?? null;

  // Don't await — counter bump is best-effort and should never block the response.
  // We fire-and-forget.
  void bumpKeyUsage(key.id, key.requestsToday, key.todayResetAt, { ip, ua: userAgent });

  return { key, user: key.user, ip, userAgent, startedAt: Date.now() };
}

/** Uniform JSON error payload (RFC-7807-ish). */
export function errorJson(
  status: number,
  code: string,
  detail: string,
  extra: Record<string, unknown> = {}
): NextResponse {
  return NextResponse.json(
    {
      error: { code, message: detail, status, ...extra },
    },
    { status }
  );
}

/**
 * Wrap a payload with standard metadata the user asked for:
 *   latencyMs, requestedAt, dataFreshness (per-field).
 */
export function withMeta<T extends Record<string, unknown>>(
  data: T,
  ctx: { startedAt: number; dataFreshness?: Record<string, string | null> }
): T & { meta: unknown } {
  const latencyMs = Date.now() - ctx.startedAt;
  return {
    ...data,
    meta: {
      requestedAt: new Date().toISOString(),
      latencyMs,
      dataFreshness: ctx.dataFreshness ?? {},
    },
  };
}

/** Helper to compose a freshness map from DB rows. */
export function freshness(
  parts: Record<string, Date | string | null | undefined>
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(parts)) {
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === "string") out[k] = v;
    else out[k] = null;
  }
  return out;
}
