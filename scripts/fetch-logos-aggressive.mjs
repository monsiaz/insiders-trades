/**
 * fetch-logos-aggressive.mjs
 *
 * Aggressive multi-strategy logo fetcher for stubborn companies.
 *
 * Per company:
 *   1. Direct CDN guessing (brandfetch, simpleicons, cdnlogo, svgworld, seeklogo patterns)
 *   2. OpenAI gpt-4.1 with 3 parallel prompts + aggressive URL extraction
 *   3. OpenAI gpt-4o-search-preview as additional fallback
 *   4. Direct HTTP test of guessed logo paths on known domains
 *
 * Usage: node scripts/fetch-logos-aggressive.mjs [--concurrency=4] [--limit=N] [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { createRequire } from "module";
import path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

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

const args = process.argv.slice(2);
const LIMIT       = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "9999");
const CONCURRENCY = parseInt(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "4");
const DRY_RUN     = args.includes("--dry-run");

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";

if (!OPENAI_KEY) { console.error("❌ OPENAI_API_KEY missing"); process.exit(1); }
console.log(`✅ OpenAI: ${OPENAI_KEY.slice(0,8)}...\n`);
if (!BLOB_TOKEN && !DRY_RUN) { console.error("❌ BLOB_READ_WRITE_TOKEN missing"); process.exit(1); }

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const prisma = new PrismaClient({ log: ["error"] });

// ── Lazy OpenAI client ────────────────────────────────────────────────────────
let _oai = null;
async function oai() {
  if (_oai) return _oai;
  const { default: OpenAI } = await import("openai");
  _oai = new OpenAI({ apiKey: OPENAI_KEY });
  return _oai;
}

// ── Image fetch & validate ────────────────────────────────────────────────────

async function fetchImage(url, ms = 7000) {
  try {
    url = url.trim()
      .replace(/&amp;/g, "&").replace(/&#038;/g, "&")
      .replace(/\s+/g, "%20")
      .replace(/[.,;!?\]\)]+$/, "");
    new URL(url); // validate
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(ms), redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html") && !url.includes(".svg")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return null;
    return { buf, ct };
  } catch { return null; }
}

function isValidImage(buf, ct) {
  if (!buf || buf.length < 200) return false;
  if (ct?.includes("svg")) return buf.length > 80;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf.slice(0,4).toString() === "RIFF") return true; // WEBP
  const h = buf.slice(0,60).toString("utf8").toLowerCase();
  if (h.includes("<svg") || h.includes("<?xml")) return true;
  return false;
}

function isGoodUrl(url) {
  const bad = ["google.com/s2/favicons", "wikipedia.org", "wikimedia.org",
    "logo.clearbit.com", "facebook.com/images", "twitter.com/"];
  return !bad.some(b => url.includes(b));
}

// ── Strategy 1: Direct CDN guessing ──────────────────────────────────────────

function buildSlug(name) {
  return name.toLowerCase()
    .replace(/\s+(s\.a\.|s\.a\.s\.|s\.e\.|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|corp\b|ltd\b|group\b|groupe\b|holding\b)\.?\s*$/gi, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function tryCDNGuessing(name, yahooSymbol) {
  const slug = buildSlug(name);
  const ticker = yahooSymbol?.replace(/\.[A-Z]{1,3}$/, "").toLowerCase() ?? "";
  const noHyphen = slug.replace(/-/g, "");
  const short = slug.split("-")[0]; // first word

  const candidates = [
    // Brandfetch public CDN
    `https://cdn.brandfetch.io/${slug}.com/w/400/h/400/logo`,
    `https://cdn.brandfetch.io/${slug}.fr/w/400/h/400/logo`,
    `https://cdn.brandfetch.io/${noHyphen}.com/w/400/h/400/logo`,
    // SimpleIcons
    `https://cdn.simpleicons.org/${noHyphen}`,
    `https://cdn.simpleicons.org/${slug}`,
    `https://cdn.jsdelivr.net/npm/simple-icons@v12/icons/${noHyphen}.svg`,
    // CdnLogo
    `https://cdnlogo.com/logo/${slug}.svg`,
    `https://cdnlogo.com/logo/${noHyphen}.svg`,
    // SVGWorld
    `https://svgworld.co/logos/${slug}.svg`,
    // LogosWorld patterns
    `https://logos-world.net/wp-content/uploads/2020/${slug}-Logo.png`,
    `https://logos-world.net/wp-content/uploads/2021/${slug}-Logo.png`,
    `https://logos-world.net/wp-content/uploads/2022/${slug}-Logo.png`,
    // Seeklogo CDN
    `https://seeklogo.com/images/${short.charAt(0).toUpperCase()}/${slug}/${slug}-logo.png`,
    // Ticker-based
    ...(ticker ? [
      `https://cdn.brandfetch.io/${ticker}.com/w/400/h/400/logo`,
      `https://cdn.brandfetch.io/${ticker}.fr/w/400/h/400/logo`,
    ] : []),
  ];

  for (const url of candidates) {
    const r = await fetchImage(url, 4000);
    if (r && isValidImage(r.buf, r.ct)) return { ...r, source: "cdn", sourceUrl: url };
  }
  return null;
}

// ── Strategy 2: Aggressive OpenAI with multiple prompts ───────────────────────

function extractUrls(text) {
  const found = new Set();

  // Direct URL matches
  const patterns = [
    /https?:\/\/[^\s<>"'\]\)]+\.(?:png|jpg|jpeg|svg|webp|gif)(?:\?[^\s<>"'\]\)]*)?/gi,
    /https?:\/\/(?:cdn\.|assets\.|static\.|images\.|media\.|logo\.|www\.)[^\s<>"'\]\)]+/gi,
    /https?:\/\/[^\s<>"'\]\)]+\/(?:logo|brand|icon)[^\s<>"'\]\)]*/gi,
    /https?:\/\/cdn\.brandfetch\.io\/[^\s<>"'\]\)]*/gi,
    /https?:\/\/[^\s<>"'\]\)]+/gi,
  ];

  for (const pat of patterns) {
    for (const m of text.matchAll(pat)) {
      let u = m[0].replace(/[.,;!?\]\)'"]+$/, "").replace(/&amp;/g, "&");
      if (u.startsWith("http") && isGoodUrl(u)) found.add(u);
    }
  }

  // Markdown link extraction [text](url)
  for (const m of text.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g)) {
    let u = m[2].replace(/[.,;!?\]\)]+$/, "");
    if (isGoodUrl(u)) found.add(u);
  }

  // Prioritize: image extension > logo keyword > others
  return [...found].sort((a, b) => {
    const imgA = /\.(png|svg|jpg|webp)(\?|$)/i.test(a) ? 2 : 0;
    const imgB = /\.(png|svg|jpg|webp)(\?|$)/i.test(b) ? 2 : 0;
    const logoA = /logo|brand|icon/i.test(a) ? 1 : 0;
    const logoB = /logo|brand|icon/i.test(b) ? 1 : 0;
    return (imgB + logoB) - (imgA + logoA);
  });
}

async function tryOpenAIAggressive(name, yahooSymbol) {
  const client = await oai();
  const slug = buildSlug(name);
  const ticker = yahooSymbol?.replace(/\.[A-Z]{1,3}$/, "") ?? "";

  // 3 parallel prompts — different angles
  const prompts = [
    // Prompt 1: Brandfetch + CDN focus
    `Find the logo image URL for the French company "${name}"${ticker ? ` (ticker: ${ticker})` : ""}.
Check these sources IN ORDER:
1. https://cdn.brandfetch.io/${slug}.com/w/400/h/400/logo
2. https://cdn.brandfetch.io/${slug}.fr/w/400/h/400/logo
3. The official website header logo (find the website first)
4. https://cdnlogo.com/logo/${slug}.svg
Return ONLY direct image URLs (.png .svg .jpg .webp). Multiple URLs on separate lines. No explanations.`,

    // Prompt 2: Official website focus
    `French company "${name}"${ticker ? ` stock ${ticker}.PA` : ""} - find their official logo image URL.
Search for their website on Google, then find the logo in the HTML header.
Also try: brandfetch.io, seeklogo.com, worldvectorlogo.com, logopedia.net.
Return ALL direct image URLs you find (.png .svg .jpg .webp), one per line. No text.`,

    // Prompt 3: Image search focus  
    `Logo URL for "${name}" French company (Euronext Paris${ticker ? ` ticker ${ticker}` : ""}).
Search Google Images or Bing Images for: "${name} logo PNG transparent".
Find direct CDN/hosted image URLs.
Return up to 5 direct image URLs, one per line. Only URLs, nothing else.`,
  ];

  const results = await Promise.allSettled(
    prompts.map(async (prompt, i) => {
      try {
        const resp = await client.responses.create({
          model: "gpt-4.1",
          tools: [{ type: "web_search_preview", search_context_size: "medium" }],
          input: prompt,
          max_output_tokens: 500,
        });
        return resp.output_text ?? "";
      } catch { return ""; }
    })
  );

  // Collect all URLs from all prompts
  const allUrls = new Set();
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      for (const url of extractUrls(r.value)) allUrls.add(url);
    }
  }

  // Test each URL
  for (const url of allUrls) {
    const r = await fetchImage(url, 7000);
    if (r && isValidImage(r.buf, r.ct)) return { ...r, source: "openai", sourceUrl: url };
  }
  return null;
}

// ── Strategy 3: gpt-4o-search-preview as additional model ─────────────────────

async function trySearchPreview(name, yahooSymbol) {
  const client = await oai();
  const ticker = yahooSymbol?.replace(/\.[A-Z]{1,3}$/, "") ?? "";

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-search-preview",
      messages: [{
        role: "user",
        content: `Find the official logo image URL for the French company "${name}"${ticker ? ` (ticker: ${ticker}.PA on Euronext Paris)` : ""}.

Search the web and return ONLY direct image URLs (.png .svg .jpg .webp). 
Prefer logos from: official website, cdn.brandfetch.io, cdnlogo.com, seeklogo.com, worldvectorlogo.com.
Do NOT return: google favicons, wikipedia images, placeholder images.
Return up to 3 URLs, one per line, nothing else.`,
      }],
      max_tokens: 300,
    });

    const text = resp.choices[0]?.message?.content ?? "";
    for (const url of extractUrls(text)) {
      if (!isGoodUrl(url)) continue;
      const r = await fetchImage(url, 7000);
      if (r && isValidImage(r.buf, r.ct)) return { ...r, source: "openai_search", sourceUrl: url };
    }
  } catch {}
  return null;
}

// ── Strategy 4: Scrape domain guesses for header logo ─────────────────────────

async function tryDomainScrape(name, yahooSymbol) {
  const slug = buildSlug(name);
  const ticker = yahooSymbol?.replace(/\.[A-Z]{1,3}$/, "").toLowerCase() ?? "";
  const words = slug.split("-").filter(w => w.length > 2);

  const domains = [
    `${slug}.com`, `${slug}.fr`, `${slug}.eu`,
    ...(ticker ? [`${ticker}.com`, `${ticker}.fr`] : []),
    `${words[0]}.com`, `${words[0]}.fr`,
    `groupe${words[0]}.fr`, `groupe-${words[0]}.fr`,
    `${words[0]}group.com`,
  ];

  for (const domain of [...new Set(domains)].slice(0, 8)) {
    for (const scheme of [`https://www.${domain}`, `https://${domain}`]) {
      try {
        const res = await fetch(scheme, {
          headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "fr-FR,fr;q=0.9" },
          signal: AbortSignal.timeout(6000), redirect: "follow",
        });
        if (!res.ok) continue;
        const html = await res.text();
        const base = new URL(res.url).origin;

        // Find logo candidates
        const imgRe = /<img[^>]+>/gi;
        const candidates = /** @type {{ url: string; prio: number }[]} */ ([]);
        let m;
        while ((m = imgRe.exec(html.slice(0, 12000))) !== null) {
          const tag = m[0];
          const src = tag.match(/(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i)?.[1];
          if (!src || src.startsWith("data:") || /favicon|16x16|32x32|sprite/i.test(src)) continue;
          const alt = tag.match(/alt=["']([^"']+)["']/i)?.[1] ?? "";
          const cls = tag.match(/class=["']([^"']+)["']/i)?.[1] ?? "";
          const full = src.startsWith("http") ? src : src.startsWith("//") ? "https:" + src : base + (src.startsWith("/") ? "" : "/") + src;
          const prio = /logo|brand/i.test(src + alt + cls) ? 5 : 1;
          candidates.push({ url: full.replace(/&amp;/g, "&").replace(/\s+/g, "%20"), prio });
        }

        for (const { url } of candidates.sort((a, b) => b.prio - a.prio).slice(0, 5)) {
          if (!isGoodUrl(url)) continue;
          try { new URL(url); } catch { continue; }
          const r = await fetchImage(url, 5000);
          if (r && isValidImage(r.buf, r.ct)) return { ...r, source: "scraped_guess", sourceUrl: url };
        }
      } catch { continue; }
    }
  }
  return null;
}

// ── Upload to Blob ────────────────────────────────────────────────────────────

async function uploadToBlob(slug, buf, ct) {
  if (DRY_RUN) return `https://blob.vercel-storage.com/dry/${slug}`;
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
  const strategies = [
    ["cdn_guess",   () => tryCDNGuessing(co.name, co.yahooSymbol)],
    ["domain_scrape", () => tryDomainScrape(co.name, co.yahooSymbol)],
    ["openai",      () => tryOpenAIAggressive(co.name, co.yahooSymbol)],
    ["search_preview", () => trySearchPreview(co.name, co.yahooSymbol)],
  ];

  for (const [label, fn] of strategies) {
    try {
      const r = await fn();
      if (!r) continue;
      const url = await uploadToBlob(co.slug, r.buf, r.ct);
      if (!DRY_RUN) {
        await prisma.company.update({
          where: { id: co.id },
          data: { logoUrl: url, logoSource: r.source },
        });
      }
      stats.found++;
      stats.bySource[r.source] = (stats.bySource[r.source] ?? 0) + 1;
      stats.log.push(`  ✅ [${r.source}] ${co.name.padEnd(40)} ${r.sourceUrl?.slice(0,55)}`);
      return;
    } catch {}
  }
  stats.notFound++;
  stats.failed.push(co.name);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀  fetch-logos-aggressive.mjs — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`   concurrency=${CONCURRENCY}  limit=${LIMIT}`);
  console.log(`   Strategies: CDN guess → Domain scrape → OpenAI 3x parallel → gpt-4o-search\n`);

  const companies = await prisma.company.findMany({
    where: { logoUrl: null },
    select: { id: true, name: true, slug: true, yahooSymbol: true },
    orderBy: { declarations: { _count: "desc" } },
    take: LIMIT,
  });

  console.log(`📊  ${companies.length} companies to process\n`);
  if (!companies.length) { console.log("✅  All done!"); await prisma.$disconnect(); return; }

  const stats = { found: 0, notFound: 0, bySource: {}, log: [], failed: [] };
  let processed = 0;

  for (let i = 0; i < companies.length; i += CONCURRENCY) {
    const batch = companies.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(co => processOne(co, stats)));
    processed += batch.length;
    // Print logs accumulated this batch
    if (stats.log.length) {
      console.log(stats.log.join("\n"));
      stats.log = [];
    }
    const pct = Math.round(processed / companies.length * 100);
    const srcStr = Object.entries(stats.bySource).map(([k,v]) => `${k}=${v}`).join("  ");
    process.stdout.write(`\r  ${processed}/${companies.length} (${pct}%)  found=${stats.found}  missing=${stats.notFound}  [${srcStr}]  `);
  }

  console.log("\n");
  const [total, withLogo] = await Promise.all([
    prisma.company.count(),
    prisma.company.count({ where: { logoUrl: { not: null } } }),
  ]);

  console.log("════════════════════════════════════════════════════════");
  console.log(`✅ Found    : ${stats.found} / ${companies.length}`);
  console.log(`❌ Not found: ${stats.notFound}`);
  console.log(`\nBy source:`);
  Object.entries(stats.bySource).forEach(([k,v]) => console.log(`  ${k.padEnd(18)}: ${v}`));
  console.log(`\n📊 DB coverage: ${withLogo}/${total} (${(withLogo/total*100).toFixed(1)}%)`);
  if (stats.failed.length > 0) {
    console.log(`\n❌ Still missing (${stats.failed.length}):`);
    stats.failed.slice(0, 30).forEach(n => console.log(`  - ${n}`));
  }
  console.log("════════════════════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
