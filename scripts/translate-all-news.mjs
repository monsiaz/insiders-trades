#!/usr/bin/env node
/**
 * One-time bulk news translation script.
 *
 * For every company in the DB:
 *   1. Fetch FR news from Google News RSS
 *   2. Upsert items in CompanyNewsItem table
 *   3. Translate untranslated titles to EN via OpenAI (batch of 20)
 *
 * Usage:
 *   node scripts/translate-all-news.mjs
 *
 * Env required: DATABASE_URL, OPENAI_API_KEY
 */

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const WORKERS = 8;        // parallel company fetches
const CHUNK = 20;         // titles per OpenAI call
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124";

// ── Helpers ───────────────────────────────────────────────────────────────────

function linkHash(link) {
  return createHash("sha256").update(link).digest("hex").slice(0, 16);
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&hellip;/g, "…")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extract(field, block) {
  const cdata = new RegExp(`<${field}[^>]*><!\\[CDATA\\[(.*?)\\]\\]><\\/${field}>`, "s");
  const plain = new RegExp(`<${field}[^>]*>(.*?)<\\/${field}>`, "s");
  return block.match(cdata)?.[1]?.trim() ?? block.match(plain)?.[1]?.trim() ?? null;
}

function parseRss(xml) {
  const items = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    let title = extract("title", block);
    const link = extract("link", block);
    const pubDate = extract("pubDate", block);
    if (!title || !link || !pubDate) continue;
    title = decodeEntities(title);
    let publisher = extract("source", block) ?? extract("dc:creator", block);
    if (!publisher) {
      const i = title.lastIndexOf(" - ");
      if (i > 20 && i < title.length - 3) {
        const c = title.slice(i + 3).trim();
        if (c.length < 45 && !c.includes(":")) { publisher = c; title = title.slice(0, i).trim(); }
      }
    }
    let iso;
    try { iso = new Date(pubDate).toISOString(); } catch { continue; }
    items.push({ title, link, pubDate: iso, publisher: publisher ?? null });
  }
  return items;
}

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch { return []; }
}

async function translateTitles(titles) {
  if (!OPENAI_KEY || !titles.length) return titles;
  const numbered = titles.map((t, i) => `${i + 1}. ${t}`).join("\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: titles.length * 40,
      messages: [
        { role: "system", content: "Translate each French financial headline to concise English. Keep proper nouns, tickers, numbers. Respond ONLY with a JSON array of strings in the same order, no extra text." },
        { role: "user", content: numbered },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);

  if (!res?.ok) return titles;
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "[]";
  try {
    const parsed = JSON.parse(content.trim());
    if (Array.isArray(parsed) && parsed.length === titles.length) return parsed;
  } catch { /* fall through */ }
  return titles;
}

// ── Process one company ───────────────────────────────────────────────────────

async function processCompany(company) {
  const nameQ = company.name.replace(/\s+/g, " ").trim();

  const [a, b] = await Promise.all([
    fetchGoogleNews(`"${nameQ}" action bourse`),
    fetchGoogleNews(`"${nameQ}" résultats`),
  ]);

  // Dedupe
  const seen = new Set();
  const items = [...a, ...b].filter((n) => {
    const key = n.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate)).slice(0, 10);

  if (!items.length) return 0;

  // Upsert into DB
  await Promise.all(
    items.map((n) =>
      prisma.companyNewsItem.upsert({
        where: { linkHash: linkHash(n.link) },
        update: {},
        create: {
          companySlug: company.slug,
          linkHash: linkHash(n.link),
          link: n.link,
          titleFr: n.title,
          publisher: n.publisher,
          pubDate: new Date(n.pubDate),
        },
      })
    )
  );

  // Fetch the ones needing translation (titleEn null)
  const untranslated = await prisma.companyNewsItem.findMany({
    where: { companySlug: company.slug, titleEn: null },
    select: { id: true, titleFr: true },
  });

  if (!untranslated.length) return 0;

  // Translate in chunks
  let translated = 0;
  for (let i = 0; i < untranslated.length; i += CHUNK) {
    const chunk = untranslated.slice(i, i + CHUNK);
    const titlesEn = await translateTitles(chunk.map((r) => r.titleFr));
    await Promise.all(
      chunk.map((row, j) =>
        prisma.companyNewsItem.update({
          where: { id: row.id },
          data: { titleEn: titlesEn[j] ?? row.titleFr, translatedAt: new Date() },
        })
      )
    );
    translated += chunk.length;
  }

  return translated;
}

// ── Worker pool ───────────────────────────────────────────────────────────────

async function runWithWorkers(items, fn, workers) {
  const queue = [...items];
  let done = 0;
  let errors = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      try {
        const result = await fn(item);
        done++;
        if (done % 20 === 0 || queue.length === 0) {
          process.stdout.write(`\r  Progress: ${done}/${items.length} companies | ${errors} errors`);
        }
        return result;
      } catch (e) {
        errors++;
        console.error(`\n  Error on ${item.slug}:`, e.message);
      }
    }
  }

  // Run workers
  const active = Array.from({ length: Math.min(workers, items.length) }, worker);
  await Promise.all(active.map(async (w) => {
    let next = await w;
    while (next !== undefined) {
      next = await worker();
    }
  }));

  process.stdout.write("\n");
  return { done, errors };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!OPENAI_KEY) {
    console.error("ERROR: OPENAI_API_KEY not set");
    process.exit(1);
  }

  console.log("Fetching all companies from DB...");
  const companies = await prisma.company.findMany({
    select: { slug: true, name: true },
    orderBy: { name: "asc" },
  });
  console.log(`Found ${companies.length} companies. Starting with ${WORKERS} workers...\n`);

  const { done, errors } = await runWithWorkers(companies, processCompany, WORKERS);

  const totalInDb = await prisma.companyNewsItem.count();
  const translated = await prisma.companyNewsItem.count({ where: { titleEn: { not: null } } });
  const pending = await prisma.companyNewsItem.count({ where: { titleEn: null } });

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✓  Done! ${done} companies processed, ${errors} errors`);
  console.log(`   DB: ${totalInDb} news items total`);
  console.log(`   Translated: ${translated}`);
  console.log(`   Pending:    ${pending}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
