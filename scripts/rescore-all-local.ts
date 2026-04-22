/**
 * Run scoreDeclarations(force=true) locally — no Vercel timeout.
 */
import "dotenv/config";
import { scoreDeclarations } from "../src/lib/signals";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Running scoreDeclarations(force=true)…");
  const t0 = Date.now();
  await scoreDeclarations(true, 500);
  console.log("done in", ((Date.now() - t0) / 1000).toFixed(1), "s");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
