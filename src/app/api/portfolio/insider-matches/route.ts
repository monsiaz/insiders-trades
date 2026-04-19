import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const isinsParam = req.nextUrl.searchParams.get("isins") ?? "";
  const namesParam = req.nextUrl.searchParams.get("names") ?? "";

  const isins = isinsParam.split(",").map((s) => s.trim()).filter(Boolean);
  const names = namesParam.split(",").map((s) => s.trim()).filter(Boolean);

  if (!isins.length && !names.length) return NextResponse.json({ matches: [] });

  const since = new Date(Date.now() - 365 * 24 * 3600 * 1000); // last 12 months

  // Find declarations for these ISINs or company names
  const declarations = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      pdfParsed: true,
      pubDate: { gte: since },
      transactionNature: { contains: "Acqui", mode: "insensitive" },
      OR: [
        ...(isins.length ? [{ isin: { in: isins } }] : []),
        ...(names.length ? names.map((n) => ({ company: { name: { contains: n.split(" ")[0], mode: "insensitive" as const } } })) : []),
      ],
    },
    select: {
      id: true, insiderName: true, insiderFunction: true,
      totalAmount: true, transactionDate: true, transactionNature: true,
      signalScore: true, isin: true,
      company: { select: { name: true, slug: true } },
    },
    orderBy: { transactionDate: "desc" },
    take: 100,
  });

  // Group by position
  const matchMap = new Map<string, typeof declarations>();
  for (const decl of declarations) {
    // Match by ISIN first
    let posName: string | null = null;
    if (decl.isin && isins.includes(decl.isin)) {
      posName = decl.isin;
    } else {
      // Match by company name
      for (const n of names) {
        if (decl.company.name.toLowerCase().includes(n.split(" ")[0].toLowerCase())) {
          posName = n;
          break;
        }
      }
    }
    if (!posName) continue;
    if (!matchMap.has(posName)) matchMap.set(posName, []);
    matchMap.get(posName)!.push(decl);
  }

  // Resolve ISIN keys to position names
  const positions = await prisma.portfolioPosition.findMany({
    where: { userId: session.userId },
    select: { name: true, isin: true },
  });

  const matches = [...matchMap.entries()].map(([key, decls]) => {
    const pos = positions.find((p) => p.isin === key || p.name === key);
    return { positionName: pos?.name ?? key, declarations: decls.slice(0, 5) };
  });

  return NextResponse.json({ matches });
}
