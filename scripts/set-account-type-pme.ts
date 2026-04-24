/**
 * Set accountType = PEA_PME on all existing users (default).
 * The schema has a default PEA_PME but existing users were created before
 * the column existed, so their value is null. Backfill here.
 */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const res = await p.user.updateMany({
    where: { accountType: null },
    data: { accountType: "PEA_PME" },
  });
  console.log(`Updated ${res.count} users to accountType = PEA_PME`);
  await p.$disconnect();
})();
