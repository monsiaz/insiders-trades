import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, generateToken, createSession, setSessionCookie } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

const ADMIN_EMAIL = "simon.azoulay.pro@gmail.com";

export async function POST(req: NextRequest) {
  try {
    const { email, password, firstName, lastName, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Le mot de passe doit faire au moins 8 caractères" }, { status: 400 });
    }
    // Basic password strength
    if (!/[A-Z]/.test(password) && !/[0-9]/.test(password)) {
      return NextResponse.json({ error: "Le mot de passe doit contenir au moins une majuscule ou un chiffre" }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email" }, { status: 409 });
    }

    const hashed = await hashPassword(password);
    const verifyToken = generateToken();

    // Auto-grant admin to the owner email
    const role = normalizedEmail === ADMIN_EMAIL ? "admin" : "user";

    // Build display name
    const displayName = firstName && lastName
      ? `${firstName} ${lastName}`.trim()
      : firstName ?? lastName ?? name?.trim() ?? null;

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: displayName,
        firstName: firstName?.trim() || null,
        lastName: lastName?.trim() || null,
        password: hashed,
        verifyToken,
        role,
        lastLoginAt: new Date(),
      },
    });

    // Send verification email (non-blocking)
    sendVerificationEmail(user.email, verifyToken).catch(console.warn);

    const token = await createSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
    await setSessionCookie(token);

    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    console.error("[register]", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
