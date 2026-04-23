/**
 * GET /api/company/[slug]/news?locale=en|fr
 *
 * Strategy:
 *   EN locale:
 *     1. Google News RSS in English (hl=en) → instant, free, covers major caps.
 *     2. If ≥ 3 EN results → return them.
 *     3. Otherwise fetch FR RSS, upsert in DB, return titleEn (OpenAI-translated)
 *        where available, fall back to titleFr for the rest.
 *   FR locale:
 *     Fetch FR RSS (as before), upsert in DB (so cron can translate them later).
 *
 * Cache: s-maxage=900 (15 min) + SWR=3600 (1h)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const revalidate = 900;

interface NewsItem {
  title: string;
  publisher: string | null;
  link: string;
  pubDate: string;          // ISO 8601
  description: string | null;
  titleEn?: string | null;  // translation (EN only)
}

// ── RSS parsing ───────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&rsquo;/g, "\u2019").replace(/&lsquo;/g, "\u2018")
    .replace(/&ldquo;/g, "\u201C").replace(/&rdquo;/g, "\u201D")
    .replace(/&mdash;/g, "\u2014").replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extract(field: string, block: string): string | null {
  const cdata = new RegExp(`<${field}[^>]*><!\\[CDATA\\[(.*?)\\]\\]></${field}>`, "s");
  const plain = new RegExp(`<${field}[^>]*>(.*?)</${field}>`, "s");
  return block.match(cdata)?.[1]?.trim() ?? block.match(plain)?.[1]?.trim() ?? null;
}

function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const re = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[1];
    let title = extract("title", block);
    const link = extract("link", block);
    const pubDate = extract("pubDate", block);
    if (!title || !link || !pubDate) continue;
    title = decodeEntities(title);

    let publisher: string | null =
      extract("source", block) ?? extract("dc:creator", block) ?? extract("author", block);
    if (publisher) publisher = decodeEntities(publisher.replace(/<[^>]+>/g, "").trim());
    if (!publisher) {
      const splitAt = title.lastIndexOf(" - ");
      if (splitAt > 20 && splitAt < title.length - 3) {
        const candidate = title.slice(splitAt + 3).trim();
        if (candidate.length < 45 && !candidate.includes(":")) {
          publisher = candidate;
          title = title.slice(0, splitAt).trim();
        }
      }
    }

    let description = extract("description", block);
    if (description) {
      description = decodeEntities(description).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (description.length > 220) description = description.slice(0, 218).trimEnd() + "\u2026";
      if (description.toLowerCase().startsWith(title.toLowerCase().slice(0, 30))) description = null;
    }

    let iso: string;
    try { iso = new Date(pubDate).toISOString(); } catch { continue; }
    items.push({ title, link, pubDate: iso, publisher, description: description ?? null });
  }
  return items;
}

// ── News sources ──────────────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124";

async function fetchGoogleNews(query: string, lang: "fr" | "en"): Promise<NewsItem[]> {
  const hl  = lang === "en" ? "en" : "fr";
  const gl  = lang === "en" ? "US" : "FR";
  const ced = lang === "en" ? "US:en" : "FR:fr";
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${hl}&gl=${gl}&ceid=${ced}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch { return []; }
}

async function fetchYahooRss(symbol: string, lang: "fr" | "en"): Promise<NewsItem[]> {
  const region = lang === "en" ? "US" : "FR";
  const locale = lang === "en" ? "en-US" : "fr-FR";
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=${region}&lang=${locale}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch { return []; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function linkHash(link: string): string {
  return createHash("sha256").update(link).digest("hex").slice(0, 16);
}

function normalizeTitle(t: string): string {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().slice(0, 60);
}

function dedupe(all: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const n of all) {
    const key = normalizeTitle(n.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

// ── DB cache helpers ──────────────────────────────────────────────────────────

async function upsertNewsItems(companySlug: string, items: NewsItem[]): Promise<void> {
  if (!items.length) return;
  await Promise.all(
    items.map((n) =>
      prisma.companyNewsItem.upsert({
        where: { linkHash: linkHash(n.link) },
        update: {}, // don't overwrite titleEn if already translated
        create: {
          companySlug,
          linkHash:  linkHash(n.link),
          link:      n.link,
          titleFr:   n.title,
          publisher: n.publisher ?? null,
          pubDate:   new Date(n.pubDate),
          description: n.description ?? null,
        },
      })
    )
  );
}

async function getTranslatedTitles(companySlug: string, links: string[]):
  Promise<Map<string, { titleEn: string | null; descriptionEn: string | null }>> {
  const hashes = links.map(linkHash);
  const rows = await prisma.companyNewsItem.findMany({
    where: { companySlug, linkHash: { in: hashes } },
    select: { linkHash: true, titleEn: true, descriptionEn: true },
  });
  const map = new Map<string, { titleEn: string | null; descriptionEn: string | null }>();
  for (const r of rows) map.set(r.linkHash, { titleEn: r.titleEn, descriptionEn: r.descriptionEn });
  return map;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const locale   = (req.nextUrl.searchParams.get("locale") ?? "fr") as "en" | "fr";
  const isEn     = locale === "en";

  const company = await prisma.company.findUnique({
    where: { slug },
    select: { name: true, yahooSymbol: true },
  });
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nameQ = company.name.replace(/\s+/g, " ").trim();

  // ── EN path: try English Google News first ──────────────────────────────────
  if (isEn) {
    const enTasks: Promise<NewsItem[]>[] = [
      fetchGoogleNews(`"${nameQ}" stock insider`, "en"),
      fetchGoogleNews(`"${nameQ}" shares`, "en"),
    ];
    if (company.yahooSymbol) enTasks.push(fetchYahooRss(company.yahooSymbol, "en"));

    const enPools = await Promise.all(enTasks);
    const enItems = dedupe(enPools.flat())
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
      .slice(0, 10);

    // If we have enough quality English news, return it directly
    if (enItems.length >= 3) {
      return NextResponse.json(
        { items: enItems, ticker: company.yahooSymbol ?? null, source: "google-news-en", fetchedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
      );
    }
  }

  // ── FR path (also used as fallback for EN when no English results) ──────────
  const frTasks: Promise<NewsItem[]>[] = [
    fetchGoogleNews(`"${nameQ}" action bourse`, "fr"),
    fetchGoogleNews(`"${nameQ}" résultats`, "fr"),
  ];
  if (company.yahooSymbol) frTasks.push(fetchYahooRss(company.yahooSymbol, "fr"));

  const frPools = await Promise.all(frTasks);
  const frItems = dedupe(frPools.flat())
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 10);

  // Store in DB for background translation (fire-and-forget)
  upsertNewsItems(slug, frItems).catch(() => {});

  // If EN locale: merge with DB translations where available
  if (isEn) {
    const translations = await getTranslatedTitles(slug, frItems.map((n) => n.link));
    const merged: NewsItem[] = frItems.map((n) => {
      const t = translations.get(linkHash(n.link));
      return {
        ...n,
        title:       t?.titleEn ?? n.title,   // EN translation or original FR
        description: t?.descriptionEn ?? n.description,
      };
    });
    return NextResponse.json(
      { items: merged, ticker: company.yahooSymbol ?? null, source: "google-news-fr+db-translations", fetchedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
    );
  }

  return NextResponse.json(
    { items: frItems, ticker: company.yahooSymbol ?? null, source: "google-news+yahoo", fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
  );
}
