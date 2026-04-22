import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

function resolveJwtSecret(): Uint8Array {
  const fromEnv = process.env.JWT_SECRET;
  // In production we REFUSE to fall back to a hardcoded secret ·
  // that would let anyone forge a session cookie.
  if (!fromEnv) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[auth] JWT_SECRET env var is required in production. Refusing to sign/verify with a hardcoded fallback."
      );
    }
    // Dev-only fallback (obviously not a real secret)
    return new TextEncoder().encode("dev-only-fallback-never-use-in-prod");
  }
  if (fromEnv.length < 32) {
    throw new Error("[auth] JWT_SECRET must be at least 32 characters");
  }
  return new TextEncoder().encode(fromEnv);
}

const JWT_SECRET = resolveJwtSecret();
const COOKIE_NAME = "it_session";
const SESSION_DURATION = 60 * 60 * 24 * 30; // 30 days

// ── Password ────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── JWT sessions ─────────────────────────────────────────────────────────────

export interface SessionPayload {
  userId: string;
  email: string;
  name: string | null;
  role: string;
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(JWT_SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// ── Cookie helpers ───────────────────────────────────────────────────────────

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

// ── Current user ─────────────────────────────────────────────────────────────

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, firstName: true, lastName: true, role: true, emailVerified: true, isBanned: true },
  });
  // Revoked users are treated as logged out
  if (!user || user.isBanned) return null;
  return user;
}

// ── Token generation ─────────────────────────────────────────────────────────

export function generateToken(length = 48): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
