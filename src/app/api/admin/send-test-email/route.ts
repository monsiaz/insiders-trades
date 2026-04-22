/**
 * POST /api/admin/send-test-email
 *
 * Admin-only endpoint to trigger a real test email and iterate on the
 * template without waiting for the daily cron.
 *
 * Body: { to?: string, type?: "digest" | "welcome" | "verify" }
 *   - to     : recipient (defaults to the admin's own email)
 *   - type   : which template to render (default "digest")
 *
 * GET  /api/admin/send-test-email?to=…&type=digest  → same thing (convenience)
 *
 * Protection: only users with role="admin" can hit this.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRecommendations } from "@/lib/recommendation-engine";
import {
  buildDigestForUser,
  sendDailyDigestEmail,
} from "@/lib/digest";
import {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  renderDailyDigest,
} from "@/lib/email";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "admin") return null;
  return user;
}

async function dispatch(params: {
  adminUserId: string;
  adminEmail: string;
  to: string;
  type: string;
  firstName: string | null;
}) {
  const { to, type, firstName, adminUserId } = params;

  if (type === "welcome") {
    const res = await sendWelcomeEmail(to, firstName ?? "");
    return res;
  }
  if (type === "verify") {
    const res = await sendVerificationEmail(to, "TEST-TOKEN-PREVIEW-1234");
    return res;
  }
  if (type === "reset") {
    const res = await sendPasswordResetEmail(to, "TEST-TOKEN-PREVIEW-1234");
    return res;
  }

  // Default · "digest"
  // Fetch the same data the cron would, but delivered to `to` with the admin's first name.
  const [topBuys, topSells] = await Promise.all([
    getRecommendations({ mode: "general", limit: 3, lookbackDays: 14 }),
    getRecommendations({ mode: "sells",   limit: 3, lookbackDays: 14 }),
  ]);

  const payload = await buildDigestForUser({
    user: { id: adminUserId, email: to, firstName },
    topBuys,
    topSells,
  });

  if (!payload) {
    // Force a non-empty payload for test by falling back to the recos even if empty (shouldn't happen)
    return { delivered: false, reason: "no content to send" };
  }

  return sendDailyDigestEmail(payload);
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, string>));
  const to = (body.to as string)?.trim() || admin.email;
  const type = ((body.type as string) ?? "digest").trim();

  // Pull admin's own first name for personalization when sending to self
  const dbAdmin = await prisma.user.findUnique({
    where: { id: admin.id },
    select: { firstName: true, name: true },
  });
  const firstName = dbAdmin?.firstName ?? dbAdmin?.name ?? null;

  const result = await dispatch({
    adminUserId: admin.id,
    adminEmail: admin.email,
    to,
    type,
    firstName,
  });

  return NextResponse.json({ ok: true, to, type, result });
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const to = url.searchParams.get("to")?.trim() || admin.email;
  const type = url.searchParams.get("type") ?? "digest";
  const dryRun = url.searchParams.get("dry") === "1";

  const dbAdmin = await prisma.user.findUnique({
    where: { id: admin.id },
    select: { firstName: true, name: true },
  });
  const firstName = dbAdmin?.firstName ?? dbAdmin?.name ?? null;

  // Dry-run: return the rendered HTML without sending (preview in browser).
  //   /api/admin/send-test-email?dry=1        → digest preview
  //   /api/admin/send-test-email?dry=1&sample=1 → digest preview with seeded
  //   demo portfolio alerts (to test the layout even when user holds nothing)
  if (dryRun && type === "digest") {
    const wantSample = url.searchParams.get("sample") === "1";
    const [topBuys, topSells] = await Promise.all([
      getRecommendations({ mode: "general", limit: 3, lookbackDays: 14 }),
      getRecommendations({ mode: "sells",   limit: 3, lookbackDays: 14 }),
    ]);
    let payload = await buildDigestForUser({
      user: { id: admin.id, email: to, firstName },
      topBuys,
      topSells,
    });
    if (wantSample && payload) {
      // Inject 2 fake portfolio alerts so the admin can see the section layout.
      payload = {
        ...payload,
        portfolioAlerts: [
          ...payload.portfolioAlerts,
          {
            action: "SELL",
            company: { name: "DÉMO · Société test", slug: "demo" },
            insider: { name: "Jean Dupont", role: "PDG/DG" },
            amount: 1_450_000,
            pctOfMarketCap: 1.12,
            signalScore: 72,
            userPosition: { quantity: 250, pnlPct: 18.4 },
            pubDate: new Date().toISOString(),
            amfLink: "https://bdif.amf-france.org",
          },
          {
            action: "BUY",
            company: { name: "DÉMO · Autre société", slug: "demo2" },
            insider: { name: "Marie Martin", role: "CFO/DAF" },
            amount: 230_000,
            pctOfMarketCap: 0.42,
            signalScore: 58,
            userPosition: { quantity: 500, pnlPct: -3.1 },
            pubDate: new Date().toISOString(),
            amfLink: "https://bdif.amf-france.org",
          },
        ],
      };
    }
    if (!payload) return NextResponse.json({ error: "no content" }, { status: 404 });
    const { html } = renderDailyDigest(payload);
    return new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const result = await dispatch({
    adminUserId: admin.id,
    adminEmail: admin.email,
    to,
    type,
    firstName,
  });

  return NextResponse.json({ ok: true, to, type, result });
}
