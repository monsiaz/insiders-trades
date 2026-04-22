/**
 * User-facing API key management.
 *
 *   GET    /api/account/keys       → list the caller's keys
 *   POST   /api/account/keys       body { name } → create + return plaintext (ONCE)
 *   DELETE /api/account/keys?id=x  → revoke
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createApiKey, revokeApiKey } from "@/lib/api-key";

export const dynamic = "force-dynamic";

async function requireUser() {
  const user = await getCurrentUser();
  if (!user || user.isBanned) return null;
  return user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true, name: true, prefix: true, scopes: true,
      totalRequests: true, requestsToday: true,
      lastUsedAt: true, lastUsedIp: true,
      revokedAt: true, revokedReason: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    keys: keys.map((k) => ({
      ...k,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  // Soft cap at 10 active keys per user
  const active = await prisma.apiKey.count({
    where: { userId: user.id, revokedAt: null },
  });
  if (active >= 10) {
    return NextResponse.json(
      { error: "Limite de 10 clés actives atteinte — révoquez-en une d'abord." },
      { status: 403 }
    );
  }

  const { key, record } = await createApiKey({ userId: user.id, name });
  return NextResponse.json({
    key,               // plaintext — shown ONCE
    record: {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes,
      createdAt: record.createdAt.toISOString(),
    },
  });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const key = await prisma.apiKey.findUnique({ where: { id }, select: { userId: true } });
  if (!key || key.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ok = await revokeApiKey(id, "user-revoked");
  return NextResponse.json({ ok });
}
