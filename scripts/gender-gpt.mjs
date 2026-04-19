/**
 * gender-gpt.mjs — Determine gender of unknown insiders using GPT-4o
 *
 * Sends batches of 50 (name + original function) to GPT-4o via bulk requests.
 * GPT responds with H / F / ? for each person.
 *
 * Usage: node scripts/gender-gpt.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error"] });

const OPENAI_KEY  = "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";
const MODEL       = "gpt-4o";
const BATCH_SIZE  = 50;
const CONCURRENCY = 200;

// ── Fetch unknown insiders ────────────────────────────────────────────────────

const insiders = await prisma.insider.findMany({
  where: { gender: null },
  select: {
    id: true,
    name: true,
    declarations: {
      select: { insiderName: true, insiderFunction: true },
      where: { insiderFunction: { not: null } },
      take: 5,
    },
  },
});

console.log(`\n🔍 ${insiders.length} insiders without gender\n`);

// Build items: { id, name, function }
const items = insiders.map(ins => {
  const fn  = ins.declarations[0]?.insiderFunction ?? "";
  const rawName = ins.declarations[0]?.insiderName ?? ins.name;
  return { id: ins.id, name: rawName, fn };
});

// ── GPT call for a batch of 50 ───────────────────────────────────────────────

const SYSTEM = `Tu es un expert en détermination de genre à partir de prénoms et titres de fonctions français.
On te donne une liste de personnes au format JSON.
Pour chaque personne, détermine si c'est un homme (H) ou une femme (F).
Appuie-toi sur :
 1. Le prénom (Marie, Sophie = F ; Jean, Pierre = H)
 2. La fonction : terminaisons féminines en français (Administratrice, Directrice, Présidente, Gérante, Représentante → F)
 3. En cas de doute, réponds "?"

Réponds UNIQUEMENT avec un objet JSON : {"results": [{"id": "...", "g": "H"|"F"|"?"}]}.
PAS de texte, PAS de markdown, PAS de commentaires. Uniquement le JSON brut.`;

async function classifyBatch(batch) {
  const payload = batch.map(({ id, name, fn }) => ({ id, name, fn }));

  const body = JSON.stringify({
    model: MODEL,
    temperature: 0,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user",   content: JSON.stringify(payload) },
    ],
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_KEY}`,
    },
    body,
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${txt}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  return (parsed.results ?? []);
}

// ── Split into batches ────────────────────────────────────────────────────────

const batches = [];
for (let i = 0; i < items.length; i += BATCH_SIZE) {
  batches.push(items.slice(i, i + BATCH_SIZE));
}
console.log(`📦 ${batches.length} batches of ${BATCH_SIZE} → ${CONCURRENCY} concurrent workers\n`);

// ── Run with concurrency ──────────────────────────────────────────────────────

const allResults = [];
let done = 0, failed = 0;

for (let i = 0; i < batches.length; i += CONCURRENCY) {
  const chunk = batches.slice(i, i + CONCURRENCY);
  const settled = await Promise.allSettled(chunk.map(classifyBatch));
  for (const r of settled) {
    if (r.status === "fulfilled") {
      allResults.push(...r.value);
    } else {
      failed++;
      console.error("Batch error:", r.reason?.message ?? r.reason);
    }
  }
  done += chunk.length;
  process.stdout.write(`\r  Batches: ${done}/${batches.length} | results: ${allResults.length} | errors: ${failed}   `);
}

console.log("\n");

// ── Update DB ─────────────────────────────────────────────────────────────────

let updated = 0, skipped = 0;
const genderMap = new Map(allResults.map(r => [r.id, r.g]));

for (const [id, g] of genderMap) {
  if (g === "H" || g === "F") {
    await prisma.insider.update({
      where: { id },
      data: { gender: g === "H" ? "M" : "F" },
    });
    updated++;
  } else {
    skipped++;
  }
}

// ── Final stats ───────────────────────────────────────────────────────────────

const [mCount, fCount, nullCount] = await Promise.all([
  prisma.insider.count({ where: { gender: "M" } }),
  prisma.insider.count({ where: { gender: "F" } }),
  prisma.insider.count({ where: { gender: null } }),
]);

console.log(`✅ Done`);
console.log(`   GPT classified: ${updated} updated · ${skipped} undecided (?)`);
console.log(`\nDB stats:`);
console.log(`   Hommes (M): ${mCount}`);
console.log(`   Femmes (F): ${fCount}`);
console.log(`   Inconnus:   ${nullCount}`);

await prisma.$disconnect();
