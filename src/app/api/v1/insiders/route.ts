import { NextRequest, NextResponse } from "next/server";
import { requireApiKey, withMeta, freshness } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ctx = await requireApiKey(req);
  if (ctx instanceof NextResponse) return ctx;

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = clamp(Number(url.searchParams.get("limit") ?? 50), 1, 200);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

  const where = q
    ? { name: { contains: q, mode: "insensitive" as const } }
    : {};

  const [total, items] = await Promise.all([
    prisma.insider.count({ where }),
    prisma.insider.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { name: "asc" },
      select: {
        name: true, slug: true, gender: true,
        _count: { select: { declarations: true, companies: true } },
      },
    }),
  ]);

  return NextResponse.json(
    withMeta(
      {
        total, offset, limit,
        items: items.map((i) => ({
          name: i.name,
          slug: i.slug,
          gender: i.gender,
          declarationsCount: i._count.declarations,
          companiesCount: i._count.companies,
        })),
      },
      { startedAt: ctx.startedAt }
    )
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}
