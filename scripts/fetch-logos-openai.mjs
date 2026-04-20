/**
 * fetch-logos-openai.mjs — OpenAI-only logo fetcher for remaining companies
 *
 * Uses gpt-4o-search-preview to find real logo URLs from the web.
 * Runs from Mac (where OpenAI key is available).
 *
 * Usage:
 *   node scripts/fetch-logos-openai.mjs [--concurrency=5] [--limit=N]
 */

import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { createRequire } from "module";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Load env ──────────────────────────────────────────────────────────────
function loadEnv(f) {
  try {
    readFileSync(f, "utf8").split("\n").forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    });
  } catch {}
}

loadEnv(path.join(__dirname, "../.env.local"));
loadEnv(path.join(__dirname, "../.env"));
loadEnv("/Users/simonazoulay/SurfCampSenegal/.env");

const args = process.argv.slice(2);
const LIMIT       = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "9999");
const CONCURRENCY = parseInt(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "5");
const DRY_RUN     = args.includes("--dry-run");

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";

if (!OPENAI_KEY) { console.error("❌ OPENAI_API_KEY not found"); process.exit(1); }
console.log("✅ OpenAI:", OPENAI_KEY.slice(0, 8) + "...");
if (!BLOB_TOKEN && !DRY_RUN) { console.error("❌ BLOB_READ_WRITE_TOKEN not found"); process.exit(1); }

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const prisma = new PrismaClient({ log: ["error"] });

// ── Image fetch & validate ────────────────────────────────────────────────

async function fetchImage(url, ms = 7000) {
  try {
    url = url.trim().replace(/[.,;!?)]+$/, "");
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(ms), redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 300) return null;
    return { buf, ct };
  } catch { return null; }
}

function isValidImage(buf, ct) {
  if (!buf || buf.length < 300) return false;
  if (ct.includes("svg")) return buf.length > 100;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf.slice(0, 4).toString() === "RIFF") return true; // WEBP
  const head = buf.slice(0, 60).toString("utf8").toLowerCase();
  if (head.includes("<svg") || head.includes("<?xml")) return true;
  return false;
}

// ── OpenAI search ─────────────────────────────────────────────────────────

const { default: OpenAI } = await import("openai");
const oai = new OpenAI({ apiKey: OPENAI_KEY });

async function findLogoWithOpenAI(name, yahooSymbol) {
  const prompt = `Trouve le logo officiel de la société française "${name}"${yahooSymbol ? ` (ticker: ${yahooSymbol})` : ""}.

Cherche sur :
- Le site officiel de l'entreprise (logo dans le header)
- Brandfetch : https://cdn.brandfetch.io/<domaine>/icon
- Logo hébergé sur un CDN public : cdn.<domaine>/logo.png, assets.<domaine>/logo.svg, etc.
- Le logo depuis le site boursier (ir.<domaine>.com, investor.<domaine>.com)

RÈGLES STRICTES :
- NE PAS retourner logo.clearbit.com (domaine bloqué)
- NE PAS retourner google.com/s2/favicons
- NE PAS retourner wikipedia.org ou wikimedia.org
- Retourne UNIQUEMENT l'URL directe de l'image (.png .jpg .svg .webp)
- Si tu trouves plusieurs URLs, donne-les toutes (une par ligne)`;

  try {
    const resp = await oai.chat.completions.create({
      model: "gpt-4o-search-preview",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
    });
    const text = resp.choices[0]?.message?.content?.trim() ?? "";

    // Extract URLs — image extensions AND clearbit/cdn domains
    const rawUrls = [...text.matchAll(/https?:\/\/[^\s<>"'\)\]]+/gi)]
      .map(m => m[0].replace(/[.,;!?\)\]]+$/, ""))
      .filter(u => !u.includes("google.com/s2/favicons") && !u.includes("wikipedia"));

    // Filter out blocked domains, prioritize image extensions
    const filtered = rawUrls.filter(u =>
      !u.includes("logo.clearbit.com") &&
      !u.includes("google.com/s2/favicons") &&
      !u.includes("wikipedia") &&
      !u.includes("wikimedia")
    );

    const urls = [
      ...filtered.filter(u => /\.(png|jpg|jpeg|svg|webp|gif)(\?.*)?$/i.test(u)),
      ...filtered.filter(u => u.includes("brandfetch.io") || u.includes("cdn.") || /logo|brand/i.test(u)),
      ...filtered,
    ].filter((u, i, arr) => arr.indexOf(u) === i) // dedupe
    .slice(0, 8);

    for (const url of urls) {
      const r = await fetchImage(url, 8000);
      if (r && isValidImage(r.buf, r.ct)) return { ...r, url };
    }
  } catch (e) {
    if (process.env.DEBUG) console.error(`[${name}] OpenAI error:`, e.message?.slice(0, 80));
  }
  return null;
}

// ── Blob upload ───────────────────────────────────────────────────────────

async function uploadToBlob(slug, buf, ct) {
  if (DRY_RUN) return `https://blob.vercel-storage.com/dry-run/${slug}`;
  const ext = ct.includes("svg") ? "svg" : ct.includes("webp") ? "webp"
    : ct.includes("jpg") || ct.includes("jpeg") ? "jpg" : "png";
  const blob = await put(`logos/${slug}.${ext}`, buf, {
    access: "public", token: BLOB_TOKEN, contentType: ct,
    addRandomSuffix: false, allowOverwrite: true,
  });
  return blob.url;
}

// ── Process one ───────────────────────────────────────────────────────────

async function processOne(co, stats) {
  const r = await findLogoWithOpenAI(co.name, co.yahooSymbol);
  if (!r) { stats.failed.push(co.name); return; }

  const blobUrl = await uploadToBlob(co.slug, r.buf, r.ct);
  if (!DRY_RUN) {
    await prisma.company.update({
      where: { id: co.id },
      data: { logoUrl: blobUrl, logoSource: "openai" },
    });
  }
  stats.found++;
  stats.samples.push({ name: co.name, url: r.url });
  if (stats.found <= 20 || stats.found % 10 === 0) {
    console.log(`  ✅ [${stats.found}] ${co.name.padEnd(40)} ${r.url.slice(0, 55)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🤖  fetch-logos-openai.mjs — gpt-4o-search-preview — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`   concurrency=${CONCURRENCY}  limit=${LIMIT}\n`);

  const companies = await prisma.company.findMany({
    where: { logoUrl: null },
    select: { id: true, name: true, slug: true, yahooSymbol: true },
    orderBy: { declarations: { _count: "desc" } },
    take: LIMIT,
  });

  console.log(`📊  ${companies.length} companies without logo\n`);
  if (!companies.length) { console.log("✅ All done!"); await prisma.$disconnect(); return; }

  const stats = { found: 0, failed: [], samples: [] };
  let processed = 0;

  for (let i = 0; i < companies.length; i += CONCURRENCY) {
    const batch = companies.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(co => processOne(co, stats)));
    processed += batch.length;
    const pct = Math.round(processed / companies.length * 100);
    process.stdout.write(`\r  Progress: ${processed}/${companies.length} (${pct}%)  found=${stats.found}  failed=${stats.failed.length}  `);
    // Rate limit: small pause between batches
    if (i + CONCURRENCY < companies.length) await new Promise(r => setTimeout(r, 1000));
  }

  console.log("\n");
  const [total, withLogo] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { logoUrl: { not: null } } }),
  ]);

  console.log("══════════════════════════════════════════════════");
  console.log(`✅ Found    : ${stats.found}`);
  console.log(`❌ Failed   : ${stats.failed.length}`);
  console.log(`📊 Coverage : ${withLogo}/${total} (${(withLogo/total*100).toFixed(1)}%)`);
  console.log("══════════════════════════════════════════════════");
  if (stats.failed.length) {
    console.log("\nNot found:");
    stats.failed.slice(0, 30).forEach(n => console.log("  -", n));
  }
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
