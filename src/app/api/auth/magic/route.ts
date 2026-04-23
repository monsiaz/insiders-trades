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

// The owner email whose session will be created for magic-link visitors
const OWNER_EMAIL = "simon.azoulay.pro@gmail.com";

export async function GET(req: NextRequest) {
  const token    = req.nextUrl.searchParams.get("t") ?? "";
  const nextPath = req.nextUrl.searchParams.get("next") ?? "/";
  const secret   = process.env.MAGIC_LINK_TOKEN ?? "";

  // ── 1. Validate token ──────────────────────────────────────────────────────
  if (!secret) {
    return NextResponse.json({ error: "Magic links not configured" }, { status: 503 });
  }
  if (!token || token !== secret) {
    return NextResponse.json(
      { error: "Invalid or expired magic link." },
      { status: 401 }
    );
  }

  // ── 2. Find the owner account ──────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true, email: true, name: true, role: true, isBanned: true },
  });

  if (!user || user.isBanned) {
    return NextResponse.json({ error: "Owner account not found." }, { status: 404 });
  }

  // ── 3. Create a full session (30 days) ────────────────────────────────────
  const jwt = await createSession({
    userId: user.id,
    email:  user.email,
    name:   user.name,
    role:   user.role,
  });

  // ── 4. Set the session cookie + redirect ──────────────────────────────────
  await setSessionCookie(jwt);

  const dest = new URL(nextPath.startsWith("/") ? nextPath : "/", req.url);
  return NextResponse.redirect(dest);
}
