#!/usr/bin/env node
/**
 * generate-entity-content.mjs
 *
 * Generates SEO descriptions + sector tags + related entities for every
 * Company and Insider in the database, using GPT-5.4-mini with web search
 * (OpenAI Responses API). Saves results directly to the DB via Prisma.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node scripts/generate-entity-content.mjs
 *   # Options:
 *   --key=sk-...           OpenAI API key
 *   --concurrency=100      Workers (default: 100)
 *   --type=companies       Only process companies
 *   --type=insiders        Only process insiders
 *   --force                Re-generate even if description already exists
 *   --dry-run              Print what would happen, no DB writes
 */

import { PrismaClient } from "@prisma/client";
import { fileURLToPath } from "url";
import path from "path";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Parse args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const hasFlag = (name) => args.includes(`--${name}`);

const OPENAI_KEY = getArg("key") ?? process.env.OPENAI_API_KEY ?? "";
const CONCURRENCY = parseInt(getArg("concurrency") ?? "100", 10);
const TYPE = getArg("type") ?? "all"; // "all" | "companies" | "insiders"
const FORCE = hasFlag("force");
const DRY_RUN = hasFlag("dry-run");
const MODEL = "gpt-5.4-mini";
const MODEL_FALLBACK = "gpt-4o-mini";

if (!OPENAI_KEY) {
  console.error("✗ Set OPENAI_API_KEY or pass --key=sk-...");
  process.exit(1);
}

const prisma = new PrismaClient();

// ── OpenAI Responses API call with web search ────────────────────────────────
async function callGPTWithSearch(prompt, useSearch = true) {
  const body = {
    model: MODEL,
    input: prompt,
    ...(useSearch ? { tools: [{ type: "web_search_preview" }] } : {}),
  };

  let res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify(body),
  });

  // Fallback to chat completions if Responses API not available
  if (!res.ok && res.status === 404) {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: MODEL_FALLBACK,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 300)}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json();

  // Extract text from Responses API output
  if (data.output) {
    const textItem = data.output.find((o) => o.type === "message");
    if (textItem?.content) {
      const textPart = Array.isArray(textItem.content)
        ? textItem.content.find((c) => c.type === "output_text")?.text
        : textItem.content;
      return typeof textPart === "string" ? textPart : JSON.stringify(textPart);
    }
  }
  // Fallback
  return data.output_text ?? JSON.stringify(data);
}

// ── Sector normalization ─────────────────────────────────────────────────────
const SECTORS_FR = [
  "Énergie", "Finance & Banque", "Immobilier", "Technologie", "Santé & Pharma",
  "Industrie", "Distribution & Commerce", "Agroalimentaire", "Médias & Communication",
  "Transport & Logistique", "Luxe & Mode", "Construction & BTP", "Défense & Aérospatial",
  "Services aux entreprises", "Chimie & Matériaux", "Eau & Environnement",
  "Tourisme & Hôtellerie", "Agriculture", "Assurance", "Autres",
];

const SECTOR_EN_MAP = {
  "Énergie": "Energy",
  "Finance & Banque": "Finance & Banking",
  "Immobilier": "Real Estate",
  "Technologie": "Technology",
  "Santé & Pharma": "Healthcare & Pharma",
  "Industrie": "Industry",
  "Distribution & Commerce": "Retail & Commerce",
  "Agroalimentaire": "Food & Agriculture",
  "Médias & Communication": "Media & Communication",
  "Transport & Logistique": "Transport & Logistics",
  "Luxe & Mode": "Luxury & Fashion",
  "Construction & BTP": "Construction",
  "Défense & Aérospatial": "Defense & Aerospace",
  "Services aux entreprises": "Business Services",
  "Chimie & Matériaux": "Chemicals & Materials",
  "Eau & Environnement": "Water & Environment",
  "Tourisme & Hôtellerie": "Tourism & Hospitality",
  "Agriculture": "Agriculture",
  "Assurance": "Insurance",
  "Autres": "Others",
};

// ── Generate company content ─────────────────────────────────────────────────
async function generateCompanyContent(company) {
  const prompt = `You are an expert financial analyst specializing in French listed companies.

Generate SEO content for the French company "${company.name}" (stock ticker/ISIN: ${company.isin ?? "unknown"}).

Use web search to find accurate, up-to-date information about this company.

Return a JSON object with exactly these fields:
{
  "sectorTag": "one of: ${SECTORS_FR.join(", ")}",
  "descriptionFr": "~450-word description in French covering: what the company does, its history/founding, main business lines, market position, key products/services, geographic presence, and any notable facts. Professional financial tone.",
  "descriptionEn": "~450-word description in English covering the same points. Professional financial tone."
}

Return ONLY valid JSON, no markdown, no code block.`;

  const raw = await callGPTWithSearch(prompt, true);

  // Extract JSON from response
  let parsed;
  try {
    // Try to find JSON in the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    throw new Error(`Bad JSON for ${company.name}: ${raw.slice(0, 200)}`);
  }

  return {
    sectorTag: parsed.sectorTag ?? "Autres",
    sectorTagEn: SECTOR_EN_MAP[parsed.sectorTag] ?? "Others",
    descriptionFr: parsed.descriptionFr ?? "",
    descriptionEn: parsed.descriptionEn ?? "",
  };
}

// ── Generate insider content ─────────────────────────────────────────────────
async function generateInsiderContent(insider, companies) {
  const companyNames = companies.map((c) => c.name).slice(0, 5).join(", ");

  const prompt = `You are an expert in French corporate governance and listed companies.

Generate SEO content for the French corporate executive: "${insider.name}"
Known roles/companies: ${companyNames || "unknown"}

Use web search to find accurate information about this person.

Return a JSON object with exactly these fields:
{
  "primaryRole": "their most notable current or recent role (e.g. 'Président-Directeur Général', 'Directeur Financier')",
  "descriptionFr": "~400-word description in French covering: their career background, main positions held, companies led, expertise, notable decisions or achievements. Professional tone.",
  "descriptionEn": "~400-word description in English covering the same. Professional tone."
}

Return ONLY valid JSON, no markdown, no code block.`;

  const raw = await callGPTWithSearch(prompt, true);

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    throw new Error(`Bad JSON for insider ${insider.name}: ${raw.slice(0, 200)}`);
  }

  return {
    primaryRole: parsed.primaryRole ?? "",
    descriptionFr: parsed.descriptionFr ?? "",
    descriptionEn: parsed.descriptionEn ?? "",
  };
}

// ── Find related entities ────────────────────────────────────────────────────
async function computeRelatedEntities(allCompanies, allInsiders) {
  console.log("\n▶ Computing related entities by sector…");

  // Group companies by sector
  const companiesBySector = {};
  for (const c of allCompanies) {
    const tag = c.sectorTag ?? "Autres";
    if (!companiesBySector[tag]) companiesBySector[tag] = [];
    companiesBySector[tag].push(c);
  }

  // For each company: find top-6 related companies (same sector, by decl count)
  const companyRelations = new Map(); // slug → { relatedCompanySlugs, relatedInsiderSlugs }
  for (const c of allCompanies) {
    const tag = c.sectorTag ?? "Autres";
    const sectorCompanies = (companiesBySector[tag] ?? [])
      .filter((x) => x.slug !== c.slug)
      .sort((a, b) => (b._count?.declarations ?? 0) - (a._count?.declarations ?? 0))
      .slice(0, 6)
      .map((x) => x.slug);

    // Related insiders = insiders who declared at this company or same-sector companies
    const companyInsiderSlugs = (c.insiders ?? [])
      .map((ci) => ci.insider?.slug)
      .filter(Boolean)
      .slice(0, 6);

    companyRelations.set(c.slug, {
      relatedCompanySlugs: sectorCompanies,
      relatedInsiderSlugs: companyInsiderSlugs,
    });
  }

  // For each insider: find top-6 related insiders (worked at same companies) and related companies
  const insiderRelations = new Map();
  const insiderCompanyMap = new Map(); // insiderSlug → set of companyIds
  for (const insider of allInsiders) {
    const companyIds = new Set((insider.companies ?? []).map((ci) => ci.companyId));
    insiderCompanyMap.set(insider.slug, companyIds);
  }

  for (const insider of allInsiders) {
    const myCompanyIds = insiderCompanyMap.get(insider.slug) ?? new Set();

    // Related insiders = insiders sharing the most companies
    const scores = [];
    for (const other of allInsiders) {
      if (other.slug === insider.slug) continue;
      const otherIds = insiderCompanyMap.get(other.slug) ?? new Set();
      let shared = 0;
      for (const id of myCompanyIds) { if (otherIds.has(id)) shared++; }
      if (shared > 0) scores.push({ slug: other.slug, shared });
    }
    scores.sort((a, b) => b.shared - a.shared);
    const relatedInsiderSlugs = scores.slice(0, 6).map((s) => s.slug);

    // Related companies = companies where this insider declared
    const relatedCompanySlugs = (insider.companies ?? [])
      .map((ci) => ci.company?.slug)
      .filter(Boolean)
      .slice(0, 6);

    insiderRelations.set(insider.slug, { relatedCompanySlugs, relatedInsiderSlugs });
  }

  return { companyRelations, insiderRelations };
}

// ── Pool runner ──────────────────────────────────────────────────────────────
async function runPool(tasks, concurrency) {
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`▶ Entity content generator`);
  console.log(`  Model:       ${MODEL} (fallback: ${MODEL_FALLBACK})`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Type:        ${TYPE}`);
  console.log(`  Force:       ${FORCE}`);
  console.log(`  Dry run:     ${DRY_RUN}`);
  console.log("");

  // ── Load all entities ────────────────────────────────────────────────────
  const allCompanies = await prisma.company.findMany({
    where: { declarations: { some: { type: "DIRIGEANTS" } } },
    select: {
      id: true, name: true, slug: true, isin: true, sectorTag: true,
      descriptionFr: true, descriptionGeneratedAt: true,
      insiders: {
        select: {
          companyId: true,
          insider: { select: { slug: true, name: true } },
        },
      },
      _count: { select: { declarations: true } },
    },
    orderBy: { declarations: { _count: "desc" } },
  });

  const allInsiders = await prisma.insider.findMany({
    where: { declarations: { some: { type: "DIRIGEANTS" } } },
    select: {
      id: true, name: true, slug: true,
      descriptionFr: true, descriptionGeneratedAt: true,
      companies: {
        select: {
          companyId: true,
          company: { select: { slug: true, name: true } },
        },
      },
    },
    orderBy: { declarations: { _count: "desc" } },
  });

  console.log(`  Companies: ${allCompanies.length}`);
  console.log(`  Insiders:  ${allInsiders.length}`);

  let done = 0;
  let errors = 0;

  // ── Process companies ────────────────────────────────────────────────────
  if (TYPE === "all" || TYPE === "companies") {
    const toProcess = FORCE
      ? allCompanies
      : allCompanies.filter((c) => !c.descriptionFr || !c.descriptionGeneratedAt);

    console.log(`\n▶ Companies to process: ${toProcess.length}`);
    done = 0;

    const tasks = toProcess.map((company) => async () => {
      try {
        const content = await generateCompanyContent(company);
        if (!DRY_RUN) {
          await prisma.company.update({
            where: { id: company.id },
            data: {
              ...content,
              descriptionGeneratedAt: new Date(),
            },
          });
        }
        done++;
        process.stdout.write(`\r  Companies: ${done}/${toProcess.length} done, ${errors} errors`);
      } catch (err) {
        errors++;
        process.stdout.write(`\r  Companies: ${done}/${toProcess.length} done, ${errors} errors`);
        if (process.env.DEBUG) console.error(`\n  Error on ${company.name}: ${err.message}`);
      }
    });

    await runPool(tasks, CONCURRENCY);
    console.log(`\n  ✓ Companies done: ${done} success, ${errors} errors`);
  }

  // ── Process insiders ─────────────────────────────────────────────────────
  if (TYPE === "all" || TYPE === "insiders") {
    const toProcess = FORCE
      ? allInsiders
      : allInsiders.filter((i) => !i.descriptionFr || !i.descriptionGeneratedAt);

    console.log(`\n▶ Insiders to process: ${toProcess.length}`);
    done = 0;
    errors = 0;

    const tasks = toProcess.map((insider) => async () => {
      try {
        const companies = (insider.companies ?? []).map((ci) => ci.company).filter(Boolean);
        const content = await generateInsiderContent(insider, companies);
        if (!DRY_RUN) {
          await prisma.insider.update({
            where: { id: insider.id },
            data: {
              ...content,
              descriptionGeneratedAt: new Date(),
            },
          });
        }
        done++;
        process.stdout.write(`\r  Insiders: ${done}/${toProcess.length} done, ${errors} errors`);
      } catch (err) {
        errors++;
        process.stdout.write(`\r  Insiders: ${done}/${toProcess.length} done, ${errors} errors`);
        if (process.env.DEBUG) console.error(`\n  Error on ${insider.name}: ${err.message}`);
      }
    });

    await runPool(tasks, CONCURRENCY);
    console.log(`\n  ✓ Insiders done: ${done} success, ${errors} errors`);
  }

  // ── Compute related entities ─────────────────────────────────────────────
  console.log("\n▶ Reloading updated data for relations…");
  const updatedCompanies = await prisma.company.findMany({
    where: { declarations: { some: { type: "DIRIGEANTS" } } },
    select: {
      id: true, slug: true, sectorTag: true,
      insiders: { select: { companyId: true, insider: { select: { slug: true } } } },
      _count: { select: { declarations: true } },
    },
  });

  const updatedInsiders = await prisma.insider.findMany({
    where: { declarations: { some: { type: "DIRIGEANTS" } } },
    select: {
      id: true, slug: true,
      companies: { select: { companyId: true, company: { select: { slug: true } } } },
    },
  });

  const { companyRelations, insiderRelations } = await computeRelatedEntities(
    updatedCompanies, updatedInsiders
  );

  // ── Save relations ───────────────────────────────────────────────────────
  if (!DRY_RUN) {
    console.log("\n▶ Saving related entity links…");
    let saved = 0;

    const companyTasks = updatedCompanies.map((c) => async () => {
      const rel = companyRelations.get(c.slug);
      if (!rel) return;
      await prisma.company.update({
        where: { id: c.id },
        data: rel,
      });
      saved++;
      process.stdout.write(`\r  Relations saved: ${saved}`);
    });
    await runPool(companyTasks, 50);

    const insiderTasks = updatedInsiders.map((i) => async () => {
      const rel = insiderRelations.get(i.slug);
      if (!rel) return;
      await prisma.insider.update({
        where: { id: i.id },
        data: rel,
      });
      saved++;
      process.stdout.write(`\r  Relations saved: ${saved}`);
    });
    await runPool(insiderTasks, 50);
    console.log(`\n  ✓ ${saved} entities updated with relations`);
  }

  await prisma.$disconnect();
  console.log("\n✓ Done!\n");
})();
