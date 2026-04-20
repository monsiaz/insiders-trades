/**
 * GET /api/company/[slug]/news
 *
 * Returns the latest news headlines for a company. Strategy:
 *   1. Google News RSS (company name + "action Bourse" query) — primary.
 *      Free, reliable, FR-filtered, covers small & mid caps.
 *   2. Yahoo Finance RSS by ticker — fallback for larger caps.
 *
 * Both results are merged + deduplicated, sorted by pubDate, capped at 10.
 *
 * Cache: s-maxage=900 (15 min) + SWR=3600 (1h) — news moves slowly.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const revalidate = 900;

interface NewsItem {
  title: string;
  publisher: string | null;
  link: string;
  pubDate: string;          // ISO 8601
  description: string | null;
}

// ── RSS parsing ──────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&hellip;/g, "\u2026")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function extract(field: string, block: string): string | null {
  const cdata = new RegExp(`<${field}[^>]*><!\\[CDATA\\[(.*?)\\]\\]></${field}>`, "s");
  const plain = new RegExp(`<${field}[^>]*>(.*?)</${field}>`, "s");
  return (
    block.match(cdata)?.[1]?.trim() ??
    block.match(plain)?.[1]?.trim() ??
    null
  );
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

    // Google News titles often end with " - Publisher" — extract publisher
    let publisher: string | null =
      extract("source", block) ??
      extract("dc:creator", block) ??
      extract("author", block);
    if (publisher) publisher = decodeEntities(publisher.replace(/<[^>]+>/g, "").trim());

    // If no explicit <source> but title has " - Pub", split it
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
      description = decodeEntities(description)
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (description.length > 220) description = description.slice(0, 218).trimEnd() + "\u2026";
      // Google News descriptions often just repeat the title — skip if too similar
      const lcDesc = description.toLowerCase();
      const lcTitle = title.toLowerCase();
      if (lcDesc.startsWith(lcTitle.slice(0, 30))) description = null;
    }

    let iso: string;
    try {
      iso = new Date(pubDate).toISOString();
    } catch {
      continue;
    }

    items.push({ title, link, pubDate: iso, publisher, description });
  }
  return items;
}

// ── News sources ─────────────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124";

async function fetchGoogleNews(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=fr&gl=FR&ceid=FR:fr`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch {
    return [];
  }
}

async function fetchYahooRss(symbol: string): Promise<NewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=FR&lang=fr-FR`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    return parseRss(await res.text());
  } catch {
    return [];
  }
}

// ── De-duplication + sorting ─────────────────────────────────────────────────

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 60);
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

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const company = await prisma.company.findUnique({
    where: { slug },
    select: { name: true, yahooSymbol: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Build Google News query: full company name + "bourse" keyword to bias
  // towards financial news and away from unrelated brand mentions.
  const nameQ = company.name.replace(/\s+/g, " ").trim();
  const queries = [
    `"${nameQ}" action bourse`,
    `"${nameQ}" résultats`,
  ];

  const tasks: Promise<NewsItem[]>[] = [
    ...queries.map(fetchGoogleNews),
  ];
  if (company.yahooSymbol) {
    tasks.push(fetchYahooRss(company.yahooSymbol));
  }

  const pools = await Promise.all(tasks);
  const merged = pools.flat();
  const deduped = dedupe(merged)
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
    .slice(0, 10);

  return NextResponse.json(
    {
      items: deduped,
      ticker: company.yahooSymbol ?? null,
      source: "google-news+yahoo",
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    }
  );
}
