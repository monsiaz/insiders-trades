/**
 * Fast reimport: AMF → Neon DB
 * Preloads all companies in memory, bulk-inserts declarations
 */
import { PrismaClient } from "@prisma/client";
import slugify from "slugify";

const prisma = new PrismaClient({ log: ["error"] });
const AMF_URL = "https://bdif.amf-france.org/back/api/v1/informations";

function makeSlug(name, suffix) {
  const base = slugify(name, { lower: true, strict: true }).substring(0, 60);
  return base ? `${base}-${suffix}` : `company-${suffix}`;
}

async function fetchAmfBatch(size = 10000) {
  const url = new URL(AMF_URL);
  url.searchParams.set("typesDocument", "DeclarationDirigeants");
  url.searchParams.set("sort", "-datePublication");
  url.searchParams.set("size", String(size));
  url.searchParams.set("lang", "fr");
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`AMF ${res.status}`);
  const data = await res.json();
  return Object.values(data.result || data || {});
}

async function main() {
  console.log("🚀 Reimport All — AMF → Neon DB");
  const t0 = Date.now();

  // ─── Fetch from AMF ────────────────────────────────────────────────────────
  console.log("📡 Fetching from AMF...");
  const items = await fetchAmfBatch(10000);
  console.log(`   Got ${items.length} items`);

  // ─── Extract all unique companies ──────────────────────────────────────────
  const companiesMap = new Map(); // token → name
  for (const item of items) {
    for (const soc of item.societes || []) {
      if (soc.jeton && soc.raisonSociale && !companiesMap.has(soc.jeton)) {
        companiesMap.set(soc.jeton, soc.raisonSociale.toUpperCase().trim());
      }
    }
  }
  console.log(`📦 ${companiesMap.size} unique companies`);

  // ─── Upsert companies in bulk ──────────────────────────────────────────────
  const companyRows = [...companiesMap.entries()].map(([token, name]) => ({
    name, slug: makeSlug(name, token.replace("RS", "").replace(/^0+/, "")), amfToken: token,
  }));
  
  // Insert in batches of 100
  let compInserted = 0;
  for (let i = 0; i < companyRows.length; i += 100) {
    const batch = companyRows.slice(i, i + 100);
    // Use createMany with skipDuplicates
    const r = await prisma.company.createMany({ data: batch, skipDuplicates: true });
    compInserted += r.count;
    process.stdout.write(`\r   Companies: ${i + batch.length}/${companyRows.length} (${compInserted} new)`);
  }
  console.log();

  // ─── Load all companies into memory (token → id) ───────────────────────────
  const allCompanies = await prisma.company.findMany({ select: { id: true, amfToken: true } });
  const tokenToId = new Map(allCompanies.map(c => [c.amfToken, c.id]));
  console.log(`   ${tokenToId.size} companies in DB`);

  // ─── Prepare declaration rows ──────────────────────────────────────────────
  const declRows = [];
  for (const item of items) {
    const amfId = String(item.numero ?? item.id ?? "");
    if (!amfId) continue;

    // Find company from societes
    let companyId = null;
    for (const soc of item.societes || []) {
      const id = tokenToId.get(soc.jeton);
      if (id) { companyId = id; break; }
    }
    if (!companyId) continue;

    const pubDate = item.datePublication ? new Date(item.datePublication) : new Date();
    const desc = (item.titre || item.description || amfId).substring(0, 500);

    declRows.push({
      amfId,
      companyId,
      type: "DIRIGEANTS",
      link: `https://bdif.amf-france.org/Docs-Publics/DOC-${amfId}.pdf`,
      description: desc,
      pubDate,
      pdfParsed: false,
    });
  }
  console.log(`📋 ${declRows.length} declarations to insert`);

  // ─── Insert declarations in bulk ───────────────────────────────────────────
  let declInserted = 0;
  for (let i = 0; i < declRows.length; i += 200) {
    const batch = declRows.slice(i, i + 200);
    const r = await prisma.declaration.createMany({ data: batch, skipDuplicates: true });
    declInserted += r.count;
    process.stdout.write(`\r   Declarations: ${i + batch.length}/${declRows.length} (${declInserted} new)`);
  }
  console.log();

  // ─── Final stats ────────────────────────────────────────────────────────────
  const [totalDecl, totalComp] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.company.count(),
  ]);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Done in ${elapsed}s`);
  console.log(`   Declarations in DB: ${totalDecl}`);
  console.log(`   Companies in DB:    ${totalComp}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
