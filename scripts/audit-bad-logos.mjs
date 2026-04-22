import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const targets = ["teleperformance-3268", "wavestone-3563", "sidetrade-4219"];

console.log("=== Targeted companies ===\n");
for (const slug of targets) {
  const c = await p.company.findUnique({
    where: { slug },
    select: { name: true, slug: true, isin: true, yahooSymbol: true, logoUrl: true, logoSource: true },
  });
  if (!c) { console.log(`  ! NOT FOUND: ${slug}`); continue; }
  console.log(`  ${c.name}`);
  console.log(`    slug:        ${c.slug}`);
  console.log(`    ISIN:        ${c.isin ?? "—"}`);
  console.log(`    Yahoo:       ${c.yahooSymbol ?? "—"}`);
  console.log(`    logoUrl:     ${c.logoUrl ?? "—"}`);
  console.log(`    logoSource:  ${c.logoSource ?? "—"}`);
  console.log();
}

// Find all companies with suspicious-looking logo sources (google_favicon, og_image, photo-heavy)
console.log("\n=== Companies with suspicious logo sources ===\n");
const suspicious = await p.company.findMany({
  where: {
    logoUrl: { not: null },
    OR: [
      { logoSource: "google_favicon" },
      { logoSource: "og_image" },
      { logoSource: null },
    ],
  },
  select: { name: true, slug: true, logoUrl: true, logoSource: true },
  orderBy: { name: "asc" },
  take: 20,
});

for (const c of suspicious) {
  console.log(`  ${c.name.padEnd(36)} source=${c.logoSource?.padEnd(18) ?? "null"} url=${c.logoUrl?.slice(0, 80)}`);
}

// Overall stats by source
console.log("\n=== Logo source distribution ===\n");
const stats = await p.company.groupBy({
  by: ["logoSource"],
  where: { logoUrl: { not: null } },
  _count: { _all: true },
  orderBy: { _count: { logoSource: "desc" } },
});
for (const s of stats) {
  console.log(`  ${(s.logoSource ?? "null").padEnd(20)} ${s._count._all}`);
}
const nullLogo = await p.company.count({ where: { logoUrl: null } });
console.log(`  (no logo at all)    ${nullLogo}`);

await p.$disconnect();
