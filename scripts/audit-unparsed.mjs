import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const [sample, hasPdf, noPdf, hasLink] = await Promise.all([
  p.declaration.findFirst({
    where: { type: "DIRIGEANTS", transactionNature: null },
    select: { amfId: true, pdfUrl: true, link: true, description: true, isin: true, insiderName: true }
  }),
  p.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: null, pdfUrl: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: null, pdfUrl: null } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: null, link: { not: null } } }),
]);

console.log("Sample unparsed decl:");
console.log(JSON.stringify(sample, null, 2));
console.log("\nHas pdfUrl (parseable):", hasPdf);
console.log("NO pdfUrl (need to fetch):", noPdf);
console.log("Has AMF link:", hasLink);

// Check distribution of pdfParsed flag
const [flagTrue, flagFalse] = await Promise.all([
  p.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: false } }),
]);
console.log("\npdfParsed=true:", flagTrue);
console.log("pdfParsed=false:", flagFalse);

// Sample with pdfUrl but not parsed
const sample2 = await p.declaration.findFirst({
  where: { type: "DIRIGEANTS", transactionNature: null, pdfUrl: { not: null } },
  select: { amfId: true, pdfUrl: true, pdfParsed: true }
});
console.log("\nSample with pdfUrl but no nature:", JSON.stringify(sample2, null, 2));

// How many have isin but no transactionNature (RSS-only)?
const [withIsinUnparsed, withDescUnparsed] = await Promise.all([
  p.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: null, isin: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: null, description: { not: null, not: "" } } }),
]);
console.log("\nWith ISIN but unparsed:", withIsinUnparsed);
console.log("With description but unparsed:", withDescUnparsed);

// Year breakdown
console.log("\n=== UNPARSED BY YEAR ===");
const byYear = {};
const unparsedAll = await p.declaration.findMany({
  where: { type: "DIRIGEANTS", transactionNature: null },
  select: { pubDate: true }
});
unparsedAll.forEach(d => {
  const y = d.pubDate.getFullYear();
  byYear[y] = (byYear[y] || 0) + 1;
});
Object.entries(byYear).sort(([a],[b]) => b-a).forEach(([y, n]) => console.log(`  ${y}: ${n}`));

await p.$disconnect();
