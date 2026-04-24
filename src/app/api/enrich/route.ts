import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchDeclarationDetail } from "@/lib/amf-detail";
import { getCurrentUser } from "@/lib/auth";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // Accept either a cron/server call (Bearer CRON_SECRET) or an admin user session
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { limit = 20, companyId } = body;

    // Get unparsed DD declarations
    const declarations = await prisma.declaration.findMany({
      where: {
        type: "DIRIGEANTS",
        pdfParsed: false,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { pubDate: "desc" },
      take: limit,
      select: { id: true, amfId: true, companyId: true },
    });

    if (declarations.length === 0) {
      return NextResponse.json({ success: true, enriched: 0, message: "Nothing to enrich" });
    }

    let enriched = 0;
    let failed = 0;

    await Promise.allSettled(
      declarations.map(async (decl) => {
        try {
          const details = await fetchDeclarationDetail(decl.amfId);
          
          await prisma.declaration.update({
            where: { id: decl.id },
            data: {
              pdfParsed: true,
              insiderName: details?.insiderName ?? null,
              insiderFunction: details?.insiderFunction ?? null,
              transactionNature: details?.transactionNature ?? null,
              instrumentType: details?.instrumentType ?? null,
              isin: details?.isin ?? null,
              unitPrice: details?.unitPrice ?? null,
              volume: details?.volume ?? null,
              totalAmount: details?.totalAmount ?? null,
              currency: details?.currency ?? null,
              transactionDate: details?.transactionDate ?? null,
              transactionVenue: details?.transactionVenue ?? null,
              pdfUrl: details?.pdfUrl ?? null,
            },
          });
          enriched++;
        } catch (err) {
          console.error(`Enrich failed for ${decl.amfId}:`, err);
          // Mark as parsed to avoid retrying indefinitely
          await prisma.declaration.update({
            where: { id: decl.id },
            data: { pdfParsed: true },
          });
          failed++;
        }
      })
    );

    return NextResponse.json({ success: true, enriched, failed, total: declarations.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
