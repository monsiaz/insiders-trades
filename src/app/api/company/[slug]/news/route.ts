/**
 * GET /api/company/[slug]/news
 *
 * Fetches the latest 8 news headlines for a company from Yahoo Finance's
 * public RSS feed (company-filtered, free, no API key).
 *
 * URL pattern: https://feeds.finance.yahoo.com/rss/2.0/headline?s=TICKER&region=FR&lang=fr-FR
 *
 * Response:
 *   { items: [{ title, publisher, link, pubDate, description }], ticker, source }
 *
 * Cache:
 *   Edge + browser (15 min) — news moves slowly; avoid hammering Yahoo.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const revalidate = 900; // 15 minutes

interface NewsItem {
  title: string;
  publisher: string | null;
  link: string;
  pubDate: string;          // ISO 8601
  description: string | null;
}

/** Decode a small set of HTML entities found in RSS titles/descriptions. */
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
  // <field><![CDATA[…]]></field>  OR  <field>…</field>
  const cdata = new RegExp(`<${field}[^>]*><!\\[CDATA\\[(.*?)\\]\\]></${field}>`, "s");
  const plain = new RegExp(`<${field}[^>]*>(.*?)</${field}>`, "s");
  const m1 = block.match(cdata);
  if (m1) return decodeEntities(m1[1].trim());
  const m2 = block.match(plain);
  if (m2) return decodeEntities(m2[1].trim());
  return null;
}

function extractPublisher(block: string): string | null {
  // Try <source>, <dc:creator> or <author>
  for (const tag of ["source", "dc:creator", "author"]) {
    const v = extract(tag, block);
    if (v) return v;
  }
  return null;
}

function parseRssItems(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml))) {
    const block = m[1];
    const title = extract("title", block);
    const link = extract("link", block);
    const pubDate = extract("pubDate", block);
    if (!title || !link || !pubDate) continue;
    let description = extract("description", block);
    // Strip HTML tags from description + cap length for preview
    if (description) {
      description = description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (description.length > 220) description = description.slice(0, 218).trimEnd() + "\u2026";
    }
    items.push({
      title,
      link,
      pubDate: new Date(pubDate).toISOString(),
      publisher: extractPublisher(block),
      description,
    });
  }
  return items;
}

async function fetchYahooNews(symbol: string, limit = 8): Promise<NewsItem[]> {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=FR&lang=fr-FR`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124",
        Accept: "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml).slice(0, limit);
  } catch {
    return [];
  }
}

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

  if (!company.yahooSymbol) {
    return NextResponse.json(
      { items: [], ticker: null, source: "none", reason: "no-symbol" },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
        },
      }
    );
  }

  const items = await fetchYahooNews(company.yahooSymbol, 8);

  return NextResponse.json(
    {
      items,
      ticker: company.yahooSymbol,
      source: "yahoo-rss",
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    }
  );
}
