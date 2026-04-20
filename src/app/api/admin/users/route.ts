import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

// GET /api/admin/users — list all users with portfolio & alert counts
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
      _count: { select: { positions: true, alerts: true } },
    },
  });

  return NextResponse.json({ users });
}

// PATCH /api/admin/users — ban/unban, change role
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { userId, action, reason } = await req.json();
  if (!userId || !action) return NextResponse.json({ error: "userId and action required" }, { status: 400 });

  // Cannot act on self
  if (userId === admin.id) {
    return NextResponse.json({ error: "Impossible de modifier votre propre compte" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (action === "ban") {
    await prisma.user.update({
      where: { id: userId },
      data: { isBanned: true, bannedAt: new Date(), bannedReason: reason ?? null },
    });
    return NextResponse.json({ ok: true, action: "banned" });
  }

  if (action === "unban") {
    await prisma.user.update({
      where: { id: userId },
      data: { isBanned: false, bannedAt: null, bannedReason: null },
    });
    return NextResponse.json({ ok: true, action: "unbanned" });
  }

  if (action === "make_admin") {
    await prisma.user.update({ where: { id: userId }, data: { role: "admin" } });
    return NextResponse.json({ ok: true, action: "promoted" });
  }

  if (action === "revoke_admin") {
    await prisma.user.update({ where: { id: userId }, data: { role: "user" } });
    return NextResponse.json({ ok: true, action: "demoted" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
