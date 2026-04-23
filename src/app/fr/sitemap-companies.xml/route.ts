import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toDate(d: Date | null): string {
  return (d ?? new Date()).toISOString().split("T")[0];
}

export const revalidate = 21600;

export async function GET() {
  const companies = await prisma.company.findMany({
    where: { declarations: { some: { type: "DIRIGEANTS" } } },
    select: {
      slug: true,
      declarations: { orderBy: { pubDate: "desc" }, take: 1, select: { pubDate: true } },
    },
    orderBy: { declarations: { _count: "desc" } },
  });

  const items = companies.map(({ slug, declarations }) => {
    const lastmod = toDate(declarations[0]?.pubDate ?? null);
    return [
      "  <url>",
      `    <loc>${escapeXml(`${BASE}/fr/company/${slug}`)}</loc>`,
      `    <lastmod>${lastmod}</lastmod>`,
      "    <changefreq>weekly</changefreq>",
      "    <priority>0.6</priority>",
      "  </url>",
    ].join("\n");
  }).join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    items,
    "</urlset>",
  ].join("\n");

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
    },
  });
}
