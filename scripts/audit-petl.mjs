// Investigate the "PERSONNE ETROITEMENT LIEE" insider name bug
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const samples = await p.declaration.findMany({
  where: {
    type: "DIRIGEANTS",
    insiderName: { startsWith: "PERSONNE ETROITEMENT LIEE" },
  },
  orderBy: { pubDate: "desc" },
  take: 10,
  select: {
    amfId: true, pubDate: true, link: true, insiderName: true, insiderFunction: true,
    totalAmount: true, transactionNature: true,
    company: { select: { name: true, slug: true } },
  },
});

console.log("\n=== Sample of 'PERSONNE ETROITEMENT LIEE' insiderName rows ===\n");
samples.forEach((s, i) => {
  console.log(`[${i + 1}] ${s.company.name}  (${s.pubDate.toISOString().slice(0, 10)})`);
  console.log(`     amfId            : ${s.amfId}`);
  console.log(`     insiderName      : "${s.insiderName}"`);
  console.log(`     insiderFunction  : "${s.insiderFunction ?? "∅"}"`);
  console.log(`     transactionNature: "${s.transactionNature ?? "∅"}"`);
  console.log(`     totalAmount      : ${s.totalAmount}`);
  console.log(`     link             : ${s.link}`);
  console.log();
});

console.log("═══════════════════════════════════════════════════════════════");
console.log("Now testing the parser against one of these PDFs…");
console.log("═══════════════════════════════════════════════════════════════");

// Try to re-fetch and parse one of these
const { parsePdfText, debugParse } = await import("../src/lib/pdf-parser.ts");
const { pdf } = await import("pdf-parse");

const s = samples[0];
try {
  // The link is the AMF detail page · we'd need to extract the PDF URL from it
  // For now, just show what the parser would do on a snippet
  console.log("\nSample link:", s.link);
  console.log("(fetch of AMF detail page would be needed to get the PDF URL)");
} catch (e) {
  console.log("Error:", e.message);
}

await p.$disconnect();
