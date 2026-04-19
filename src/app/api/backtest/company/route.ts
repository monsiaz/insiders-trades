import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const results = await prisma.backtestResult.findMany({
    where: {
      declaration: {
        companyId,
        transactionNature: { contains: "Acquisition", mode: "insensitive" },
      },
      return90d: { not: null },
    },
    select: {
      return90d: true,
      declaration: {
        select: {
          transactionDate: true,
          insiderName: true,
          company: { select: { name: true } },
        },
      },
    },
    orderBy: { declaration: { transactionDate: "asc" } },
  });

  if (results.length === 0) {
    return NextResponse.json(
      { count: 0, avg90d: null, winRate90d: null, points: [] },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } }
    );
  }

  const r90 = results.map((r) => r.return90d!);
  const avg90d = r90.reduce((a, b) => a + b, 0) / r90.length;
  const winRate90d = (r90.filter((v) => v > 0).length / r90.length) * 100;

  const points = results.map((r) => ({
    date: r.declaration.transactionDate?.toISOString() ?? "",
    return90d: r.return90d!,
    company: r.declaration.company.name,
    insiderName: r.declaration.insiderName,
  }));

  return NextResponse.json(
    { count: results.length, avg90d, winRate90d, points },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } }
  );
}
