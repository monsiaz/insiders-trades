/**
 * /api/admin/magic-links  (admin-only)
 *
 * GET  → list all magic links (sorted by createdAt desc)
 * POST → create a new magic link  { label, expiresInDays?, maxUses? }
 * DELETE ?id=xxx → revoke a magic link
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { generateToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function requireAdmin(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return null;
}

// ── GET — list all links ──────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const err = await requireAdmin(req);
  if (err) return err;

  const links = await prisma.magicLink.findMany({
    orderBy: { createdAt: "desc" },
  });

  const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

  return NextResponse.json({
    links: links.map((l) => ({
      ...l,
      url: `${BASE}/auth/magic/?t=${l.token}`,
      isExpired:  l.expiresAt ? new Date() > l.expiresAt : false,
      isRevoked:  !!l.revokedAt,
      isExhausted: l.maxUses != null && l.usageCount >= l.maxUses,
    })),
  });
}

// ── POST — create a new link ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const err = await requireAdmin(req);
  if (err) return err;

  const body = await req.json().catch(() => ({})) as {
    label?: string;
    expiresInDays?: number | null;
    maxUses?: number | null;
  };

  const label = (body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

  const token      = generateToken(32);
  const expiresAt  = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400_000)
    : null;
  const maxUses    = body.maxUses ?? null;

  const link = await prisma.magicLink.create({
    data: { token, label, expiresAt, maxUses },
  });

  const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";
  return NextResponse.json({
    link: { ...link, url: `${BASE}/auth/magic/?t=${link.token}` },
  }, { status: 201 });
}

// ── DELETE — revoke a link ────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const err = await requireAdmin(req);
  if (err) return err;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.magicLink.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
