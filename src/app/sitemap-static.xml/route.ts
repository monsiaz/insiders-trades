import { NextResponse } from "next/server";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

interface UrlEntry {
  loc: string;
  lastmod?: string;
  changefreq: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority: number;
}

const today = new Date().toISOString().split("T")[0];

const STATIC_PAGES: UrlEntry[] = [
  // ── Home ──────────────────────────────────────────────
  { loc: `${BASE}/`,                        changefreq: "daily",   priority: 1.0, lastmod: today },

  // ── Core marketing / methodology ──────────────────────
  { loc: `${BASE}/fonctionnement/`,         changefreq: "monthly", priority: 0.9, lastmod: today },
  { loc: `${BASE}/methodologie/`,           changefreq: "monthly", priority: 0.9, lastmod: today },
  { loc: `${BASE}/performance/`,            changefreq: "weekly",  priority: 0.9, lastmod: today },
  { loc: `${BASE}/strategie/`,              changefreq: "daily",   priority: 0.8, lastmod: today },
  { loc: `${BASE}/pitch/`,                  changefreq: "monthly", priority: 0.8, lastmod: today },

  // ── Platform features (visible before signup) ─────────
  { loc: `${BASE}/backtest/`,               changefreq: "weekly",  priority: 0.7, lastmod: today },
  { loc: `${BASE}/companies/`,              changefreq: "daily",   priority: 0.7, lastmod: today },
  { loc: `${BASE}/insiders/`,               changefreq: "daily",   priority: 0.7, lastmod: today },

  // ── Documentation / API ───────────────────────────────
  { loc: `${BASE}/docs/`,                   changefreq: "monthly", priority: 0.6, lastmod: today },
  { loc: `${BASE}/docs/mcp/`,               changefreq: "monthly", priority: 0.5, lastmod: today },
];

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildXml(): string {
  const items = STATIC_PAGES.map(({ loc, lastmod, changefreq, priority }) => {
    const lines = [
      "  <url>",
      `    <loc>${escapeXml(loc)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
      `    <changefreq>${changefreq}</changefreq>`,
      `    <priority>${priority.toFixed(1)}</priority>`,
      "  </url>",
    ]
      .filter(Boolean)
      .join("\n");
    return lines;
  }).join("\n");

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
