import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const [
  total, dirigeants,
  parsed, unparsed,
  withName, withFn, withInstr, withAmount, withPrice, withQty, withDate, withIsin,
  oldest, newest,
  functions, natures, insiderFns,
] = await Promise.all([
  p.declaration.count(),
  p.declaration.count({ where: { type: "DIRIGEANTS" } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: null } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", insiderName: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", insiderFunction: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", instrumentType: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", totalAmount: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", unitPrice: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", volume: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", transactionDate: { not: null } } }),
  p.declaration.count({ where: { type: "DIRIGEANTS", isin: { not: null } } }),
  p.declaration.findMany({ where: { type: "DIRIGEANTS" }, select: { pubDate: true }, orderBy: { pubDate: "asc" }, take: 1 }),
  p.declaration.findMany({ where: { type: "DIRIGEANTS" }, select: { pubDate: true }, orderBy: { pubDate: "desc" }, take: 1 }),
  p.declaration.groupBy({ by: ["insiderFunction"], where: { type: "DIRIGEANTS", insiderFunction: { not: null } }, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 40 }),
  p.declaration.groupBy({ by: ["transactionNature"], where: { type: "DIRIGEANTS" }, _count: { id: true }, orderBy: { _count: { id: "desc" } }, take: 20 }),
  // Also check a sample of unparsed declarations to understand why
  p.declaration.findMany({ where: { type: "DIRIGEANTS", transactionNature: null }, select: { amfId: true, pdfUrl: true, description: true }, take: 5 }),
]);

const pct = (n) => ((n / dirigeants) * 100).toFixed(1) + "%";

console.log("=== COVERAGE ===");
console.log("Total declarations:", total);
console.log("Type DIRIGEANTS:", dirigeants);
console.log("");
console.log("=== PARSING STATUS ===");
console.log("PDF parsed (has transactionNature):", parsed, `(${pct(parsed)})`);
console.log("NOT parsed (null nature):", unparsed, `(${pct(unparsed)})`);
console.log("");
console.log("=== FIELD POPULATION ===");
console.log("insiderName:    ", withName, `(${pct(withName)})`);
console.log("insiderFunction:", withFn,   `(${pct(withFn)})`);
console.log("instrumentName: ", withInstr,`(${pct(withInstr)})`);
console.log("totalAmount:    ", withAmount,`(${pct(withAmount)})`);
console.log("unitPrice:      ", withPrice, `(${pct(withPrice)})`);
console.log("quantity:       ", withQty,  `(${pct(withQty)})`);
console.log("transactionDate:", withDate,  `(${pct(withDate)})`);
console.log("isin:           ", withIsin,  `(${pct(withIsin)})`);
console.log("");
console.log("=== DATE RANGE ===");
console.log("Oldest:", oldest[0]?.pubDate?.toISOString().slice(0, 10));
console.log("Newest:", newest[0]?.pubDate?.toISOString().slice(0, 10));
console.log("");
console.log("=== INSIDER FUNCTIONS (top 40) ===");
functions.forEach(f => console.log(`  ${f._count.id.toString().padStart(5)} | ${f.insiderFunction}`));
console.log("");
console.log("=== TRANSACTION NATURES ===");
natures.forEach(n => console.log(`  ${n._count.id.toString().padStart(5)} | ${n.transactionNature ?? "null"}`));
console.log("");
console.log("=== SAMPLE UNPARSED ===");
insiderFns.forEach(d => console.log("  AMF:", d.amfId, "| PDF:", d.pdfUrl ? "yes" : "no", "| Title:", d.title?.slice(0, 80)));

await p.$disconnect();
