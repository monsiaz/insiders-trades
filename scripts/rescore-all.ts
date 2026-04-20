/**
 * scripts/rescore-all.ts — force re-score all declarations with the new
 * composite signal engine. Runs locally (no function-timeout limit).
 */
import { PrismaClient } from "@prisma/client";
import { scoreDeclarations } from "../src/lib/signals";

const prisma = new PrismaClient();
(async () => {
  await scoreDeclarations(true, 500);
  await prisma.$disconnect();
})();
