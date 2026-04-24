/**
 * GET /api/auth/magic?t=TOKEN&next=/
 *
 * Magic-link auto-login endpoint.
 * - Validates the one-time shared token against MAGIC_LINK_TOKEN env var.
 * - Looks up the owner account (simon.azoulay.pro@gmail.com).
 * - Creates a real 30-day JWT session cookie — identical to a normal login.
 * - Redirects to `next` (default: /).
 *
 * The token is NOT single-use on purpose: it's a permanent shared access link
 * the owner can share with friends/beta testers. Revoke it by rotating
 * MAGIC_LINK_TOKEN in Vercel env vars and redeploying.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, setSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

// The owner email whose session will be created for all magic-link visitors.
const OWNER_EMAIL = "simon.azoulay.pro@gmail.com";

export async function GET(req: NextRequest) {
  const token    = req.nextUrl.searchParams.get("t") ?? "";
  const nextPath = req.nextUrl.searchParams.get("next") ?? "/";

  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 401 });
  }

  // ── 1. Check master token (env var) first ─────────────────────────────────
  const masterSecret = (process.env.MAGIC_LINK_TOKEN ?? "").trim();
  const isMaster     = masterSecret && token === masterSecret;

  // ── 2. If not master, look up in DB ───────────────────────────────────────
  if (!isMaster) {
    const dbLink = await prisma.magicLink.findUnique({ where: { token } });

    if (!dbLink || dbLink.revokedAt) {
      return NextResponse.json({ error: "Invalid or revoked magic link." }, { status: 401 });
    }
    if (dbLink.expiresAt && new Date() > dbLink.expiresAt) {
      return NextResponse.json({ error: "Magic link has expired." }, { status: 401 });
    }
    if (dbLink.maxUses != null && dbLink.usageCount >= dbLink.maxUses) {
      return NextResponse.json({ error: "Magic link usage limit reached." }, { status: 401 });
    }

    // Increment usage counter (fire-and-forget)
    prisma.magicLink.update({
      where: { id: dbLink.id },
      data:  { usageCount: { increment: 1 } },
    }).catch(() => {});
  }

  // ── 3. Find the owner account ─────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, email: true, name: true, role: true, isBanned: true },
  });

  if (!user || user.isBanned) {
    return NextResponse.json({ error: "Owner account not found." }, { status: 404 });
  }

  // ── 4. Create a 30-day session ────────────────────────────────────────────
  const jwt = await createSession({
    userId: user.id,
    email:  user.email,
    name:   user.name,
    role:   user.role,
  });

  await setSessionCookie(jwt);

  const dest = new URL(nextPath.startsWith("/") ? nextPath : "/", req.url);
  return NextResponse.redirect(dest);
}
