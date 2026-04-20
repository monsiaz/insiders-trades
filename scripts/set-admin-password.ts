/**
 * scripts/set-admin-password.ts
 *
 * One-off utility to (re)set the password for the admin beta account.
 * The password is NEVER hardcoded in source — it is read from argv[2]
 * or from the ADMIN_PASSWORD env var. The database only ever stores
 * the bcrypt hash.
 *
 * Usage:
 *   npx tsx scripts/set-admin-password.ts "<password>"
 *   ADMIN_PASSWORD="<password>" npx tsx scripts/set-admin-password.ts
 *
 * What it does:
 *   • Creates the admin user if missing (email + firstName + name)
 *   • Sets password to bcrypt(password, 12)
 *   • Ensures role="admin", isBanned=false, emailVerified=now()
 *   • Clears any pending reset/verify tokens
 */
import "dotenv/config";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Load .env.local too (not picked up by dotenv/config)
try {
  for (const line of fs.readFileSync(".env.local", "utf-8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {}

const ADMIN_EMAIL = "simon.azoulay.pro@gmail.com";

const password = (process.argv[2] || process.env.ADMIN_PASSWORD || "").trim();
if (!password) {
  console.error(
    "❌  Password required. Usage:\n" +
      '    npx tsx scripts/set-admin-password.ts "<password>"\n' +
      '    ADMIN_PASSWORD="<password>" npx tsx scripts/set-admin-password.ts\n'
  );
  process.exit(1);
}
if (password.length < 8) {
  console.error("❌  Password must be at least 8 characters");
  process.exit(1);
}

const prisma = new PrismaClient();

(async () => {
  const hash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: {
        password: hash,
        role: "admin",
        isBanned: false,
        bannedAt: null,
        bannedReason: null,
        emailVerified: new Date(),
        verifyToken: null,
        resetToken: null,
        resetTokenExp: null,
      },
    });
    console.log(`✅  Password reset for ${ADMIN_EMAIL} (id=${existing.id})`);
  } else {
    const created = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        password: hash,
        firstName: "Simon",
        lastName: "Azoulay",
        name: "Simon Azoulay",
        role: "admin",
        emailVerified: new Date(),
      },
    });
    console.log(`✅  Admin created: ${ADMIN_EMAIL} (id=${created.id})`);
  }

  // Scrub the password from argv just in case — defensive, won't survive
  // process-level snapshots but makes accidental logging less likely.
  if (typeof process.argv[2] === "string") process.argv[2] = "***";

  await prisma.$disconnect();
})().catch(async (err) => {
  console.error("❌  Error:", err);
  await prisma.$disconnect();
  process.exit(1);
});
