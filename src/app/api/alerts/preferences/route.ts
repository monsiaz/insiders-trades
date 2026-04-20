/**
 * GET  /api/alerts/preferences  — returns user alert settings
 * POST /api/alerts/preferences  — { enabled: boolean } toggle opt-in
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { alertEnabled: true } });
  return NextResponse.json({ alertEnabled: u?.alertEnabled ?? true });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean")
    return NextResponse.json({ error: "enabled boolean required" }, { status: 400 });
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { alertEnabled: body.enabled },
    select: { alertEnabled: true },
  });
  return NextResponse.json({ alertEnabled: updated.alertEnabled });
}
