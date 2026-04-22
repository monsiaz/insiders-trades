/**
 * Admin Alerts API
 *
 *   GET   /api/admin/alerts         → { config, stats, recipients }
 *   PATCH /api/admin/alerts         body: Partial<AlertsConfig> → updated config
 *   POST  /api/admin/alerts/test    body: { to?: string }       → trigger a live test
 *
 * Security: admin session required for all methods.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getAlertsConfig,
  updateAlertsConfig,
  type AlertsConfig,
} from "@/lib/settings";
import { getRecommendations } from "@/lib/recommendation-engine";
import { buildDigestForUser, sendDailyDigestEmail } from "@/lib/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

async function computeStats() {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);

  const [eligible, optedIn, sentToday, sent7d, lastRow, totalSubscribers] =
    await Promise.all([
      prisma.user.count({
        where: {
          isBanned: false,
          emailVerified: { not: null },
        },
      }),
      prisma.user.count({
        where: {
          isBanned: false,
          emailVerified: { not: null },
          alertEnabled: true,
        },
      }),
      prisma.user.count({
        where: { lastAlertAt: { gte: todayStart } },
      }),
      prisma.user.count({
        where: { lastAlertAt: { gte: sevenDaysAgo } },
      }),
      prisma.user.findFirst({
        where: { lastAlertAt: { not: null } },
        orderBy: { lastAlertAt: "desc" },
        select: { lastAlertAt: true, email: true },
      }),
      prisma.user.count({
        where: { alertEnabled: true },
      }),
    ]);

  return {
    eligibleUsers: eligible,
    optedInUsers: optedIn,
    totalSubscribers,
    sentToday,
    sent7d,
    lastSendAt: lastRow?.lastAlertAt?.toISOString() ?? null,
    lastSendTo: lastRow?.email ?? null,
  };
}

async function recipientSummary() {
  const users = await prisma.user.findMany({
    where: {
      isBanned: false,
      emailVerified: { not: null },
      alertEnabled: true,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      name: true,
      lastAlertAt: true,
      _count: { select: { positions: true } },
    },
    orderBy: { email: "asc" },
    take: 50,
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.firstName ?? u.name ?? null,
    lastAlertAt: u.lastAlertAt?.toISOString() ?? null,
    positions: u._count.positions,
  }));
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const [config, stats, recipients] = await Promise.all([
    getAlertsConfig(),
    computeStats(),
    recipientSummary(),
  ]);

  return NextResponse.json({ config, stats, recipients });
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Partial<AlertsConfig>;
  const config = await updateAlertsConfig(body);
  return NextResponse.json({ ok: true, config });
}

// ── POST — trigger a test send ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = (body.to ?? admin.email).trim();

  const cfg = await getAlertsConfig();

  const [topBuys, topSells] = await Promise.all([
    cfg.includeTopBuys
      ? getRecommendations({
          mode: "general",
          limit: cfg.topBuysLimit,
          lookbackDays: cfg.lookbackDays,
        })
      : Promise.resolve([]),
    cfg.includeTopSells
      ? getRecommendations({
          mode: "sells",
          limit: cfg.topSellsLimit,
          lookbackDays: cfg.lookbackDays,
        })
      : Promise.resolve([]),
  ]);

  const dbAdmin = await prisma.user.findUnique({
    where: { id: admin.id },
    select: { firstName: true, name: true },
  });
  const firstName = dbAdmin?.firstName ?? dbAdmin?.name ?? null;

  const payload = await buildDigestForUser({
    user: { id: admin.id, email: to, firstName },
    topBuys,
    topSells,
  });

  if (!payload) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Aucun contenu disponible (pas de reco ≥ +4% ni d'alerte portefeuille ces dernières 48h).",
      },
      { status: 422 }
    );
  }

  // Strip portfolio alerts if the admin disabled that section
  if (!cfg.includePortfolioAlerts) {
    payload.portfolioAlerts = [];
  }

  const res = await sendDailyDigestEmail(payload);
  return NextResponse.json({ ok: !!res.delivered, to, result: res });
}
