/**
 * fetch-logos.mjs — Fetch real company logos from Mac (local execution)
 *
 * Strategy (NO Google Favicon):
 *   1. Clearbit logo API  — domain variants (ticker.fr, ticker.com, name.fr, name.com…)
 *   2. Website OG image   — scrape official site for og:image / header logo img
 *   3. OpenAI gpt-4o-search-preview — web search for logo URL (last resort)
 *
 * Each found logo → uploaded to Vercel Blob → URL stored in Company.logoUrl
 *
 * Usage:
 *   node scripts/fetch-logos.mjs [--limit=N] [--concurrency=50] [--reprocess]
 *   OPENAI_API_KEY=sk-... node scripts/fetch-logos.mjs
 */

import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { createRequire } from "module";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Load env vars ────────────────────────────────────────────────────────────
function loadEnv(filePath) {
  try {
    const lines = readFileSync(filePath, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        let val = m[2].trim().replace(/^["']|["']$/g, "");
        if (val) process.env[m[1]] = val;
      }
    }
  } catch {}
}

// Load from multiple sources
loadEnv(path.join(__dirname, "../.env.local"));
loadEnv(path.join(__dirname, "../.env"));
loadEnv("/Users/simonazoulay/SurfCampSenegal/.env");
// Also try common locations
[
  "/Users/simonazoulay/.env",
  path.join(process.env.HOME || "", ".openai"),
].forEach(loadEnv);

const args = process.argv.slice(2);
const LIMIT       = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "9999");
const CONCURRENCY = parseInt(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "50");
const REPROCESS   = args.includes("--reprocess");
const DRY_RUN     = args.includes("--dry-run");

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";

if (!OPENAI_KEY) {
  console.warn("⚠️  OPENAI_API_KEY not found — OpenAI fallback will be skipped");
} else {
  console.log("✅ OpenAI key loaded:", OPENAI_KEY.slice(0, 8) + "...");
}
if (!BLOB_TOKEN && !DRY_RUN) {
  console.error("❌ BLOB_READ_WRITE_TOKEN not found");
  process.exit(1);
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const prisma = new PrismaClient({ log: ["error"] });

// ── Image fetch & validation ─────────────────────────────────────────────────

async function fetchImage(url, ms = 7000) {
  try {
    url = url.trim().replace(/[.,;!?)]+$/, "");
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(ms),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html") || ct.includes("text/plain")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 300) return null;
    return { buf, ct };
  } catch { return null; }
}

function isValidImage(buf, ct) {
  if (!buf || buf.length < 300) return false;
  if (ct.includes("svg")) return buf.length > 100;
  // Check magic bytes
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf.slice(0, 4).toString() === "RIFF") return true; // WEBP
  if (buf.slice(0, 3).toString() === "GIF") return true;
  const head = buf.slice(0, 60).toString("utf8").toLowerCase();
  if (head.includes("<svg") || head.includes("<?xml")) return true;
  return false;
}

function isNotWiki(url) {
  return !url.includes("wikipedia.org") && !url.includes("wikimedia.org") && !url.includes("google.com/s2/favicons");
}

// ── Domain variants ──────────────────────────────────────────────────────────

function buildDomains(name, yahooSymbol) {
  const cleaned = name.toLowerCase()
    .replace(/\s+(s\.a\.|s\.a\.s\.|s\.e\.|société anonyme|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|corp\b|ltd\b|group\b|groupe\b|holding\b|international\b|france\b|europe\b|et compagnie|& co\b)\.?\s*$/gi, "")
    .trim();

  const noSpace = cleaned.replace(/[\s\-&',\.\(\)]/g, "");
  const dashed  = cleaned.replace(/[\s&',\.\(\)]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const ticker  = yahooSymbol?.replace(/\.[A-Z]{1,3}$/, "").toLowerCase() ?? "";

  const cands = new Set();
  if (ticker && ticker.length >= 2) {
    cands.add(`${ticker}.fr`);
    cands.add(`${ticker}.com`);
  }
  for (const base of [noSpace, dashed]) {
    if (base.length >= 2) {
      cands.add(`${base}.fr`);
      cands.add(`${base}.com`);
      // Deaccented
      const da = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (da !== base) { cands.add(`${da}.fr`); cands.add(`${da}.com`); }
    }
  }
  // Extra: without common suffixes
  const stripped = noSpace.replace(/groupe|group|sa|se|holding|france/g, "");
  if (stripped.length >= 3 && stripped !== noSpace) {
    cands.add(`${stripped}.fr`);
    cands.add(`${stripped}.com`);
  }
  return [...cands].slice(0, 14);
}

// ── Strategy 1: Clearbit ─────────────────────────────────────────────────────

async function tryClearbit(name, yahooSymbol) {
  const domains = buildDomains(name, yahooSymbol);
  for (const domain of domains) {
    const url = `https://logo.clearbit.com/${domain}`;
    const r = await fetchImage(url, 5000);
    if (!r) continue;
    // Clearbit returns 200 for valid logos
    if (isValidImage(r.buf, r.ct)) {
      return { ...r, source: "clearbit", sourceUrl: url };
    }
    // Clearbit 403 WAF: check magic bytes
    if (r.buf.length > 100) {
      const head = r.buf.slice(0, 4);
      if (head[0] === 0x89 || head[0] === 0xff || r.buf.toString("utf8", 0, 5).includes("<svg")) {
        return { ...r, source: "clearbit", sourceUrl: url };
      }
    }
  }
  return null;
}

// ── Strategy 2: OG image + header logo scraping ──────────────────────────────

async function tryScrape(name, yahooSymbol) {
  const domains = buildDomains(name, yahooSymbol).slice(0, 5);

  for (const domain of domains) {
    for (const scheme of [`https://${domain}`, `https://www.${domain}`]) {
      try {
        const res = await fetch(scheme, {
          headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8" },
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
        });
        if (!res.ok) continue;
        const html = await res.text();
        const base = new URL(res.url).origin;

        const candidates = [];

        // 1. OG image
        const ogMatch = html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)
          ?? html.match(/content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i);
        if (ogMatch?.[1]) candidates.push({ url: ogMatch[1], priority: 10 });

        // Twitter image
        const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
        if (twMatch?.[1]) candidates.push({ url: twMatch[1], priority: 9 });

        // 2. Header/navbar logo imgs
        const headerMatch = html.match(/<header[^>]*>([\s\S]{0,3000}?)<\/header>/i);
        const navMatch    = html.match(/<nav[^>]*>([\s\S]{0,2000}?)<\/nav>/i);
        for (const block of [headerMatch?.[1], navMatch?.[1]].filter(Boolean)) {
          const imgRe = /<img[^>]+>/gi;
          let m;
          while ((m = imgRe.exec(block)) !== null) {
            const tag = m[0];
            const src = tag.match(/(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)?.[1];
            const alt = tag.match(/alt=["']([^"']+)["']/i)?.[1] ?? "";
            const cls = tag.match(/class=["']([^"']+)["']/i)?.[1] ?? "";
            if (!src || src.startsWith("data:")) continue;
            if (/favicon|16x16|32x32|apple-touch/i.test(src)) continue;
            const prio = /logo|brand/i.test(src + alt + cls) ? 8 : 4;
            candidates.push({ url: src, priority: prio });
          }
        }

        // 3. Any img with logo in src/alt/class
        const logoImgs = [...html.matchAll(/<img[^>]+>/gi)];
        for (const [tag] of logoImgs) {
          const src = tag.match(/(?:src|data-src)=["']([^"']+)["']/i)?.[1];
          const alt = tag.match(/alt=["']([^"']+)["']/i)?.[1] ?? "";
          const cls = tag.match(/class=["']([^"']+)["']/i)?.[1] ?? "";
          if (!src || src.startsWith("data:")) continue;
          if (/favicon|16x16|32x32|sprite|payment|social/i.test(src + cls)) continue;
          if (/logo|brand/i.test(src + alt + cls)) {
            candidates.push({ url: src, priority: 6 });
          }
        }

        // Resolve URLs and test
        const seen = new Set();
        const sorted = candidates.sort((a, b) => b.priority - a.priority);
        for (const { url: rawUrl } of sorted) {
          let resolved;
          try {
            resolved = rawUrl.startsWith("http") ? rawUrl
              : rawUrl.startsWith("//") ? "https:" + rawUrl
              : base + (rawUrl.startsWith("/") ? "" : "/") + rawUrl;
          } catch { continue; }
          if (seen.has(resolved)) continue;
          seen.add(resolved);
          if (!isNotWiki(resolved)) continue;
          const r = await fetchImage(resolved, 6000);
          if (r && isValidImage(r.buf, r.ct)) {
            return { ...r, source: "scraped", sourceUrl: resolved };
          }
        }
      } catch { continue; }
    }
  }
  return null;
}

// ── Strategy 3: OpenAI gpt-4o-search-preview ─────────────────────────────────

async function tryOpenAI(name, yahooSymbol) {
  if (!OPENAI_KEY) return null;
  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: OPENAI_KEY });

    const prompt = `Trouve l'URL officielle du logo de la société française "${name}"${yahooSymbol ? ` (ticker Euronext: ${yahooSymbol})` : ""}.

Cherche sur :
- Le site officiel de l'entreprise
- Clearbit : https://logo.clearbit.com/<domaine>
- Brandfetch : https://cdn.brandfetch.io/<domaine>/icon
- Wikipedia Commons
- LinkedIn, Twitter/X page officielle

RÈGLES STRICTES :
- NE PAS retourner une URL Google Favicon (google.com/s2/favicons)
- NE PAS retourner une URL Wikipedia (wikipedia.org ou wikimedia.org)
- Retourner UNIQUEMENT l'URL directe de l'image (.png, .jpg, .svg, .webp)
- Une seule URL, sans explication`;

    const resp = await client.chat.completions.create({
      model: "gpt-4o-search-preview",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
    });

    const text = resp.choices[0]?.message?.content?.trim() ?? "";
    // Extract all image URLs
    const urls = [...text.matchAll(/https?:\/\/[^\s<>"']+\.(?:png|jpg|jpeg|svg|webp)(?:\?[^\s<>"']*)?/gi)]
      .map(m => m[0])
      .filter(u => isNotWiki(u));

    for (const url of urls.slice(0, 5)) {
      const r = await fetchImage(url, 8000);
      if (r && isValidImage(r.buf, r.ct)) {
        return { ...r, source: "openai", sourceUrl: url };
      }
    }

    // Try Clearbit URL suggested by AI even if not an image extension
    const clearbitMatch = text.match(/https:\/\/logo\.clearbit\.com\/[^\s<>"']+/i);
    if (clearbitMatch) {
      const r = await fetchImage(clearbitMatch[0], 5000);
      if (r && isValidImage(r.buf, r.ct)) {
        return { ...r, source: "openai_clearbit", sourceUrl: clearbitMatch[0] };
      }
    }
  } catch (e) {
    if (process.env.DEBUG) console.error("OpenAI error:", e.message?.slice(0, 80));
  }
  return null;
}

// ── Blob upload ──────────────────────────────────────────────────────────────

async function uploadToBlob(slug, buf, ct) {
  if (DRY_RUN) return `https://blob.vercel-storage.com/dry-run/${slug}`;
  const ext = ct.includes("svg") ? "svg" : ct.includes("webp") ? "webp"
    : ct.includes("gif") ? "gif" : ct.includes("jpg") || ct.includes("jpeg") ? "jpg" : "png";
  const blob = await put(`logos/${slug}.${ext}`, buf, {
    access: "public", token: BLOB_TOKEN, contentType: ct, addRandomSuffix: false,
  });
  return blob.url;
}

// ── Process one company ──────────────────────────────────────────────────────

async function processCompany(co, stats) {
  const strategies = [
    () => tryClearbit(co.name, co.yahooSymbol),
    () => tryScrape(co.name, co.yahooSymbol),
    () => tryOpenAI(co.name, co.yahooSymbol),
  ];

  for (const strategy of strategies) {
    try {
      const r = await strategy();
      if (!r) continue;
      const url = await uploadToBlob(co.slug, r.buf, r.ct);
      if (!DRY_RUN) {
        await prisma.company.update({
          where: { id: co.id },
          data: { logoUrl: url, logoSource: r.source },
        });
      }
      stats.found++;
      stats[r.source] = (stats[r.source] ?? 0) + 1;
      stats.samples.push({ name: co.name, source: r.source, url: r.sourceUrl });
      return;
    } catch {}
  }
  stats.notFound++;
  stats.failed.push(co.name);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🖼️  fetch-logos.mjs — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`   concurrency=${CONCURRENCY}  limit=${LIMIT}  reprocess=${REPROCESS}\n`);
  console.log(`   Strategies: Clearbit → Scrape OG → OpenAI (no Google Favicon)\n`);

  const where = REPROCESS ? {} : { logoUrl: null };
  const companies = await prisma.company.findMany({
    where,
    select: { id: true, name: true, slug: true, yahooSymbol: true },
    orderBy: { declarations: { _count: "desc" } },
    take: LIMIT,
  });

  console.log(`📊  ${companies.length} companies to process\n`);
  if (companies.length === 0) { console.log("✅  Nothing to do!"); await prisma.$disconnect(); return; }

  const stats = { found: 0, notFound: 0, samples: [], failed: [] };
  let processed = 0;

  // Process in parallel batches
  for (let i = 0; i < companies.length; i += CONCURRENCY) {
    const batch = companies.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(co => processCompany(co, stats)));
    processed += batch.length;
    const pct = Math.round(processed / companies.length * 100);
    const foundKeys = Object.entries(stats)
      .filter(([k]) => !["found","notFound","samples","failed"].includes(k))
      .map(([k,v]) => `${k}=${v}`).join("  ");
    process.stdout.write(`\r  ${processed}/${companies.length} (${pct}%)  found=${stats.found}  missing=${stats.notFound}  [${foundKeys}]  `);
  }

  console.log("\n");
  console.log("════════════════════════════════════════════════════════");
  console.log("                    LOGO REPORT");
  console.log("════════════════════════════════════════════════════════");
  console.log(`Total         : ${companies.length}`);
  console.log(`✅ Found      : ${stats.found} (${Math.round(stats.found/companies.length*100)}%)`);
  console.log(`❌ Not found  : ${stats.notFound}`);
  console.log(`\nBy source:`);
  for (const [k, v] of Object.entries(stats)) {
    if (["found","notFound","samples","failed"].includes(k)) continue;
    console.log(`  ${k.padEnd(18)}: ${v}`);
  }
  if (stats.samples.length > 0) {
    console.log(`\n✅ Sample logos found:`);
    stats.samples.slice(0, 20).forEach(s => console.log(`  ${s.name.padEnd(35)} [${s.source}] ${s.url.slice(0,60)}`));
  }
  if (stats.failed.length > 0) {
    console.log(`\n❌ Not found (${stats.failed.length}):`);
    stats.failed.slice(0, 30).forEach(n => console.log(`  ${n}`));
  }
  console.log("════════════════════════════════════════════════════════\n");

  // Final DB stats
  const [total, withLogo] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { logoUrl: { not: null } } }),
  ]);
  console.log(`📊 DB coverage: ${withLogo}/${total} (${(withLogo/total*100).toFixed(1)}%)\n`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
