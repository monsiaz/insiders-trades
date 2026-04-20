/**
 * scripts/seed-user.ts
 * Creates the initial admin user and imports their PEA positions.
 *
 * The password is NEVER committed. Pass it via CLI or env:
 *   npx tsx scripts/seed-user.ts "<password>"
 *   ADMIN_PASSWORD="<password>" npx tsx scripts/seed-user.ts
 */

import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

const EMAIL = "simon.azoulay.pro@gmail.com";
const PASSWORD = (process.argv[2] || process.env.ADMIN_PASSWORD || "").trim();
const NAME = "Simon";

if (!PASSWORD || PASSWORD.length < 8) {
  console.error(
    "❌  Password required (>= 8 chars). Usage:\n" +
      '    npx tsx scripts/seed-user.ts "<password>"\n' +
      '    ADMIN_PASSWORD="<password>" npx tsx scripts/seed-user.ts'
  );
  process.exit(1);
}

// Positions from the exported CSV (converted to proper number format)
const POSITIONS = [
  { name: "CAP IMMO 514 BAUER",  isin: "QS0003999685", quantity: 5,    buyingPrice: 1000.00 },
  { name: "NANOBIOTIX",          isin: "FR0011341205", quantity: 114,   buyingPrice: 3.54 },
  { name: "FIGEAC AERO",         isin: "FR0011665280", quantity: 179,   buyingPrice: 8.45 },
  { name: "WAGA ENERGY",         isin: "FR0012532810", quantity: 66,    buyingPrice: 17.40 },
  { name: "GENFIT",              isin: "FR0004163111", quantity: 150,   buyingPrice: 3.84 },
  { name: "ID LOGISTICS",        isin: "FR0010929125", quantity: 2,     buyingPrice: 348.61 },
  { name: "OVHCLOUD",            isin: "FR0014005HJ9", quantity: 60,    buyingPrice: 9.50 },
  { name: "VUSION",              isin: "FR0010282822", quantity: 5,     buyingPrice: 191.74 },
  { name: "SOLUTIONS 30",        isin: "FR0013379484", quantity: 600,   buyingPrice: 1.11 },
  { name: "EXAIL TECHNOLOGIES",  isin: "FR0000062671", quantity: 3,     buyingPrice: 130.56 },
];

async function main() {
  console.log("🔐 Creating user account...");

  let user = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (user) {
    console.log(`  User already exists: ${EMAIL} (id: ${user.id})`);
    // Update password just in case
    const hashed = await bcrypt.hash(PASSWORD, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, emailVerified: new Date() } });
    console.log("  Password updated.");
  } else {
    const hashed = await bcrypt.hash(PASSWORD, 12);
    user = await prisma.user.create({
      data: {
        email: EMAIL,
        name: NAME,
        password: hashed,
        emailVerified: new Date(), // pre-verified
        role: "admin",
      },
    });
    console.log(`  ✓ User created: ${user.email} (id: ${user.id})`);
  }

  console.log("\n📊 Importing PEA positions...");

  // Delete existing positions to avoid duplicates
  const deleted = await prisma.portfolioPosition.deleteMany({ where: { userId: user.id } });
  if (deleted.count > 0) console.log(`  Removed ${deleted.count} existing positions`);

  for (const pos of POSITIONS) {
    const totalInvested = pos.quantity * pos.buyingPrice;
    await prisma.portfolioPosition.create({
      data: {
        userId: user.id,
        name: pos.name,
        isin: pos.isin,
        quantity: pos.quantity,
        buyingPrice: pos.buyingPrice,
        totalInvested,
      },
    });
    console.log(`  ✓ ${pos.name.padEnd(25)} ${pos.quantity}x @ ${pos.buyingPrice}€ = ${totalInvested.toFixed(0)}€`);
  }

  const total = POSITIONS.reduce((s, p) => s + p.quantity * p.buyingPrice, 0);
  console.log(`\n  Total investi : ${total.toFixed(0)}€`);

  console.log("\n✅ Done! Login email:", EMAIL);
  console.log(`  URL      : https://insiders-trades-sigma.vercel.app/auth/login`);
  console.log("  (password was set from your input — not printed for safety)");

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
