import { NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

const today = new Date().toISOString().split("T")[0];

const SUB_SITEMAPS = [
  // EN (default)
  { loc: `${BASE}/sitemap-static.xml`,       lastmod: today },
  { loc: `${BASE}/sitemap-companies.xml`,    lastmod: today },
  { loc: `${BASE}/sitemap-insiders.xml`,     lastmod: today },
  // FR
  { loc: `${BASE}/fr/sitemap-static.xml`,    lastmod: today },
  { loc: `${BASE}/fr/sitemap-companies.xml`, lastmod: today },
  { loc: `${BASE}/fr/sitemap-insiders.xml`,  lastmod: today },
];

function buildXml(): string {
  const items = SUB_SITEMAPS.map(
    ({ loc, lastmod }) =>
      `  <sitemap>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`
  ).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    items,
    "</sitemapindex>",
  ].join("\n");
}

export const revalidate = 3600;

export function GET() {
  return new NextResponse(buildXml(), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
