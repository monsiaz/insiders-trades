import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateToken, createSession, setSessionCookie } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Le mot de passe doit faire au moins 8 caractères" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email" }, { status: 409 });
    }

    const hashed = await hashPassword(password);
    const verifyToken = generateToken();

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: name?.trim() || null,
        password: hashed,
        verifyToken,
      },
    });

    // Send verification email (non-blocking)
    sendVerificationEmail(user.email, verifyToken).catch(console.warn);

    // Auto-login (session without verified check for now)
    const token = await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
    await setSessionCookie(token);

    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) {
    console.error("[register]", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
