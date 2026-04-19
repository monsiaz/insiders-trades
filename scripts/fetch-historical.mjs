/**
 * Fetch all 15,538 historical declarations (pre-April 2024) from AMF
 * Uses DateFin + From pagination (10K max per query window)
 */
import { PrismaClient } from "@prisma/client";
import slugify from "slugify";

const prisma = new PrismaClient({ log: ["error"] });
const AMF_URL = "https://bdif.amf-france.org/back/api/v1/informations";

function makeSlug(name, suffix) {
  const base = slugify(name, { lower: true, strict: true }).substring(0, 60);
  return base ? `${base}-${suffix}` : `company-${suffix}`;
}

// Fetch with DateFin + From for pagination through pre-2024 data
async function fetchHistorical(dateFin, from = 0, size = 1000, dateDebut = null) {
  const url = new URL(AMF_URL);
  url.searchParams.set("TypesDocument", "DeclarationDirigeants");
  url.searchParams.set("DateFin", new Date(dateFin).toISOString());
  if (dateDebut) url.searchParams.set("DateDebut", new Date(dateDebut).toISOString());
  url.searchParams.set("Sort", "-datePublication");
  url.searchParams.set("From", String(from));
  url.searchParams.set("Size", String(size));

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`AMF ${res.status}: ${url.toString()}`);
  const data = await res.json();
  const result = data.result;
  return {
    items: Array.isArray(result) ? result : Object.values(result || {}),
    total: data.total ?? 0,
  };
}

async function main() {
  console.log("🚀 Fetching historical declarations (pre-April 2024)");

  // Load existing companies into memory
  console.log("📦 Loading companies from DB...");
  const allCompanies = await prisma.company.findMany({ select: { id: true, amfToken: true } });
  const tokenToId = new Map(allCompanies.map((c) => [c.amfToken, c.id]));
  console.log(`   ${tokenToId.size} companies loaded`);

  // Load existing declaration IDs to avoid duplicates
  console.log("📋 Loading existing declaration IDs...");
  const existingIds = new Set(
    (await prisma.declaration.findMany({ select: { amfId: true } })).map((d) => d.amfId)
  );
  console.log(`   ${existingIds.size} existing declarations`);

  const CUTOFF = "2024-04-15T00:00:00.000Z";
  const PAGE_SIZE = 1000;

  let totalFetched = 0;
  let totalInserted = 0;
  let newCompanies = 0;
  let from = 0;
  let hasMore = true;

  // We split into date windows to handle 10K limit per window
  // Window 1: before 2024-04-15 (up to 10K → covers ~2022+)
  // Window 2: before 2022-01-01 (for data before 2022)
  const windows = [
    { dateDebut: "2023-01-01T00:00:00.000Z", dateFin: "2024-04-15T00:00:00.000Z", label: "2023–2024" },
    { dateDebut: "2022-01-01T00:00:00.000Z", dateFin: "2023-01-01T00:00:00.000Z", label: "2022" },
    { dateDebut: "2019-01-01T00:00:00.000Z", dateFin: "2022-01-01T00:00:00.000Z", label: "2019–2021" },
    { dateFin: "2019-01-01T00:00:00.000Z", label: "2017–2018" },
  ];

  for (const window of windows) {
    console.log(`\n🗓️  Window: pre-${window.label}`);
    from = 0;
    hasMore = true;

    while (hasMore) {
      try {
        const { items, total } = await fetchHistorical(window.dateFin, from, PAGE_SIZE, window.dateDebut);

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        totalFetched += items.length;

        // Extract new companies
        const newCompanyRows = [];
        for (const item of items) {
          for (const soc of item.societes || []) {
            if (soc.jeton && soc.raisonSociale && !tokenToId.has(soc.jeton)) {
              const name = soc.raisonSociale.toUpperCase().trim();
              const suffix = soc.jeton.replace("RS", "").replace(/^0+/, "");
              newCompanyRows.push({ name, slug: makeSlug(name, suffix), amfToken: soc.jeton });
              tokenToId.set(soc.jeton, null); // placeholder
            }
          }
        }

        // Insert new companies
        if (newCompanyRows.length > 0) {
          const result = await prisma.company.createMany({ data: newCompanyRows, skipDuplicates: true });
          newCompanies += result.count;
          // Reload to get IDs
          const created = await prisma.company.findMany({
            where: { amfToken: { in: newCompanyRows.map((r) => r.amfToken) } },
            select: { id: true, amfToken: true },
          });
          for (const c of created) tokenToId.set(c.amfToken, c.id);
        }

        // Prepare declaration rows
        const declRows = [];
        for (const item of items) {
          const amfId = String(item.numero ?? item.id ?? "");
          if (!amfId || existingIds.has(amfId)) continue;

          let companyId = null;
          for (const soc of item.societes || []) {
            const id = tokenToId.get(soc.jeton);
            if (id) { companyId = id; break; }
          }
          if (!companyId) continue;

          existingIds.add(amfId);
          const pubDate = item.datePublication ? new Date(item.datePublication) : new Date();
          const desc = (item.titre || amfId).substring(0, 500);

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

        // Bulk insert
        if (declRows.length > 0) {
          const r = await prisma.declaration.createMany({ data: declRows, skipDuplicates: true });
          totalInserted += r.count;
        }

        from += PAGE_SIZE;
        process.stdout.write(
          `\r   from=${from} | fetched=${totalFetched} | inserted=${totalInserted} | companies+${newCompanies}`
        );

        // If we got less than PAGE_SIZE or hit 10K limit, move to next window
        if (items.length < PAGE_SIZE || from >= 10000) {
          hasMore = false;
        } else {
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch (e) {
        console.error("\n   Error:", e.message);
        hasMore = false;
      }
    }
    console.log();
  }

  // Final stats
  const [totalDecl, totalComp] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.company.count(),
  ]);

  console.log(`\n✅ Historical import complete`);
  console.log(`   New declarations: ${totalInserted}`);
  console.log(`   New companies: ${newCompanies}`);
  console.log(`   Total in DB: ${totalDecl} declarations, ${totalComp} companies`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
