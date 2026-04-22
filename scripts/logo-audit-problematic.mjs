/**
 * Audit précis : fetch + render check sur les 3 sociétés signalées +
 * une liste étendue de logos suspects (même taille bit-à-bit, logos génériques,
 * sources "google_favicon", etc.).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// Companies the user specifically reported
const reported = ["teleperformance-3268", "wavestone-3563", "sidetrade-4219"];

const cos = await p.company.findMany({
  where: {
    OR: [
      { slug: { in: reported } },
    ],
  },
  select: {
    name: true, slug: true, yahooSymbol: true, isin: true,
    logoUrl: true, logoSource: true,
  },
});

console.log("=== Sociétés signalées ===\n");
for (const c of cos) {
  console.log(`${c.name}  (${c.slug})`);
  console.log(`  ticker : ${c.yahooSymbol ?? "—"}`);
  console.log(`  isin   : ${c.isin ?? "—"}`);
  console.log(`  logo   : ${c.logoUrl ?? "AUCUN"}`);
  console.log(`  source : ${c.logoSource ?? "—"}`);
  if (c.logoUrl) {
    try {
      const t0 = Date.now();
      const res = await fetch(c.logoUrl, { signal: AbortSignal.timeout(6000) });
      const ms = Date.now() - t0;
      const buf = res.ok ? await res.arrayBuffer() : null;
      console.log(`  fetch  : HTTP ${res.status} · ${buf ? buf.byteLength.toLocaleString("fr-FR") : "—"} bytes · ${ms}ms · ${res.headers.get("content-type") ?? ""}`);
    } catch (e) {
      console.log(`  fetch  : ERREUR ${e.message}`);
    }
  }
  console.log();
}

// Global audit: total by source
console.log("=== Distribution par source logo ===");
const bySource = await p.company.groupBy({
  by: ["logoSource"],
  _count: { _all: true },
  orderBy: { _count: { _all: "desc" } },
});
for (const s of bySource) {
  console.log(`  ${(s.logoSource ?? "NULL").padEnd(28)} ${s._count._all}`);
}

// Companies with logos that are probably bad (google_favicon, very small files, etc.)
const suspects = await p.company.findMany({
  where: {
    OR: [
      { logoSource: "google_favicon" },
      { logoSource: null },
      { logoUrl: null },
    ],
    declarations: { some: { type: "DIRIGEANTS" } }, // only active companies
  },
  select: { slug: true, name: true, logoSource: true, logoUrl: true, yahooSymbol: true, isin: true },
  take: 50,
  orderBy: { name: "asc" },
});
console.log(`\n=== Suspects à re-fetch (${suspects.length} premiers) ===`);
for (const s of suspects.slice(0, 20)) {
  console.log(`  ${s.slug.padEnd(40)} ${(s.logoSource ?? "∅").padEnd(18)} ${s.yahooSymbol ?? "—"}`);
}

await p.$disconnect();
