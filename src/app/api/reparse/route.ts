/**
 * POST /api/reparse
 * Re-parse PDFs for declarations that are missing key fields.
 * 
 * Body: { mode: "missing-isin" | "missing-amount" | "missing-insider" | "all-incomplete" | "unparsed", limit: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchDeclarationDetail } from "@/lib/amf-detail";

const CRON_SECRET = process.env.CRON_SECRET;

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode: string = body.mode ?? "missing-isin";
  const limit: number = Math.min(Number(body.limit ?? 200), 500);
  const debugMode: boolean = body.debug === true;

  // Build where clause based on mode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let where: any = { type: "DIRIGEANTS" };

  switch (mode) {
    case "missing-isin":
      where = { type: "DIRIGEANTS", pdfParsed: true, isin: { equals: null } };
      break;
    case "missing-amount":
      where = { type: "DIRIGEANTS", pdfParsed: true, totalAmount: { equals: null } };
      break;
    case "missing-insider":
      where = { type: "DIRIGEANTS", pdfParsed: true, insiderName: { equals: null } };
      break;
    case "all-incomplete":
      where = {
        type: "DIRIGEANTS",
        pdfParsed: true,
        OR: [
          { isin: { equals: null } },
          { totalAmount: { equals: null } },
          { insiderName: { equals: null } },
        ],
      };
      break;
    case "unparsed":
      where = { type: "DIRIGEANTS", pdfParsed: false };
      break;
  }

  const declarations = await prisma.declaration.findMany({
    where,
    orderBy: { pubDate: "desc" },
    take: limit,
    select: { id: true, amfId: true, pdfUrl: true, transactionNature: true },
  });

  const results = {
    mode,
    processed: 0,
    improved: 0,
    noChange: 0,
    errors: [] as string[],
    debugSamples: [] as unknown[],
  };

  for (const decl of declarations) {
    try {
      const details = await fetchDeclarationDetail(decl.amfId);

      if (!details) {
        results.errors.push(`${decl.amfId}: no details returned`);
        await prisma.declaration.update({
          where: { id: decl.id },
          data: { pdfParsed: true },
        });
        continue;
      }

      if (debugMode && results.debugSamples.length < 3) {
        results.debugSamples.push({ amfId: decl.amfId, details });
      }

      const hasImprovement =
        details.isin != null ||
        details.totalAmount != null ||
        details.insiderName != null ||
        details.volume != null ||
        details.transactionDate != null;

      await prisma.declaration.update({
        where: { id: decl.id },
        data: {
          pdfParsed: true,
          insiderName: details.insiderName ?? undefined,
          insiderFunction: details.insiderFunction ?? undefined,
          transactionNature: details.transactionNature ?? undefined,
          instrumentType: details.instrumentType ?? undefined,
          isin: details.isin ?? undefined,
          unitPrice: details.unitPrice ?? undefined,
          volume: details.volume ?? undefined,
          totalAmount: details.totalAmount ?? undefined,
          currency: details.currency ?? undefined,
          transactionDate: details.transactionDate ?? undefined,
          transactionVenue: details.transactionVenue ?? undefined,
          pdfUrl: details.pdfUrl ?? undefined,
        },
      });

      if (hasImprovement) results.improved++;
      else results.noChange++;
      results.processed++;
    } catch (err) {
      results.errors.push(`${decl.amfId}: ${String(err).slice(0, 100)}`);
    }

    // Polite delay
    await new Promise((r) => setTimeout(r, 300));
  }

  return NextResponse.json(results);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Return counts of what needs re-parsing
  const [
    total,
    parsed,
    missingIsin,
    missingAmount,
    missingInsider,
    unparsed,
    allIncomplete,
  ] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true, isin: null } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true, totalAmount: null } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true, insiderName: null } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: false } }),
    prisma.declaration.count({
      where: {
        type: "DIRIGEANTS",
        pdfParsed: true,
        OR: [{ isin: null }, { totalAmount: null }, { insiderName: null }],
      },
    }),
  ]);

  return NextResponse.json({
    total,
    parsed,
    missingIsin,
    missingAmount,
    missingInsider,
    unparsed,
    allIncomplete,
    coverage: {
      parsed: `${((parsed / total) * 100).toFixed(1)}%`,
      withIsin: `${(((parsed - missingIsin) / total) * 100).toFixed(1)}%`,
      withAmount: `${(((parsed - missingAmount) / total) * 100).toFixed(1)}%`,
    },
  });
}
