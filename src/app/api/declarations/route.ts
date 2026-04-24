/**
 * GET /api/declarations
 *
 * Paginated declarations for "load more" on company / insider detail pages.
 * Replaces server-side pagination (no more ?page=N in URLs).
 *
 * Query params:
 *   companyId | insiderId  – entity filter (one required)
 *   skip                   – offset (default 0)
 *   take                   – page size (default 25, max 50)
 *   type                   – DeclarationType filter (optional)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const SELECT = {
  id: true, amfId: true, type: true, pubDate: true, link: true, description: true,
  insiderName: true, insiderFunction: true, transactionNature: true,
  instrumentType: true, isin: true, unitPrice: true, volume: true,
  totalAmount: true, currency: true, transactionDate: true, transactionVenue: true,
  pdfParsed: true, signalScore: true, pctOfMarketCap: true, pctOfInsiderFlow: true,
  company: { select: { name: true, slug: true, logoUrl: true } },
  insider: { select: { name: true, slug: true } },
} as const;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const companyId  = searchParams.get("companyId")  ?? undefined;
  const insiderId  = searchParams.get("insiderId")   ?? undefined;
  const type       = searchParams.get("type")        ?? undefined;
  const skip       = Math.max(0, parseInt(searchParams.get("skip")  ?? "0",  10));
  const take       = Math.min(50, Math.max(1, parseInt(searchParams.get("take") ?? "25", 10)));

  if (!companyId && !insiderId) {
    return NextResponse.json({ error: "companyId or insiderId required" }, { status: 400 });
  }

  const where = {
    ...(companyId  ? { companyId }  : {}),
    ...(insiderId  ? { insiderId }  : {}),
    ...(type       ? { type: type as "DIRIGEANTS" | "SEUILS" | "PROSPECTUS" | "OTHER" } : {}),
  };

  const [declarations, total] = await Promise.all([
    prisma.declaration.findMany({ where, orderBy: { pubDate: "desc" }, take, skip, select: SELECT }),
    prisma.declaration.count({ where }),
  ]);

  return NextResponse.json({ declarations, total, skip, take });
}
