/**
 * Daily deep sync (3am UTC): fetches the last 500 DD from AMF.
 * Acts as catch-up in case the hourly sync missed anything.
 * Also re-parses any incomplete declarations found in the DB.
 */
import { NextRequest, NextResponse } from "next/server";
import { syncLatest } from "@/lib/sync-latest";
import { enrichCompanyFinancials } from "@/lib/financials";
import { scoreDeclarations } from "@/lib/signals";
import { gptGenderForUnknownInsiders } from "@/lib/gender-gpt";
import { prisma } from "@/lib/prisma";
import { fetchDeclarationDetail } from "@/lib/amf-detail";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch latest 500 declarations from AMF (with PDF parsing)
    const syncResult = await syncLatest(500, true);

    // 2. Re-parse up to 30 declarations that are missing key fields
    //    (catches stragglers from the backlog or failed previous parses)
    const reparsed = await reparseIncomplete(30);

    // 3. Enrich company financials (market cap, income, analyst data)
    await enrichCompanyFinancials(80).catch((e) => console.error("[cron] fin:", e));

    // 4. Score any declarations that haven't been scored yet
    await scoreDeclarations(false).catch((e) => console.error("[cron] score:", e));

    // 5. GPT-4o gender classification for insiders still unknown after local heuristics
    //    (capped at 200 to stay well within Vercel's 5-min timeout)
    const genderResult = await gptGenderForUnknownInsiders({
      maxInsiders: 200,
      apiKey: process.env.OPENAI_API_KEY,
    }).catch((e) => { console.error("[cron] gender-gpt:", e); return { resolved: 0, skipped: 0, errors: 1 }; });

    return NextResponse.json({
      success: true,
      source: "daily-deep-sync",
      ...syncResult,
      reparsed,
      genderGpt: genderResult,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * Re-parse up to `limit` declarations that are missing ISIN or amount.
 * Prioritizes the most recent ones first.
 */
async function reparseIncomplete(limit: number): Promise<{ improved: number; errors: number }> {
  const decls = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      OR: [
        { pdfParsed: false },
        { pdfParsed: true, isin: null },
        { pdfParsed: true, totalAmount: null, volume: { not: null } },
      ],
    },
    orderBy: { pubDate: "desc" },
    take: limit,
    select: { id: true, amfId: true },
  });

  let improved = 0;
  let errors = 0;

  for (const decl of decls) {
    try {
      const details = await fetchDeclarationDetail(decl.amfId);
      await prisma.declaration.update({
        where: { id: decl.id },
        data: {
          pdfParsed: true,
          insiderName: details?.insiderName ?? undefined,
          insiderFunction: details?.insiderFunction ?? undefined,
          transactionNature: details?.transactionNature ?? undefined,
          instrumentType: details?.instrumentType ?? undefined,
          isin: details?.isin ?? undefined,
          unitPrice: details?.unitPrice ?? undefined,
          volume: details?.volume ?? undefined,
          totalAmount: details?.totalAmount ?? undefined,
          currency: details?.currency ?? undefined,
          transactionDate: details?.transactionDate ?? undefined,
          transactionVenue: details?.transactionVenue ?? undefined,
          pdfUrl: details?.pdfUrl ?? undefined,
        },
      });
      if (details?.isin || details?.totalAmount || details?.insiderName) improved++;
    } catch {
      errors++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return { improved, errors };
}
