import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password) return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Mot de passe trop court (8 car. min)" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetTokenExp || user.resetTokenExp < new Date()) {
      return NextResponse.json({ error: "Lien expiré ou invalide" }, { status: 400 });
    }

    const hashed = await hashPassword(password);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed, resetToken: null, resetTokenExp: null },
    });

    // Auto-login
    const sessionToken = await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
    await setSessionCookie(sessionToken);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[reset-password]", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
