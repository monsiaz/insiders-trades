/**
 * scripts/seed-insiders.mjs
 *
 * Populates the Insider table from declaration insiderName values,
 * creates CompanyInsider links, and backfills Declaration.insiderId.
 *
 * Run: node scripts/seed-insiders.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function main() {
  console.log("🔍 Loading declarations with insiderName...");

  // Get all declarations that have an insiderName
  const declarations = await prisma.declaration.findMany({
    where: { insiderName: { not: null } },
    select: {
      id: true,
      insiderName: true,
      insiderFunction: true,
      companyId: true,
      insiderId: true,
    },
    orderBy: { pubDate: "asc" },
  });

  console.log(`   ${declarations.length} declarations with insiderName`);

  // Build unique insider names
  const nameSet = new Map(); // normalizedName → { name, count }
  for (const d of declarations) {
    const raw = d.insiderName.trim();
    const norm = raw.toLowerCase().replace(/\s+/g, " ");
    if (!nameSet.has(norm)) {
      nameSet.set(norm, { name: raw, count: 1 });
    } else {
      nameSet.get(norm).count++;
    }
  }

  console.log(`   ${nameSet.size} unique insiders to create`);

  // Create or find Insider records
  const slugUsed = new Set();
  const insiderMap = new Map(); // normalizedName → insiderId

  let created = 0;
  let skipped = 0;

  const insiderEntries = [...nameSet.entries()];

  // Batch upserts in chunks of 100
  for (let i = 0; i < insiderEntries.length; i += 100) {
    const chunk = insiderEntries.slice(i, i + 100);
    await Promise.all(
      chunk.map(async ([norm, { name }]) => {
        let base = slugify(name);
        if (!base) base = `insider-${Math.random().toString(36).slice(2, 8)}`;

        let slug = base;
        let attempt = 1;
        while (slugUsed.has(slug)) {
          slug = `${base}-${attempt++}`;
        }
        slugUsed.add(slug);

        try {
          const existing = await prisma.insider.findFirst({
            where: { name: { equals: name, mode: "insensitive" } },
          });
          if (existing) {
            insiderMap.set(norm, existing.id);
            skipped++;
          } else {
            const ins = await prisma.insider.create({
              data: { name, slug },
            });
            insiderMap.set(norm, ins.id);
            created++;
          }
        } catch (e) {
          // Slug collision fallback
          const fallback = `${base}-${Date.now() % 10000}`;
          const ins = await prisma.insider.create({
            data: { name, slug: fallback },
          });
          insiderMap.set(norm, ins.id);
          created++;
        }
      })
    );

    process.stdout.write(`\r   Creating insiders: ${Math.min(i + 100, insiderEntries.length)}/${insiderEntries.length}`);
  }

  console.log(`\n   Created: ${created} | Existing: ${skipped}`);

  // Backfill Declaration.insiderId
  console.log("\n🔗 Linking declarations to insiders...");
  let linked = 0;
  const batches = [];

  for (const d of declarations) {
    if (d.insiderId) continue; // already linked
    const norm = d.insiderName.trim().toLowerCase().replace(/\s+/g, " ");
    const insId = insiderMap.get(norm);
    if (!insId) continue;
    batches.push(prisma.declaration.update({
      where: { id: d.id },
      data: { insiderId: insId },
    }));
    linked++;
    if (batches.length >= 200) {
      await Promise.all(batches.splice(0));
      process.stdout.write(`\r   Linked: ${linked}`);
    }
  }
  if (batches.length) await Promise.all(batches);
  console.log(`\n   Linked: ${linked} declarations`);

  // Create CompanyInsider records
  console.log("\n🏢 Creating CompanyInsider links...");

  // Get unique (companyId, insiderId, function) combos
  const ciMap = new Map(); // `${companyId}::${insiderId}` → latestFunction
  for (const d of declarations) {
    const norm = d.insiderName.trim().toLowerCase().replace(/\s+/g, " ");
    const insId = insiderMap.get(norm);
    if (!insId || !d.companyId) continue;
    const key = `${d.companyId}::${insId}`;
    ciMap.set(key, { companyId: d.companyId, insiderId: insId, function: d.insiderFunction || null });
  }

  console.log(`   ${ciMap.size} company-insider pairs to upsert`);

  const ciEntries = [...ciMap.values()];
  let ciCreated = 0;
  for (let i = 0; i < ciEntries.length; i += 200) {
    const chunk = ciEntries.slice(i, i + 200);
    await Promise.all(
      chunk.map((ci) =>
        prisma.companyInsider.upsert({
          where: { companyId_insiderId: { companyId: ci.companyId, insiderId: ci.insiderId } },
          create: ci,
          update: { function: ci.function },
        }).catch(() => {}) // ignore constraint errors
      )
    );
    ciCreated += chunk.length;
    process.stdout.write(`\r   CompanyInsider: ${ciCreated}/${ciEntries.length}`);
  }

  // Final stats
  const [totalIns, totalCI, totalLinked] = await Promise.all([
    prisma.insider.count(),
    prisma.companyInsider.count(),
    prisma.declaration.count({ where: { insiderId: { not: null } } }),
  ]);

  console.log("\n\n✅ Done!");
  console.log(`   Insiders: ${totalIns}`);
  console.log(`   CompanyInsider links: ${totalCI}`);
  console.log(`   Declarations with insiderId: ${totalLinked}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
