import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export async function GET() {
  try {
    const [lastDecl, dailyCounts, total] = await Promise.all([
      // Last declaration scraped — with company name
      prisma.declaration.findFirst({
        where: { type: "DIRIGEANTS" },
        orderBy: { pubDate: "desc" },
        select: {
          pubDate: true,
          company: { select: { name: true } },
        },
      }),

      // Per-day counts for the last 7 days
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT
          DATE_TRUNC('day', "pubDate" AT TIME ZONE 'Europe/Paris') AS day,
          COUNT(*)::bigint AS count
        FROM "Declaration"
        WHERE type = 'DIRIGEANTS'
          AND "pubDate" >= NOW() - INTERVAL '7 days'
        GROUP BY 1
        ORDER BY 1 DESC
        LIMIT 7
      `,

      // Total
      prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    ]);

    return NextResponse.json(
      {
        total,
        lastScrape: lastDecl
          ? {
              at: lastDecl.pubDate.toISOString(),
              company: lastDecl.company?.name ?? null,
            }
          : null,
        // Convert BigInt to number for JSON serialization
        dailyCounts: dailyCounts.map((r) => ({
          day: r.day.toISOString(),
          count: Number(r.count),
        })),
      },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  } catch {
    return NextResponse.json(
      { total: null, lastScrape: null, dailyCounts: [] },
      { status: 500 }
    );
  }
}
