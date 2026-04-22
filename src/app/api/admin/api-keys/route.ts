/**
 * Admin-level view of ALL user API keys + global aggregates + revoke.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revokeApiKey } from "@/lib/api-key";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") return null;
  return u;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const [keys, totalRequests, activeKeys, revokedKeys, requestsToday, uniqueUsers] = await Promise.all([
    prisma.apiKey.findMany({
      orderBy: [{ revokedAt: "asc" }, { totalRequests: "desc" }],
      select: {
        id: true, name: true, prefix: true, scopes: true,
        totalRequests: true, requestsToday: true,
        lastUsedAt: true, lastUsedIp: true, lastUserAgent: true,
        revokedAt: true, revokedReason: true, createdAt: true,
        user: { select: { id: true, email: true, firstName: true, lastName: true, role: true } },
      },
    }),
    prisma.apiKey.aggregate({ _sum: { totalRequests: true } }),
    prisma.apiKey.count({ where: { revokedAt: null } }),
    prisma.apiKey.count({ where: { revokedAt: { not: null } } }),
    prisma.apiKey.aggregate({ _sum: { requestsToday: true } }),
    prisma.apiKey.findMany({ distinct: ["userId"], select: { userId: true } }),
  ]);

  // Top consumers
  const topUsers = await prisma.apiKey.groupBy({
    by: ["userId"],
    _sum: { totalRequests: true, requestsToday: true },
    _count: { _all: true },
    orderBy: { _sum: { totalRequests: "desc" } },
    take: 10,
  });

  const userLookup = new Map(
    (await prisma.user.findMany({
      where: { id: { in: topUsers.map((u) => u.userId) } },
      select: { id: true, email: true, firstName: true, lastName: true },
    })).map((u) => [u.id, u])
  );

  return NextResponse.json({
    stats: {
      totalKeys: keys.length,
      activeKeys,
      revokedKeys,
      uniqueOwners: uniqueUsers.length,
      totalRequests: totalRequests._sum.totalRequests ?? 0,
      requestsToday: requestsToday._sum.requestsToday ?? 0,
    },
    topConsumers: topUsers.map((t) => ({
      userId: t.userId,
      user: userLookup.get(t.userId) ?? null,
      keysCount: t._count._all,
      totalRequests: t._sum.totalRequests ?? 0,
      requestsToday: t._sum.requestsToday ?? 0,
    })),
    keys: keys.map((k) => ({
      ...k,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    })),
  });
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const ok = await revokeApiKey(id, `admin-revoked by ${admin.email}`);
  return NextResponse.json({ ok });
}
