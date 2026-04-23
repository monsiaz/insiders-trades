import { NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}

const today = new Date().toISOString().split("T")[0];

const FR_STATIC_PAGES: UrlEntry[] = [
  { loc: `${BASE}/fr/`,                         changefreq: "daily",   priority: 1.0, lastmod: today },
  { loc: `${BASE}/fr/fonctionnement/`,          changefreq: "monthly", priority: 0.9, lastmod: today },
  { loc: `${BASE}/fr/methodologie/`,            changefreq: "monthly", priority: 0.9, lastmod: today },
  { loc: `${BASE}/fr/performance/`,             changefreq: "weekly",  priority: 0.9, lastmod: today },
  { loc: `${BASE}/fr/strategie/`,               changefreq: "daily",   priority: 0.8, lastmod: today },
  { loc: `${BASE}/fr/pitch/`,                   changefreq: "monthly", priority: 0.8, lastmod: today },
  { loc: `${BASE}/fr/backtest/`,                changefreq: "weekly",  priority: 0.7, lastmod: today },
  { loc: `${BASE}/fr/companies/`,               changefreq: "daily",   priority: 0.7, lastmod: today },
  { loc: `${BASE}/fr/insiders/`,                changefreq: "daily",   priority: 0.7, lastmod: today },
  { loc: `${BASE}/fr/docs/`,                    changefreq: "monthly", priority: 0.6, lastmod: today },
  { loc: `${BASE}/fr/docs/mcp/`,                changefreq: "monthly", priority: 0.5, lastmod: today },
];

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildXml(): string {
  const items = FR_STATIC_PAGES.map(({ loc, lastmod, changefreq, priority }) =>
    [
      "  <url>",
      `    <loc>${escapeXml(loc)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority.toFixed(1)}</priority>`,
      "  </url>",
    ].filter(Boolean).join("\n")
  ).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    items,
    "</urlset>",
  ].join("\n");
}

export const revalidate = 86400;

export function GET() {
  return new NextResponse(buildXml(), {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
