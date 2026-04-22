/**
 * API key generation, hashing, validation.
 *
 * Format:   sit_live_<32 chars base62>
 * Prefix:   first 12 chars (sit_live_XXX) — safe to display
 * Storage:  sha256(plaintext) hex in DB
 */

import crypto from "crypto";
import { prisma } from "./prisma";

const KEY_LEN = 32;
const KEY_PREFIX = "sit_live_";

/** Generate a new plaintext API key. Never stored — only returned once. */
export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
  // crypto.randomBytes -> base64url -> strip "=" and take KEY_LEN chars
  const raw = crypto
    .randomBytes(48)
    .toString("base64url")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, KEY_LEN);
  const plaintext = `${KEY_PREFIX}${raw}`;
  const prefix = plaintext.slice(0, KEY_PREFIX.length + 4); // e.g. "sit_live_Ab1C"
  const hash = hashApiKey(plaintext);
  return { plaintext, prefix, hash };
}

/** Deterministically hash a plaintext key for DB lookup / comparison. */
export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/** Rough validation — the key *looks* like one we'd issue. */
export function isApiKeyShape(s: string | null | undefined): boolean {
  return !!s && s.startsWith(KEY_PREFIX) && s.length >= KEY_PREFIX.length + 20;
}

// ── DB-backed operations ─────────────────────────────────────────────────────

export async function createApiKey(params: {
  userId: string;
  name: string;
  scopes?: string;
}): Promise<{ key: string; record: Awaited<ReturnType<typeof prisma.apiKey.create>> }> {
  const { plaintext, prefix, hash } = generateApiKey();
  const record = await prisma.apiKey.create({
    data: {
      userId: params.userId,
      name: params.name.trim().slice(0, 100) || "Unnamed key",
      prefix,
      keyHash: hash,
      scopes: params.scopes ?? "read",
    },
  });
  return { key: plaintext, record };
}

export async function revokeApiKey(id: string, reason = "manual"): Promise<boolean> {
  try {
    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason.slice(0, 255) },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a plaintext API key to its DB record (only if not revoked).
 * Returns null if the key is invalid, unknown, or revoked.
 */
export async function resolveApiKey(plaintext: string) {
  if (!isApiKeyShape(plaintext)) return null;
  const hash = hashApiKey(plaintext);
  const rec = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: {
      id: true,
      userId: true,
      name: true,
      prefix: true,
      scopes: true,
      revokedAt: true,
      requestsToday: true,
      todayResetAt: true,
      totalRequests: true,
      user: {
        select: { id: true, email: true, role: true, isBanned: true, firstName: true, lastName: true },
      },
    },
  });
  if (!rec) return null;
  if (rec.revokedAt) return null;
  if (rec.user.isBanned) return null;
  return rec;
}

/**
 * Increment usage counters on a key. Called after successful auth.
 * Rolls the `requestsToday` counter at midnight UTC.
 */
export async function bumpKeyUsage(
  id: string,
  requestsToday: number,
  todayResetAt: Date,
  meta: { ip?: string | null; ua?: string | null } = {}
): Promise<void> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const resetTodayCounter = todayResetAt.getTime() < todayStart.getTime();

  try {
    await prisma.apiKey.update({
      where: { id },
      data: {
        lastUsedAt: now,
        lastUsedIp: (meta.ip ?? "").slice(0, 64) || null,
        lastUserAgent: (meta.ua ?? "").slice(0, 255) || null,
        totalRequests: { increment: 1 },
        requestsToday: resetTodayCounter ? 1 : { increment: 1 },
        todayResetAt: resetTodayCounter ? now : undefined,
      },
    });
  } catch {
    // non-fatal; never block the request on counter write failure
  }
}
