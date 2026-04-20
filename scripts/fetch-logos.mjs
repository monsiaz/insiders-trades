/**
 * fetch-logos.mjs — Fetch and self-host company logos
 *
 * Priority chain (fast → slow):
 *   1. Clearbit logo API (free, very reliable)
 *   2. Google Favicon HD (free, always returns something)
 *   3. OG image scraping from company website (Yahoo Finance page)
 *   4. OpenAI gpt-4o-search-preview web search (last resort)
 *
 * Each valid logo is:
 *   - Downloaded as buffer
 *   - Uploaded to Vercel Blob (self-hosted CDN)
 *   - URL stored in Company.logoUrl
 *
 * Usage:
 *   node scripts/fetch-logos.mjs [--limit=N] [--concurrency=N] [--dry-run] [--reprocess]
 */

import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";
import { createRequire } from "module";
import path from "path";
import { writeFileSync, unlinkSync } from "fs";
import os from "os";

// Load env vars from .env.local
const require = createRequire(import.meta.url);
try {
  const dotenv = require("dotenv");
  dotenv.config({ path: path.join(process.cwd(), ".env.local") });
  dotenv.config({ path: path.join(process.cwd(), ".env") });
} catch {}

const args = process.argv.slice(2);
const LIMIT       = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] ?? "9999");
const CONCURRENCY = parseInt(args.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? "10");
const DRY_RUN     = args.includes("--dry-run");
const REPROCESS   = args.includes("--reprocess"); // re-fetch even if logoUrl exists

const OPENAI_KEY = process.env.OPENAI_API_KEY ?? "";
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";

if (!BLOB_TOKEN && !DRY_RUN) {
  console.error("❌ BLOB_READ_WRITE_TOKEN not found in env. Run: npx vercel env pull .env.local");
  process.exit(1);
}

const prisma = new PrismaClient({ log: ["error"] });

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

// ── Image validation ─────────────────────────────────────────────────────────

async function fetchImage(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html") || ct.includes("text/plain")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null;
    return { buf, contentType: ct || "image/png" };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function isValidImage(buf, ct) {
  if (!buf || buf.length < 100) return false;
  if (ct?.includes("svg")) return buf.length > 80; // SVG text — accept if non-trivial
  // PNG magic: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50) return true;
  // JPEG magic: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  // WEBP: RIFF....WEBP
  if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return true;
  // GIF
  if (buf.slice(0, 3).toString() === "GIF") return true;
  // ICO
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01) return true;
  // SVG/XML
  const head = buf.slice(0, 30).toString("utf8").toLowerCase();
  if (head.includes("<svg") || head.includes("<?xml")) return true;
  return false;
}

// ── Upload to Vercel Blob ────────────────────────────────────────────────────

async function uploadToBlob(company, buf, contentType) {
  if (DRY_RUN) return `https://example.blob.vercel-storage.com/logos/${company.slug}.png`;

  const ext = contentType.includes("svg") ? "svg"
    : contentType.includes("webp") ? "webp"
    : contentType.includes("gif") ? "gif"
    : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
    : "png";

  const filename = `logos/${company.slug}.${ext}`;
  const blob = await put(filename, buf, {
    access: "public",
    token: BLOB_TOKEN,
    contentType,
    addRandomSuffix: false,
  });
  return blob.url;
}

// ── Strategy 1: Clearbit ────────────────────────────────────────────────────

function nameToDomainCandidates(company) {
  // Clean company name → possible domains
  const raw = company.name.toLowerCase()
    .replace(/\s+(s\.a\.|s\.a\.s\.|s\.e\.|se|sa|sas|plc|nv|bv|inc|corp|ltd|group|groupe|holding|international|france|europe)\.?$/gi, "")
    .trim();

  const noSpaces  = raw.replace(/[\s\-&',\.]/g, "");
  const dashed    = raw.replace(/[\s&',\.]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const dotted    = raw.replace(/[\s&',\.]+/g, ".");

  const tlds = [".fr", ".com"];
  const candidates = [];
  for (const base of [noSpaces, dashed, dotted]) {
    for (const tld of tlds) {
      candidates.push(`${base}${tld}`);
    }
  }
  return candidates;
}

async function tryClearbit(company) {
  const candidates = [
    ...nameToDomainCandidates(company),
    company.yahooSymbol ? `${company.yahooSymbol.replace(/\.[A-Z]+$/, "").toLowerCase()}.fr` : null,
    company.yahooSymbol ? `${company.yahooSymbol.replace(/\.[A-Z]+$/, "").toLowerCase()}.com` : null,
  ].filter(Boolean);

  for (const domain of [...new Set(candidates)]) {
    const url = `https://logo.clearbit.com/${domain}`;
    const result = await fetchImage(url, 4000);
    if (result && isValidImage(result.buf, result.contentType) && result.buf.length > 300) {
      return { ...result, source: "clearbit", sourceUrl: url };
    }
  }
  return null;
}

// ── Strategy 2: Google Favicon HD ───────────────────────────────────────────

async function tryGoogleFavicon(company) {
  const nameDomains = nameToDomainCandidates(company);
  const domains = [
    company.yahooSymbol ? `${company.yahooSymbol.replace(/\.[A-Z]+$/, "").toLowerCase()}.fr` : null,
    company.yahooSymbol ? `${company.yahooSymbol.replace(/\.[A-Z]+$/, "").toLowerCase()}.com` : null,
    ...nameDomains.slice(0, 3),
  ].filter(Boolean);

  for (const domain of [...new Set(domains)]) {
    const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    const result = await fetchImage(url, 5000);
    if (result && isValidImage(result.buf, result.contentType) && result.buf.length > 500) {
      return { ...result, source: "google_favicon", sourceUrl: url };
    }
  }
  return null;
}

// ── Strategy 3: Scrape Yahoo Finance for company website then OG image ───────

async function tryYahooFinanceScrape(company) {
  if (!company.yahooSymbol) return null;
  try {
    // Fetch company profile from Yahoo Finance
    const profileUrl = `https://finance.yahoo.com/quote/${encodeURIComponent(company.yahooSymbol)}/`;
    const res = await fetch(profileUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html",
        "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract website from Yahoo Finance
    const websiteMatch = html.match(/data-testid="website"[^>]*>([^<]+)/i)
      || html.match(/"website"\s*:\s*"([^"]+)"/);
    const website = websiteMatch?.[1];

    if (website) {
      // Try clearbit with real domain
      const domain = website.replace(/https?:\/\/(www\.)?/, "").split("/")[0];
      const clearbitUrl = `https://logo.clearbit.com/${domain}`;
      const result = await fetchImage(clearbitUrl, 5000);
      if (result && isValidImage(result.buf, result.contentType)) {
        return { ...result, source: "clearbit_yahoo", sourceUrl: clearbitUrl };
      }

      // Try OG image from the website
      const siteRes = await fetch(`https://${domain}`, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(8000),
      });
      if (siteRes.ok) {
        const siteHtml = await siteRes.text();
        const ogMatch = siteHtml.match(/<meta[^>]+(?:property|name)="og:image"[^>]+content="([^"]+)"/i)
          || siteHtml.match(/content="([^"]+)"[^>]+(?:property|name)="og:image"/i);
        if (ogMatch?.[1]) {
          const imgUrl = ogMatch[1].startsWith("http") ? ogMatch[1] : `https://${domain}${ogMatch[1]}`;
          const result = await fetchImage(imgUrl, 6000);
          if (result && isValidImage(result.buf, result.contentType)) {
            return { ...result, source: "og_image", sourceUrl: imgUrl };
          }
        }
      }
    }
  } catch {}
  return null;
}

// ── Strategy 4: OpenAI web search ───────────────────────────────────────────

async function tryOpenAI(company) {
  if (!OPENAI_KEY) return null;

  try {
    const { default: OpenAI } = await import("openai").catch(() => ({ default: null }));
    if (!OpenAI) return null;

    const client = new OpenAI({ apiKey: OPENAI_KEY });

    const response = await client.chat.completions.create({
      model: "gpt-4o-search-preview",
      messages: [
        {
          role: "user",
          content: `Find the official logo image URL for "${company.name}", a French company listed on Euronext Paris (ticker: ${company.yahooSymbol ?? "unknown"}).

Search on:
- Official website of the company
- Clearbit: https://logo.clearbit.com/<domain>
- Google Favicon: https://www.google.com/s2/favicons?domain=<domain>&sz=128
- LogosWorld, Brandfetch, Wikipedia

Return ONLY the direct image URL (.png, .jpg, .svg, .webp). No explanation, just the URL.`
        }
      ],
      max_tokens: 200,
    });

    const text = response.choices[0]?.message?.content ?? "";
    const urlMatch = text.match(/https?:\/\/[^\s<>"]+\.(?:png|jpg|jpeg|svg|webp|gif)/i);
    if (!urlMatch) return null;

    const result = await fetchImage(urlMatch[0], 8000);
    if (result && isValidImage(result.buf, result.contentType)) {
      return { ...result, source: "openai", sourceUrl: urlMatch[0] };
    }
  } catch {}
  return null;
}

// ── Main processing ──────────────────────────────────────────────────────────

async function processCompany(company, stats) {
  // Try strategies in order
  const strategies = [
    () => tryClearbit(company),
    () => tryGoogleFavicon(company),
    () => tryYahooFinanceScrape(company),
    () => tryOpenAI(company),
  ];

  for (const strategy of strategies) {
    try {
      const result = await strategy();
      if (!result) continue;

      const blobUrl = await uploadToBlob(company, result.buf, result.contentType);

      if (!DRY_RUN) {
        await prisma.company.update({
          where: { id: company.id },
          data: { logoUrl: blobUrl, logoSource: result.source },
        });
      }

      stats.found++;
      stats[result.source] = (stats[result.source] ?? 0) + 1;
      return { success: true, source: result.source, url: blobUrl };
    } catch (err) {
      // Silent fail — try next strategy
    }
  }

  stats.notFound++;
  return { success: false };
}

// ── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🖼️  fetch-logos.mjs — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`   concurrency=${CONCURRENCY}  limit=${LIMIT}  reprocess=${REPROCESS}\n`);

  const where = REPROCESS
    ? {}
    : { logoUrl: null };

  const companies = await prisma.company.findMany({
    where,
    select: { id: true, name: true, slug: true, yahooSymbol: true, logoUrl: true },
    orderBy: { declarations: { _count: "desc" } },
    take: LIMIT,
  });

  console.log(`📊  ${companies.length} companies to process (${REPROCESS ? "all" : "missing logo only"})\n`);
  if (companies.length === 0) { console.log("✅  All logos already fetched!"); await prisma.$disconnect(); return; }

  const stats = { found: 0, notFound: 0 };
  let processed = 0;

  // Process in batches
  for (let i = 0; i < companies.length; i += CONCURRENCY) {
    const batch = companies.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map((c) => processCompany(c, stats)));
    processed += batch.length;
    const pct = Math.round(processed / companies.length * 100);
    process.stdout.write(`\r  Progress: ${processed}/${companies.length} (${pct}%)  found=${stats.found}  missing=${stats.notFound}  `);
    if (i + CONCURRENCY < companies.length) await new Promise(r => setTimeout(r, 300));
  }

  console.log("\n");
  console.log("══════════════════════════════════════");
  console.log("           LOGO FETCH REPORT");
  console.log("══════════════════════════════════════");
  console.log(`Total processed   : ${companies.length}`);
  console.log(`✅ Found          : ${stats.found}`);
  console.log(`❌ Not found      : ${stats.notFound}`);
  console.log(`\nBy source:`);
  for (const [k, v] of Object.entries(stats)) {
    if (k === "found" || k === "notFound") continue;
    console.log(`  ${k.padEnd(20)}: ${v}`);
  }
  console.log("══════════════════════════════════════\n");

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
