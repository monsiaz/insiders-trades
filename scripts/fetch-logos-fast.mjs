/**
 * fetch-logos-fast.mjs — Logo fetcher v5 (FAST)
 *
 * Key insight from testing:
 *  - Sequential strategies = very slow (90s+/company)
 *  - Solution: fire ALL strategies IN PARALLEL, take first winner
 *  - gpt-4o-mini-search-preview = 2-5s (fastest with web search)
 *  - Both OpenAI calls + path probing run simultaneously
 *
 * Usage: node scripts/fetch-logos-fast.mjs [--concurrency=8] [--limit=N] [--dry-run]
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

const args = process.argv.slice(2);
const LIMIT = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "9999");
const CONC  = parseInt(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "8");
const DRY   = args.includes("--dry-run");

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";

if (!OPENAI_KEY) { console.error("❌ No OPENAI_API_KEY"); process.exit(1); }
if (!BLOB_TOKEN && !DRY) { console.error("❌ No BLOB_READ_WRITE_TOKEN"); process.exit(1); }
console.log(`✅ OpenAI: ${OPENAI_KEY.slice(0,8)}...  concurrency=${CONC}\n`);

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";
const prisma = new PrismaClient({ log: ["error"] });
// Ignore SSL errors for French company sites
const tlsAgent = new https.Agent({ rejectUnauthorized: false });

// ── Lazy OpenAI ───────────────────────────────────────────────────────────────
let _oai = null;
async function getOAI() {
  if (_oai) return _oai;
  const { default: OpenAI } = await import("openai");
  _oai = new OpenAI({ apiKey: OPENAI_KEY });
  return _oai;
}

// ── Image fetch + validate ────────────────────────────────────────────────────

async function fetchImg(url, ms = 6000) {
  try {
    url = url.trim().replace(/&amp;/g, "&").replace(/\s+/g, "%20").replace(/[.,;!?\])'""]+$/, "");
    new URL(url);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(ms), redirect: "follow",
      // @ts-ignore — ignore SSL for French sites
      agent: url.startsWith("https") ? tlsAgent : undefined,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html") && !url.includes(".svg")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 300) return null;
    return { buf, ct };
  } catch { return null; }
}

function isRealImage(buf, ct) {
  if (!buf || buf.length < 300) return false;
  if (ct?.includes("svg")) return buf.length > 80;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf.slice(0,4).toString() === "RIFF") return true; // WEBP
  const h = buf.slice(0, 60).toString("utf8").toLowerCase();
  return h.includes("<svg") || h.includes("<?xml");
}

function isGoodUrl(url) {
  return !["google.com/s2/favicons", "wikipedia.org", "wikimedia.org",
    "logo.clearbit.com", "facebook.com/img"].some(b => url.includes(b));
}

function extractUrls(text) {
  const found = new Set();
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'\]\)]+/gi)) {
    let u = m[0].replace(/[.,;!?\])'"""]+$/, "").replace(/&amp;/g, "&");
    if (u.startsWith("http") && isGoodUrl(u)) found.add(u);
  }
  // Markdown links
  for (const m of text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)) {
    let u = m[2].replace(/[.,;!?\])"]+$/, "");
    if (isGoodUrl(u)) found.add(u);
  }
  // Sort: image ext first, then logo keyword
  return [...found].sort((a, b) => {
    const sa = (/\.(png|svg|jpg|webp)(\?|$)/i.test(a) ? 2 : 0) + (/logo|brand/i.test(a) ? 1 : 0);
    const sb = (/\.(png|svg|jpg|webp)(\?|$)/i.test(b) ? 2 : 0) + (/logo|brand/i.test(b) ? 1 : 0);
    return sb - sa;
  });
}

// ── OpenAI calls (all in parallel) ───────────────────────────────────────────

async function oaiCall(prompt, model = "gpt-4o-mini-search-preview") {
  const oai = await getOAI();
  const r = await oai.chat.completions.create({
    model, messages: [{ role: "user", content: prompt }], max_tokens: 200,
  });
  return r.choices[0]?.message?.content?.trim() ?? "";
}

// ── Website scrape ────────────────────────────────────────────────────────────

async function scrapeLogoFromUrl(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(8000), redirect: "follow",
      // @ts-ignore
      agent: url.startsWith("https") ? tlsAgent : undefined,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const base = new URL(res.url).origin;

    const block = html.match(/<header[^>]*>([\s\S]{0,8000}?)<\/header>/i)?.[1]
      ?? html.match(/<nav[^>]*>([\s\S]{0,5000}?)<\/nav>/i)?.[1]
      ?? html.slice(0, 12000);

    const cands = [];
    const re = /<img[^>]+>/gi; let m;
    while ((m = re.exec(block)) !== null) {
      const tag = m[0];
      const src = tag.match(/(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["']/i)?.[1];
      if (!src || src.startsWith("data:") || /favicon|16x16|32x32|sprite|social|payment/i.test(src)) continue;
      const combined = src + (tag.match(/alt=["']([^"']*)/i)?.[1] ?? "") + (tag.match(/class=["']([^"']*)/i)?.[1] ?? "");
      const prio = /logo|brand|marque/i.test(combined) ? 10 : 3;
      let full = src.startsWith("http") ? src : src.startsWith("//") ? "https:" + src : base + (src.startsWith("/") ? "" : "/") + src;
      full = full.replace(/&amp;/g, "&").replace(/\s+/g, "%20");
      cands.push({ url: full, prio });
    }

    for (const { url: imgUrl } of cands.sort((a,b) => b.prio - a.prio).slice(0, 8)) {
      try { new URL(imgUrl); } catch { continue; }
      if (!isGoodUrl(imgUrl)) continue;
      const r = await fetchImg(imgUrl, 5000);
      if (r && isRealImage(r.buf, r.ct)) return { ...r, source: "scraped", sourceUrl: imgUrl };
    }
  } catch {}
  return null;
}

// ── Path probing ──────────────────────────────────────────────────────────────

async function probePaths(name, ticker) {
  const slug = name.toLowerCase()
    .replace(/\s+(s\.a\.|s\.e\.|se\b|sa\b|sas\b|plc\b|nv\b|bv\b|inc\b|corp\b|ltd\b|group\b|groupe\b|holding\b)\.?\s*$/gi, "")
    .trim().replace(/[^a-z0-9]+/g, "");
  const t = ticker?.replace(/\.[A-Z]+$/, "").toLowerCase() ?? "";
  const domains = [...new Set([`${slug}.fr`, `${slug}.com`, ...(t ? [`${t}.fr`, `${t}.com`] : [])])].slice(0, 5);
  const paths = ["/logo.svg", "/logo.png", "/assets/logo.svg", "/assets/logo.png",
    "/img/logo.png", "/img/logo.svg", "/images/logo.png", "/static/logo.png",
    "/assets/images/logo.png", "/media/logo.png"];

  const checks = [];
  for (const d of domains) {
    for (const p of paths) {
      for (const s of [`https://www.${d}`, `https://${d}`]) {
        checks.push(s + p);
      }
    }
  }
  // All in parallel (fast! they'll mostly 404)
  const results = await Promise.all(checks.map(async url => {
    const r = await fetchImg(url, 3000);
    if (r && isRealImage(r.buf, r.ct) && r.buf.length > 500) return { ...r, source: "probed", sourceUrl: url };
    return null;
  }));
  return results.find(r => r != null) ?? null;
}

// ── Main per-company logic (ALL strategies in parallel) ───────────────────────

async function findLogo(name, ticker) {
  // Race: fire everything at once, return first winner
  return new Promise(async (resolve) => {
    let settled = false;
    function win(r) { if (!settled) { settled = true; resolve(r); } }
    function done() { /* no-op, others still running */ }

    // 1. Path probing (fast, no API cost)
    probePaths(name, ticker).then(r => { if (r) win(r); }).catch(done);

    // 2. OpenAI: get website then scrape
    oaiCall(`What is the official website URL of "${name}" (French company${ticker ? `, ticker ${ticker}` : ""})? Return ONLY the URL with https://.`)
      .then(async text => {
        const m = text.match(/https?:\/\/[^\s<>"']+/);
        const url = m?.[0]?.replace(/\/$/, "");
        if (!url || url.includes("google.com") || url.includes("search")) return;
        const r = await scrapeLogoFromUrl(url);
        if (r) win(r);
      }).catch(done);

    // 3. OpenAI: ask for direct image URL (2 models in parallel)
    const logoPrompt = `Find a real logo image URL (.png .svg .jpg .webp) for the French company "${name}"${ticker ? ` (${ticker}.PA)` : ""}. Exclude: wikipedia.org, wikimedia.org, google.com/s2/favicons. Prefer: official website, cdnlogo.com, seeklogo.com, worldvectorlogo.com. Return ONLY 1-3 direct image URLs, one per line.`;

    Promise.all([
      oaiCall(logoPrompt, "gpt-4o-mini-search-preview"),
      oaiCall(logoPrompt, "gpt-4o-search-preview"),
    ]).then(async ([t1, t2]) => {
      const allUrls = extractUrls(t1 + "\n" + t2);
      for (const url of allUrls.slice(0, 8)) {
        if (settled) return;
        const r = await fetchImg(url, 6000);
        if (r && isRealImage(r.buf, r.ct)) { win({ ...r, source: "openai_url", sourceUrl: url }); return; }
      }
    }).catch(done);

    // Timeout: give up after 45s
    setTimeout(() => { if (!settled) { settled = true; resolve(null); } }, 45000);
  });
}

// ── Upload ────────────────────────────────────────────────────────────────────

async function uploadBlob(slug, buf, ct) {
  if (DRY) return `https://blob.vercel-storage.com/dry/${slug}`;
  const ext = ct?.includes("svg") ? "svg" : ct?.includes("webp") ? "webp"
    : (ct?.includes("jpg") || ct?.includes("jpeg")) ? "jpg" : "png";
  const blob = await put(`logos/${slug}.${ext}`, buf, {
    access: "public", token: BLOB_TOKEN, contentType: ct ?? "image/png",
    addRandomSuffix: false, allowOverwrite: true,
  });
  return blob.url;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🚀  fetch-logos-fast.mjs — ${DRY ? "DRY RUN" : "LIVE"}`);
  console.log(`   ALL strategies fire in PARALLEL per company`);
  console.log(`   path probe + website scrape + gpt-4o-mini + gpt-4o-search → race\n`);

  const companies = await prisma.company.findMany({
    where: { logoUrl: null },
    select: { id: true, name: true, slug: true, yahooSymbol: true },
    orderBy: { declarations: { _count: "desc" } },
    take: LIMIT,
  });

  console.log(`📊  ${companies.length} companies to process\n`);
  if (!companies.length) { console.log("✅ All done!"); await prisma.$disconnect(); return; }

  const stats = { found: 0, notFound: 0, bySource: {}, failed: [] };
  let processed = 0;

  for (let i = 0; i < companies.length; i += CONC) {
    const batch = companies.slice(i, i + CONC);

    await Promise.all(batch.map(async (co) => {
      const r = await findLogo(co.name, co.yahooSymbol);
      if (r) {
        try {
          const url = await uploadBlob(co.slug, r.buf, r.ct);
          if (!DRY) await prisma.company.update({ where: { id: co.id }, data: { logoUrl: url, logoSource: r.source } });
          stats.found++;
          stats.bySource[r.source] = (stats.bySource[r.source] ?? 0) + 1;
          console.log(`  ✅ [${r.source.padEnd(12)}] ${co.name.padEnd(38)} ${r.sourceUrl?.slice(0, 50)}`);
        } catch { stats.notFound++; stats.failed.push(co.name + " [upload err]"); }
      } else {
        stats.notFound++;
        stats.failed.push(co.name);
      }
    }));

    processed += batch.length;
    const pct = Math.round(processed / companies.length * 100);
    const src = Object.entries(stats.bySource).map(([k,v]) => `${k}=${v}`).join("  ");
    console.log(`  ── ${processed}/${companies.length} (${pct}%)  ✅${stats.found}  ❌${stats.notFound}  [${src}]`);
  }

  const [total, withLogo] = await Promise.all([
    prisma.company.count(), prisma.company.count({ where: { logoUrl: { not: null } } }),
  ]);

  console.log("\n════════════════════════════════════════════════════");
  console.log(`✅ Found     : ${stats.found} / ${companies.length}`);
  console.log(`❌ Not found : ${stats.notFound}`);
  console.log(`\nBy source:`);
  Object.entries(stats.bySource).forEach(([k,v]) => console.log(`  ${k.padEnd(14)}: ${v}`));
  console.log(`\n📊 DB coverage: ${withLogo}/${total} (${(withLogo/total*100).toFixed(1)}%)`);
  if (stats.failed.length > 0) {
    console.log(`\n❌ Still missing (${stats.failed.length}):`);
    stats.failed.slice(0, 20).forEach(n => console.log(`  - ${n}`));
  }
  console.log("════════════════════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
