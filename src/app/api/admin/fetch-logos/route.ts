/**
 * POST /api/admin/fetch-logos
 *
 * Server-side logo fetcher.
 * Strategy (NO Google Favicon):
 *   1. Clearbit logo API · tries multiple domain variants
 *   2. Direct website scraping (OG image / logo img tag)
 *   3. OpenAI gpt-4o-search-preview · web search for real logo URL
 *
 * Protected by CRON_SECRET.
 * Body: { limit?: number, reprocess?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import OpenAI from "openai";

const CRON_SECRET = process.env.CRON_SECRET;
const OPENAI_KEY  = process.env.OPENAI_API_KEY ?? "";
const BLOB_TOKEN  = process.env.BLOB_READ_WRITE_TOKEN ?? "";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36";

export const maxDuration = 300;

// ── Image fetch & validation ───────────────────────────────────────────────

async function fetchImage(url: string, ms = 7000): Promise<{ buf: Buffer; ct: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 300) return null;
    return { buf, ct };
  } catch { return null; }
}

function isValidImage(buf: Buffer, ct: string): boolean {
  if (!buf || buf.length < 300) return false;
  if (ct.includes("svg")) return buf.length > 100;
  if (buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (buf[0] === 0xff && buf[1] === 0xd8) return true; // JPEG
  if (buf.slice(0, 4).toString() === "RIFF") return true; // WEBP
  if (buf.slice(0, 3).toString() === "GIF") return true;
  const head = buf.slice(0, 60).toString("utf8").toLowerCase();
  if (head.includes("<svg") || head.includes("<?xml")) return true;
  return false;
}

// ── Domain generation ──────────────────────────────────────────────────────

function buildDomains(name: string, yahooSymbol: string | null): string[] {
  // Strip legal suffixes
  const clean = name
    .toLowerCase()
    .replace(/\s+(s\.a\.|s\.a\.s\.|s\.e\.|société anonyme|se|sa|sas|plc|nv|bv|inc|corp|ltd|group|groupe|holding|international|france|europe|réalités|et compagnie|& co)\.?\s*$/gi, "")
    .trim();

  const noSpace  = clean.replace(/[\s\-&',\.\(\)]/g, "");
  const dashed   = clean.replace(/[\s&',\.\(\)]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/, "");
  const ticker   = yahooSymbol?.replace(/\.[A-Z]{1,3}$/, "").toLowerCase() ?? "";

  const candidates = new Set<string>();

  // Ticker-based (most reliable for Euronext companies)
  if (ticker && ticker.length >= 2 && !ticker.includes(".")) {
    candidates.add(`${ticker}.fr`);
    candidates.add(`${ticker}.com`);
  }

  // Name-based
  for (const base of [noSpace, dashed]) {
    if (base.length >= 2) {
      candidates.add(`${base}.fr`);
      candidates.add(`${base}.com`);
      // Without accent
      const deaccented = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (deaccented !== base) {
        candidates.add(`${deaccented}.fr`);
        candidates.add(`${deaccented}.com`);
      }
    }
  }

  return [...candidates].slice(0, 12);
}

// ── Strategy 1: Clearbit ───────────────────────────────────────────────────

async function tryClearbit(name: string, yahooSymbol: string | null) {
  const domains = buildDomains(name, yahooSymbol);
  for (const domain of domains) {
    const url = `https://logo.clearbit.com/${domain}`;
    const r = await fetchImage(url, 5000);
    if (r && isValidImage(r.buf, r.ct)) {
      return { ...r, source: "clearbit", sourceUrl: url };
    }
  }
  return null;
}

// ── Strategy 2: Website OG image scraping ─────────────────────────────────

async function tryWebsiteScrape(name: string, yahooSymbol: string | null) {
  const domains = buildDomains(name, yahooSymbol).slice(0, 4);

  for (const domain of domains) {
    try {
      const siteRes = await fetch(`https://${domain}`, {
        headers: { "User-Agent": UA, "Accept": "text/html" },
        signal: AbortSignal.timeout(7000),
        redirect: "follow",
      });
      if (!siteRes.ok) continue;
      const html = await siteRes.text();

      // Extract all candidate image URLs
      const candidates: string[] = [];

      // OG image
      const og = html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        ?? html.match(/content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i);
      if (og?.[1]) candidates.push(og[1]);

      // Logo img src
      const logoImgs = [...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']*logo[^"']*)["'][^>]*/gi)];
      logoImgs.slice(0, 3).forEach((m) => candidates.push(m[1]));

      const base = `https://${domain}`;
      for (let rawUrl of candidates) {
        if (!rawUrl) continue;
        if (!rawUrl.startsWith("http")) rawUrl = rawUrl.startsWith("//") ? "https:" + rawUrl : base + (rawUrl.startsWith("/") ? "" : "/") + rawUrl;
        // Skip obvious bad ones
        if (/placeholder|default|empty|missing|avatar|icon-\d/i.test(rawUrl)) continue;
        const r = await fetchImage(rawUrl, 6000);
        if (r && isValidImage(r.buf, r.ct)) {
          return { ...r, source: "scraped", sourceUrl: rawUrl };
        }
      }
    } catch { continue; }
  }
  return null;
}

// ── Strategy 3: OpenAI web search ─────────────────────────────────────────

async function tryOpenAI(name: string, yahooSymbol: string | null) {
  if (!OPENAI_KEY) return null;
  try {
    const client = new OpenAI({ apiKey: OPENAI_KEY });
    const resp = await client.chat.completions.create({
      model: "gpt-4o-search-preview",
      messages: [{
        role: "user",
        content: `Find the official square logo image URL (PNG, JPG, SVG or WebP) for the French company "${name}"${yahooSymbol ? ` (stock ticker: ${yahooSymbol})` : ""}.

Important:
- Do NOT return Google favicon URLs (google.com/s2/favicons)
- Do NOT return Wikipedia images  
- Prefer the company's official website logo or Clearbit (https://logo.clearbit.com/<domain>)
- Return ONLY the direct image URL, nothing else
- Must end in .png, .jpg, .jpeg, .svg or .webp`
      }],
      max_tokens: 300,
    });

    const text = resp.choices[0]?.message?.content?.trim() ?? "";
    // Extract URL
    const match = text.match(/https?:\/\/[^\s<>"']+\.(?:png|jpg|jpeg|svg|webp)(?:\?[^\s<>"']*)?/i);
    if (!match) return null;
    const url = match[0];

    // Reject google favicon
    if (url.includes("google.com/s2/favicons") || url.includes("wikipedia.org")) return null;

    const r = await fetchImage(url, 8000);
    if (r && isValidImage(r.buf, r.ct)) return { ...r, source: "openai", sourceUrl: url };
  } catch {}
  return null;
}

// ── Blob upload ────────────────────────────────────────────────────────────

async function uploadToBlob(slug: string, buf: Buffer, ct: string): Promise<string> {
  const ext = ct.includes("svg") ? "svg" : ct.includes("webp") ? "webp"
    : ct.includes("gif") ? "gif" : ct.includes("jpg") || ct.includes("jpeg") ? "jpg" : "png";
  const blob = await put(`logos/${slug}.${ext}`, buf, {
    access: "public", token: BLOB_TOKEN, contentType: ct, addRandomSuffix: false,
  });
  return blob.url;
}

// ── Main handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit ?? 30), 50);

  const companies = await prisma.company.findMany({
    where: { logoUrl: null },
    select: { id: true, name: true, slug: true, yahooSymbol: true },
    orderBy: { declarations: { _count: "desc" } },
    take: limit,
  });

  const results = {
    total: companies.length,
    found: 0, notFound: 0, errors: 0,
    sources: {} as Record<string, number>,
    samples: [] as { name: string; source: string; url: string }[],
    failed: [] as string[],
  };

  for (const co of companies) {
    try {
      const strategies = [
        () => tryClearbit(co.name, co.yahooSymbol),
        () => tryWebsiteScrape(co.name, co.yahooSymbol),
        () => tryOpenAI(co.name, co.yahooSymbol),
      ];

      let found = false;
      for (const strategy of strategies) {
        const r = await strategy();
        if (!r) continue;

        const url = await uploadToBlob(co.slug, r.buf, r.ct);
        await prisma.company.update({
          where: { id: co.id },
          data: { logoUrl: url, logoSource: r.source },
        });
        results.found++;
        results.sources[r.source] = (results.sources[r.source] ?? 0) + 1;
        if (results.samples.length < 20) results.samples.push({ name: co.name, source: r.source, url });
        found = true;
        break;
      }

      if (!found) {
        results.notFound++;
        results.failed.push(co.name);
      }
    } catch (err) {
      results.errors++;
      results.failed.push(co.name + " [err]");
    }

    await new Promise(r => setTimeout(r, 600));
  }

  return NextResponse.json(results);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [noLogo, total, bySrc] = await Promise.all([
    prisma.company.count({ where: { logoUrl: null } }),
    prisma.company.count(),
    prisma.$queryRaw<{ logoSource: string; cnt: number }[]>`
      SELECT "logoSource", COUNT(*)::int AS cnt
      FROM "Company" WHERE "logoUrl" IS NOT NULL
      GROUP BY "logoSource" ORDER BY cnt DESC
    `,
  ]);
  return NextResponse.json({ withoutLogo: noLogo, total, coverage: `${(((total - noLogo) / total) * 100).toFixed(1)}%`, bySrc });
}
