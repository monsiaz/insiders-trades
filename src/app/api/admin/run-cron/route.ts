/**
 * POST /api/admin/run-cron
 *
 * Admin-session-protected endpoint that triggers one of the site's cron
 * jobs on demand. It fetches the target route server-side with the
 * CRON_SECRET Bearer token, so the shared secret never leaves the server.
 *
 * Body:
 *   { path: "/api/cron"     } · full pipeline
 *   { path: "/api/sync-latest" } · hourly sync
 *   { path: "/api/enrich-mcap" } · daily financials enrich
 *   { path: "/api/backtest/compute" }
 *   { path: "/api/score-signals" } · re-score declarations
 *   { path: "/api/reparse",  mode: "missing-isin", limit: 50 }
 *   { path: "/api/enrich",   limit: 50 }
 *
 * GET /api/admin/run-cron
 *   Returns the allow-list + their metadata (label, schedule, method).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

interface JobDescriptor {
  path: string;
  label: string;
  description: string;
  schedule: string;            // cron expression (from vercel.json) or "manual"
  scheduleHuman: string;        // human-readable FR
  method: "GET" | "POST";
  category: "sync" | "score" | "backtest" | "enrich" | "email" | "logo" | "other";
}

export const CRON_JOBS: JobDescriptor[] = [
  {
    path: "/api/cron",
    label: "Pipeline quotidienne complète",
    description:
      "Sync 500 dernières déclarations → re-parse PDF incomplets → enrich financials → score signals → backtest incrémental → gender GPT → digest emails.",
    schedule: "0 3 * * *",
    scheduleHuman: "Tous les jours à 03:00 UTC",
    method: "GET",
    category: "sync",
  },
  {
    path: "/api/sync-latest",
    label: "Sync AMF horaire",
    description: "Récupère les dernières déclarations AMF (100) et les parse.",
    schedule: "0 * * * *",
    scheduleHuman: "Toutes les heures",
    method: "GET",
    category: "sync",
  },
  {
    path: "/api/enrich-mcap",
    label: "Enrichissement Yahoo",
    description: "Rafraîchit les données Yahoo (prix, fondamentaux, analystes) pour 80 sociétés prioritaires.",
    schedule: "0 4 * * *",
    scheduleHuman: "Tous les jours à 04:00 UTC",
    method: "GET",
    category: "enrich",
  },
  {
    path: "/api/backtest/compute",
    label: "Backtest hebdomadaire",
    description: "Calcule les rendements T+30/60/90/160/365/730 pour les déclarations manquantes (300 par run).",
    schedule: "0 5 * * 0",
    scheduleHuman: "Dimanche à 05:00 UTC",
    method: "GET",
    category: "backtest",
  },
  {
    path: "/api/score-signals",
    label: "Re-scoring des signaux",
    description: "Recalcule signalScore / isCluster / pctOfMarketCap pour toutes les déclarations.",
    schedule: "manual",
    scheduleHuman: "À la demande",
    method: "GET",
    category: "score",
  },
  {
    path: "/api/admin/fetch-logos",
    label: "Logos (Clearbit / Scrape / OpenAI)",
    description: "Récupère + upload les logos manquants pour les sociétés sans logoUrl.",
    schedule: "manual",
    scheduleHuman: "À la demande",
    method: "POST",
    category: "logo",
  },
  {
    path: "/api/reparse",
    label: "Re-parse PDF AMF",
    description: "Re-parse les PDF AMF incomplets (ISIN / montant manquants).",
    schedule: "manual",
    scheduleHuman: "À la demande",
    method: "POST",
    category: "sync",
  },
  {
    path: "/api/enrich",
    label: "Enrich PDF AMF",
    description: "Enrichit les déclarations avec extraction PDF (montant, prix, volume, ISIN).",
    schedule: "manual",
    scheduleHuman: "À la demande",
    method: "POST",
    category: "sync",
  },
];

const ALLOWED_PATHS = new Set(CRON_JOBS.map((j) => j.path));

export async function GET(_req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return NextResponse.json({ jobs: CRON_JOBS });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const path = typeof body.path === "string" ? body.path : "";

  if (!path || !ALLOWED_PATHS.has(path)) {
    return NextResponse.json({ error: "Unknown or unauthorized path" }, { status: 400 });
  }

  const job = CRON_JOBS.find((j) => j.path === path)!;

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré · impossible de déclencher un job" },
      { status: 500 }
    );
  }

  // Build the target URL using the same origin (so redirects / auth headers
  // match). In prod this is Vercel's URL; in dev it's localhost.
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (() => {
      const h = req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      return h ? `${proto}://${h}` : "http://localhost:3000";
    })();

  const target = new URL(job.path, origin);

  // Per-job extras from the admin-supplied body (mode / limit / force)
  if (body && typeof body === "object") {
    for (const key of ["mode", "limit", "force", "secret"] as const) {
      if (body[key] != null && !target.searchParams.has(key)) {
        target.searchParams.set(key, String(body[key]));
      }
    }
  }

  const init: RequestInit = {
    method: job.method,
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "x-cron-secret": cronSecret,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(285_000),
  };

  // For POST, carry through mode/limit/force in the body too
  if (job.method === "POST") {
    const payload: Record<string, unknown> = {};
    for (const key of ["mode", "limit", "force"] as const) {
      if (body[key] != null) payload[key] = body[key];
    }
    init.body = JSON.stringify(payload);
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(target.toString(), init);
    const elapsedMs = Date.now() - startedAt;
    const ct = res.headers.get("content-type") ?? "";
    const isJson = ct.includes("application/json");
    const payload = isJson ? await res.json().catch(() => null) : await res.text();

    return NextResponse.json({
      ok: res.ok,
      path,
      status: res.status,
      elapsedMs,
      payload,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        path,
        error: String(err instanceof Error ? err.message : err),
        elapsedMs: Date.now() - startedAt,
      },
      { status: 500 }
    );
  }
}
