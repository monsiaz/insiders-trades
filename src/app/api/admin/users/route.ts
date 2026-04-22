import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

// GET /api/admin/users · list all users with portfolio & alert counts
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");

  if (userId) {
    // Single user details + portfolio
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, firstName: true, lastName: true,
        role: true, isBanned: true, bannedAt: true, bannedReason: true,
        emailVerified: true, createdAt: true, lastLoginAt: true,
        alertEnabled: true, lastAlertAt: true,
        portfolioCash: true, credits: true, creditsUpdatedAt: true,
        positions: {
          select: {
            id: true, name: true, isin: true, yahooSymbol: true,
            quantity: true, buyingPrice: true, currentPrice: true,
            totalInvested: true, currentValue: true, pnl: true, pnlPct: true,
            createdAt: true,
          },
          orderBy: { totalInvested: "desc" },
        },
        _count: { select: { alerts: true } },
      },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user });
  }

  // All users
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, email: true, name: true, firstName: true, lastName: true,
      role: true, isBanned: true, bannedAt: true,
      emailVerified: true, createdAt: true, lastLoginAt: true,
      alertEnabled: true, credits: true,
      _count: { select: { positions: true, alerts: true } },
    },
  });

  return NextResponse.json({ users });
}

/**
 * PATCH /api/admin/users · body: { userId, action, ... }
 *
 * Supported actions:
 *   ban · body: { reason? }
 *   unban
 *   make_admin · grant admin role
 *   revoke_admin · demote to user
 *   set_credits · body: { credits: number } · absolute
 *   adjust_credits · body: { delta: number } · add/subtract
 *   set_cash · body: { portfolioCash: number|null }
 *   toggle_alerts · body: { enabled: boolean }
 *   force_logout · clears session markers (lastLoginAt reset);
 *                     the next middleware hit rejects stale JWTs because
 *                     the banned flag can't be toggled per-user at JWT
 *                     layer. Kept as a no-op rename for clarity.
 */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json();
  const { userId, action } = body as { userId?: string; action?: string };
  if (!userId || !action) {
    return NextResponse.json({ error: "userId and action required" }, { status: 400 });
  }

  // Destructive actions are blocked on self. Read-only-ish edits (credits/cash/alerts) are fine.
  const SELF_BLOCKED = new Set(["ban", "revoke_admin"]);
  if (userId === admin.id && SELF_BLOCKED.has(action)) {
    return NextResponse.json({ error: "Impossible de modifier votre propre compte" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  switch (action) {
    case "ban": {
      const reason = typeof body.reason === "string" ? body.reason : null;
      await prisma.user.update({
        where: { id: userId },
        data: { isBanned: true, bannedAt: new Date(), bannedReason: reason },
      });
      return NextResponse.json({ ok: true, action: "banned" });
    }
    case "unban":
      await prisma.user.update({
        where: { id: userId },
        data: { isBanned: false, bannedAt: null, bannedReason: null },
      });
      return NextResponse.json({ ok: true, action: "unbanned" });
    case "make_admin":
      await prisma.user.update({ where: { id: userId }, data: { role: "admin" } });
      return NextResponse.json({ ok: true, action: "promoted" });
    case "revoke_admin":
      await prisma.user.update({ where: { id: userId }, data: { role: "user" } });
      return NextResponse.json({ ok: true, action: "demoted" });

    case "set_credits": {
      const credits = Number(body.credits);
      if (!Number.isFinite(credits) || credits < 0 || credits > 1_000_000) {
        return NextResponse.json({ error: "credits invalide" }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: userId },
        data: { credits: Math.round(credits), creditsUpdatedAt: new Date() },
      });
      return NextResponse.json({ ok: true, action: "set_credits", credits: Math.round(credits) });
    }

    case "adjust_credits": {
      const delta = Number(body.delta);
      if (!Number.isFinite(delta)) {
        return NextResponse.json({ error: "delta invalide" }, { status: 400 });
      }
      const next = Math.max(0, Math.min(1_000_000, (target.credits ?? 0) + Math.round(delta)));
      await prisma.user.update({
        where: { id: userId },
        data: { credits: next, creditsUpdatedAt: new Date() },
      });
      return NextResponse.json({ ok: true, action: "adjust_credits", credits: next });
    }

    case "set_cash": {
      const raw = body.portfolioCash;
      const cash = raw == null || raw === "" ? null : Number(raw);
      if (cash != null && (!Number.isFinite(cash) || cash < 0)) {
        return NextResponse.json({ error: "portfolioCash invalide" }, { status: 400 });
      }
      await prisma.user.update({
        where: { id: userId },
        data: { portfolioCash: cash },
      });
      return NextResponse.json({ ok: true, action: "set_cash", portfolioCash: cash });
    }

    case "toggle_alerts": {
      const enabled = Boolean(body.enabled);
      await prisma.user.update({ where: { id: userId }, data: { alertEnabled: enabled } });
      return NextResponse.json({ ok: true, action: "toggle_alerts", alertEnabled: enabled });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
