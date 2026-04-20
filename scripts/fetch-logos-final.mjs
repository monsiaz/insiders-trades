/**
 * fetch-logos-final.mjs — Logo fetcher v4
 *
 * What we learned from testing:
 *  - OpenAI asking for full image URL → unreliable (gives Wikipedia, broken CDN URLs)
 *  - Best strategy: gpt-4o-mini-search-preview to get official WEBSITE, then scrape header
 *  - Secondary: gpt-4o-mini-search-preview to get direct image URL + validate
 *  - Fallback: probe common paths directly on guessed domains
 *
 * Models tested:
 *  - gpt-4o-search-preview: accurate but slow (6s) & expensive
 *  - gpt-4o-mini-search-preview: fast (2s), cheap, good enough for URLs ✅ PRIMARY
 *  - gpt-4.1 responses: gives Wikipedia, not good for logos
 *
 * Usage: node scripts/fetch-logos-final.mjs [--concurrency=5] [--limit=N] [--test=10] [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { createRequire } from "module";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function loadEnv(f) {
  try {
    readFileSync(f, "utf8").split("\n").forEach(l => {
      const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    });
  } catch {}
}
loadEnv(path.join(__dirname, "../.env.local"));
loadEnv(path.join(__dirname, "../.env"));
loadEnv("/Users/simonazoulay/SurfCampSenegal/.env");

const args   = process.argv.slice(2);
const LIMIT  = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "9999");
const CONC   = parseInt(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "5");
const TEST   = parseInt(args.find(a => a.startsWith("--test="))?.split("=")[1] ?? "0");
const DRY    = args.includes("--dry-run");

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";

if (!OPENAI_KEY) { console.error("❌ No OPENAI_API_KEY"); process.exit(1); }
if (!BLOB_TOKEN && !DRY) { console.error("❌ No BLOB_READ_WRITE_TOKEN"); process.exit(1); }
console.log(`✅ OpenAI: ${OPENAI_KEY.slice(0,8)}...`);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const prisma = new PrismaClient({ log: ["error"] });

// Allow self-signed / unverifiable certs (some French company sites have issues)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// ── OpenAI client (lazy) ──────────────────────────────────────────────────────
let _oai = null;
async function getOAI() {
  if (_oai) return _oai;
  const { default: OpenAI } = await import("openai");
  _oai = new OpenAI({ apiKey: OPENAI_KEY });
  return _oai;
}

// ── Image fetch & validate ────────────────────────────────────────────────────

async function fetchImg(url, ms = 7000) {
  try {
    url = url.trim().replace(/&amp;/g, "&").replace(/&#038;/g, "&")
      .replace(/\s+/g, "%20").replace(/[.,;!?\]\)'"]+$/, "");
    new URL(url);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
      // @ts-ignore
      agent: url.startsWith("https") ? httpsAgent : undefined,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html") && !url.endsWith(".svg")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 300) return null;
    return { buf, ct };
  } catch { return null; }
}

function isImg(buf, ct) {
  if (!buf || buf.length < 300) return false;
  if (ct?.includes("svg")) return buf.length > 80;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf.slice(0,4).toString() === "RIFF") return true; // WEBP
  const h = buf.slice(0,60).toString("utf8").toLowerCase();
  return h.includes("<svg") || h.includes("<?xml");
}

function isGood(url) {
  return !["google.com/s2/favicons","wikipedia.org","wikimedia.org",
    "logo.clearbit.com","facebook.com/img","twitter.com/"].some(b => url.includes(b));
}

// ── Strategy 1: Ask OpenAI for website URL, then scrape header ────────────────

async function askWebsite(name, ticker) {
  const oai = await getOAI();
  try {
    const r = await oai.chat.completions.create({
      model: "gpt-4o-mini-search-preview",
      messages: [{
        role: "user",
        content: `What is the official website URL of the French company "${name}"${ticker ? ` (Euronext ticker: ${ticker})` : ""}? Return ONLY the full URL with https://. Nothing else.`,
      }],
      max_tokens: 60,
    });
    const text = r.choices[0]?.message?.content?.trim() ?? "";
    const m = text.match(/https?:\/\/[^\s<>"']+/);
    return m?.[0]?.replace(/\/$/, "") ?? null;
  } catch { return null; }
}

async function scrapeHeaderLogo(websiteUrl) {
  try {
    const res = await fetch(websiteUrl, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" },
      signal: AbortSignal.timeout(9000), redirect: "follow",
      // @ts-ignore
      agent: websiteUrl.startsWith("https") ? httpsAgent : undefined,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const base = new URL(res.url).origin;

    const candidates = [];
    // Focus on header / nav section for logo
    const headerBlock = html.match(/<header[^>]*>([\s\S]{0,8000}?)<\/header>/i)?.[1]
      ?? html.match(/<nav[^>]*>([\s\S]{0,5000}?)<\/nav>/i)?.[1]
      ?? html.slice(0, 12000);

    const imgRe = /<img[^>]+>/gi;
    let m;
    while ((m = imgRe.exec(headerBlock)) !== null) {
      const tag = m[0];
      const src = tag.match(/(?:src|data-src|data-lazy-src|data-original|data-img)=["']([^"']+)["']/i)?.[1];
      if (!src || src.startsWith("data:")) continue;
      if (/favicon|16x16|32x32|apple-touch|sprite|payment|social|icon-sm|user|avatar/i.test(src)) continue;
      const alt = tag.match(/alt=["']([^"']+)["']/i)?.[1] ?? "";
      const cls = tag.match(/class=["']([^"']+)["']/i)?.[1] ?? "";
      const prio = /logo|brand|marque/i.test(src + alt + cls) ? 10 : 3;
      let full = src.startsWith("http") ? src : src.startsWith("//") ? "https:" + src : base + (src.startsWith("/") ? "" : "/") + src;
      full = full.replace(/&amp;/g, "&").replace(/\s+/g, "%20");
      candidates.push({ url: full, prio });
    }

    for (const { url } of candidates.sort((a,b) => b.prio - a.prio).slice(0, 8)) {
      try { new URL(url); } catch { continue; }
      if (!isGood(url)) continue;
      const r = await fetchImg(url, 5000);
      if (r && isImg(r.buf, r.ct)) return { ...r, source: "scraped", sourceUrl: url };
    }
  } catch {}
  return null;
}

// ── Strategy 2: Ask OpenAI for direct logo URL ────────────────────────────────

async function askLogoUrl(name, ticker) {
  const oai = await getOAI();

  // Two parallel attempts with different angles
  const prompts = [
    // Focus on CDN and official assets
    `Find a direct logo image URL (.png .svg .jpg .webp) for the French company "${name}"${ticker ? ` (${ticker}.PA)` : ""}.
Exclude: wikipedia.org, wikimedia.org, google.com/s2/favicons.
Look at: official website header, cdnlogo.com, seeklogo.com, worldvectorlogo.com.
Return ONLY the direct image URL. One line, nothing else.`,
    // Different angle: press kit / investor relations
    `For the French company "${name}"${ticker ? ` (ticker ${ticker})` : ""}, find their official logo PNG or SVG.
Check: press page, investor relations page, media kit, or assets folder of their website.
Return ONLY the direct image URL ending in .png, .svg, .jpg, or .webp.`,
  ];

  const results = await Promise.allSettled(prompts.map(p =>
    oai.chat.completions.create({
      model: "gpt-4o-mini-search-preview",
      messages: [{ role: "user", content: p }],
      max_tokens: 150,
    }).then(r => r.choices[0]?.message?.content ?? "").catch(() => "")
  ));

  const allUrls = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const text = r.value;
    const urls = [...text.matchAll(/https?:\/\/[^\s<>"'\]\)]+/gi)]
      .map(m => m[0].replace(/[.,;!?\]\)'"]+$/, "").replace(/&amp;/g, "&"))
      .filter(u => isGood(u));
    allUrls.push(...urls);
  }

  // Sort: image extensions first
  const sorted = [...new Set(allUrls)].sort((a, b) => {
    const scoreA = /\.(png|svg|jpg|webp)(\?|$)/i.test(a) ? 2 : 0;
    const scoreB = /\.(png|svg|jpg|webp)(\?|$)/i.test(b) ? 2 : 0;
    return scoreB - scoreA;
  });

  for (const url of sorted.slice(0, 6)) {
    const r = await fetchImg(url, 7000);
    if (r && isImg(r.buf, r.ct)) return { ...r, source: "openai_url", sourceUrl: url };
  }
  return null;
}

// ── Strategy 3: Common path probing on guessed domains ────────────────────────

function guessSlug(name) {
  return name.toLowerCase()
    .replace(/\s+(s\.a\.|s\.a\.s\.|s\.e\.|société anonyme|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|corp\b|ltd\b|group\b|groupe\b|holding\b)\.?\s*$/gi, "")
    .trim().replace(/[^a-z0-9]+/g, "").slice(0, 20);
}

async function probePaths(name, yahooSymbol) {
  const slug = guessSlug(name);
  const ticker = yahooSymbol?.replace(/\.[A-Z]{1,3}$/, "").toLowerCase() ?? "";
  const domains = [
    `${slug}.fr`, `${slug}.com`, `${ticker}.fr`, `${ticker}.com`,
    `groupe${slug}.fr`, `${slug}group.com`,
  ].filter(Boolean);

  const LOG_PATHS = [
    "/logo.svg", "/logo.png", "/logo.webp",
    "/assets/logo.svg", "/assets/logo.png",
    "/assets/images/logo.png", "/assets/img/logo.png",
    "/images/logo.png", "/img/logo.png",
    "/media/logo.png", "/static/logo.png",
    "/wp-content/themes/logo.png",
  ];

  for (const domain of [...new Set(domains)].slice(0, 6)) {
    for (const scheme of [`https://www.${domain}`, `https://${domain}`]) {
      for (const p of LOG_PATHS) {
        const url = scheme + p;
        const r = await fetchImg(url, 3500);
        if (r && isImg(r.buf, r.ct) && r.buf.length > 500) {
          return { ...r, source: "probed", sourceUrl: url };
        }
      }
    }
  }
  return null;
}

// ── Upload to Vercel Blob ─────────────────────────────────────────────────────

async function uploadBlob(slug, buf, ct) {
  if (DRY) return `https://blob.vercel-storage.com/dry/${slug}`;
  const ext = ct?.includes("svg") ? "svg" : ct?.includes("webp") ? "webp"
    : ct?.includes("jpg") || ct?.includes("jpeg") ? "jpg" : "png";
  const blob = await put(`logos/${slug}.${ext}`, buf, {
    access: "public", token: BLOB_TOKEN, contentType: ct ?? "image/png",
    addRandomSuffix: false, allowOverwrite: true,
  });
  return blob.url;
}

// ── Process one company ───────────────────────────────────────────────────────

async function processOne(co, stats) {
  // Step 1: get website from OpenAI, scrape header
  const website = await askWebsite(co.name, co.yahooSymbol);
  if (website) {
    const r = await scrapeHeaderLogo(website);
    if (r) return save(co, r, stats);
  }

  // Step 2: ask OpenAI for direct image URL
  const r2 = await askLogoUrl(co.name, co.yahooSymbol);
  if (r2) return save(co, r2, stats);

  // Step 3: probe paths on guessed domains
  const r3 = await probePaths(co.name, co.yahooSymbol);
  if (r3) return save(co, r3, stats);

  stats.notFound++;
  stats.failed.push(co.name);
}

async function save(co, r, stats) {
  try {
    const url = await uploadBlob(co.slug, r.buf, r.ct);
    if (!DRY) {
      await prisma.company.update({
        where: { id: co.id },
        data: { logoUrl: url, logoSource: r.source },
      });
    }
    stats.found++;
    stats.bySource[r.source] = (stats.bySource[r.source] ?? 0) + 1;
    console.log(`  ✅ [${r.source.padEnd(12)}] ${co.name.padEnd(38)} ${r.sourceUrl?.slice(0,55)}`);
  } catch (e) {
    stats.errors++;
    stats.failed.push(`${co.name} [upload err]`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const mode = TEST > 0 ? `TEST (${TEST})` : DRY ? "DRY RUN" : "LIVE";
  console.log(`\n🚀  fetch-logos-final.mjs — ${mode}`);
  console.log(`   model: gpt-4o-mini-search-preview  concurrency=${CONC}`);
  console.log(`   strategy: website→scrape → direct URL → path probe\n`);

  const where = { logoUrl: null };
  let companies = await prisma.company.findMany({
    where, select: { id: true, name: true, slug: true, yahooSymbol: true },
    orderBy: { declarations: { _count: "desc" } },
    take: TEST > 0 ? TEST : LIMIT,
  });

  // In test mode, shuffle for variety
  if (TEST > 0) companies = companies.sort(() => Math.random() - 0.5).slice(0, TEST);

  console.log(`📊  ${companies.length} companies to process\n`);

  const stats = { found: 0, notFound: 0, errors: 0, bySource: {}, failed: [] };
  let processed = 0;

  for (let i = 0; i < companies.length; i += CONC) {
    const batch = companies.slice(i, i + CONC);
    await Promise.all(batch.map(co => processOne(co, stats)));
    processed += batch.length;
    const pct = Math.round(processed / companies.length * 100);
    const src = Object.entries(stats.bySource).map(([k,v]) => `${k}=${v}`).join("  ");
    process.stdout.write(`\r  ${processed}/${companies.length} (${pct}%)  ✅${stats.found}  ❌${stats.notFound}  [${src}]  `);
  }

  console.log("\n");
  const [total, withLogo] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { logoUrl: { not: null } } }),
  ]);

  console.log("════════════════════════════════════════════════════");
  console.log(`✅ Found     : ${stats.found} / ${companies.length} (${Math.round(stats.found/companies.length*100)}%)`);
  console.log(`❌ Not found : ${stats.notFound}`);
  if (stats.errors) console.log(`💥 Errors    : ${stats.errors}`);
  console.log(`\nBy source:`);
  Object.entries(stats.bySource).forEach(([k,v]) => console.log(`  ${k.padEnd(16)}: ${v}`));
  console.log(`\n📊 DB coverage: ${withLogo}/${total} (${(withLogo/total*100).toFixed(1)}%)`);
  if (stats.failed.length) {
    console.log(`\n❌ Still missing: ${stats.failed.length}`);
    stats.failed.slice(0, 20).forEach(n => console.log(`  - ${n}`));
  }
  console.log("════════════════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
