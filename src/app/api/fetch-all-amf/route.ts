/**
 * POST /api/fetch-all-amf
 * Fetches the full 10,000 most recent DD declarations from AMF,
 * inserts any that are missing from the DB, then triggers PDF parsing.
 * 
 * Designed to run in chunks: pass { offset: 0, size: 500 } then { offset: 500, size: 500 } etc.
 * Or pass { size: 10000 } to get all IDs in one shot (fast, no PDF parsing).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchDeclarationDetail } from "@/lib/amf-detail";
import slugify from "slugify";

const CRON_SECRET = process.env.CRON_SECRET;
const AMF_INFO_URL = "https://bdif.amf-france.org/back/api/v1/informations";

export const maxDuration = 300;

interface AmfInfoItem {
  id: number;
  numero: string;
  datePublication: string;
  societes: Array<{ jeton: string; raisonSociale: string; role: string }>;
}

function makeSlug(name: string, suffix: string): string {
  return `${slugify(name, { lower: true, strict: true })}-${suffix}`;
}

async function fetchAmfBatch(size: number): Promise<AmfInfoItem[]> {
  const url = new URL(AMF_INFO_URL);
  url.searchParams.set("typesDocument", "DeclarationDirigeants");
  url.searchParams.set("sort", "-datePublication");
  url.searchParams.set("size", String(size));
  url.searchParams.set("lang", "fr");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30000),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`AMF API ${res.status}`);
  const data = await res.json();
  return Object.values(data.result || {}) as AmfInfoItem[];
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const fetchSize: number = Math.min(Number(body.size ?? 10000), 10000);
  const parsePdfs: boolean = body.parsePdfs !== false;
  const parseLimit: number = Math.min(Number(body.parseLimit ?? 100), 500);

  // Step 1: Fetch all IDs from AMF
  const items = await fetchAmfBatch(fetchSize);

  // Step 2: Find which are missing from DB
  const amfIds = items.map((i) => i.numero);
  const existing = await prisma.declaration.findMany({
    where: { amfId: { in: amfIds } },
    select: { amfId: true },
  });
  const existingSet = new Set(existing.map((e) => e.amfId));
  const newItems = items.filter((i) => !existingSet.has(i.numero));

  const result = {
    fetched: items.length,
    alreadyInDb: existingSet.size,
    newDeclarations: newItems.length,
    inserted: 0,
    parsed: 0,
    errors: [] as string[],
  };

  if (newItems.length === 0) {
    return NextResponse.json({ ...result, message: "DB is up to date" });
  }

  // Step 3: Insert new declarations (without PDF parsing first)
  for (const item of newItems) {
    try {
      const societe =
        item.societes.find((s) => s.role === "SocieteConcernee") ??
        item.societes[0];
      if (!societe) continue;

      const tokenSuffix = societe.jeton.replace("RS", "").replace(/^0+/, "");
      const companyName = societe.raisonSociale.toUpperCase().trim();
      const companySlug = makeSlug(companyName, tokenSuffix);

      const company = await prisma.company.upsert({
        where: { amfToken: societe.jeton },
        update: {},
        create: { name: companyName, slug: companySlug, amfToken: societe.jeton },
      });

      const link = `https://bdif.amf-france.org/fr/details/${item.numero}?xtor=RSS-1`;
      await prisma.declaration.upsert({
        where: { amfId: item.numero },
        update: {},
        create: {
          amfId: item.numero,
          companyId: company.id,
          type: "DIRIGEANTS",
          pubDate: new Date(item.datePublication),
          link,
          description: `Déclaration dirigeants ${item.numero}`,
          pdfParsed: false,
        },
      });
      result.inserted++;
    } catch (err) {
      result.errors.push(`Insert ${item.numero}: ${String(err).slice(0, 80)}`);
    }
  }

  // Step 4: Parse PDFs for a subset of new declarations
  if (parsePdfs && result.inserted > 0) {
    const toParse = await prisma.declaration.findMany({
      where: { type: "DIRIGEANTS", pdfParsed: false },
      orderBy: { pubDate: "desc" },
      take: parseLimit,
      select: { id: true, amfId: true },
    });

    for (const decl of toParse) {
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
        result.parsed++;
      } catch (err) {
        result.errors.push(`Parse ${decl.amfId}: ${String(err).slice(0, 80)}`);
        await prisma.declaration.update({
          where: { id: decl.id },
          data: { pdfParsed: true },
        });
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Quick diagnostic
  const [total, unparsed, dbNewest, dbOldest] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: false } }),
    prisma.declaration.findFirst({
      where: { type: "DIRIGEANTS" },
      orderBy: { pubDate: "desc" },
      select: { pubDate: true, amfId: true },
    }),
    prisma.declaration.findFirst({
      where: { type: "DIRIGEANTS" },
      orderBy: { pubDate: "asc" },
      select: { pubDate: true, amfId: true },
    }),
  ]);

  return NextResponse.json({
    dbTotal: total,
    dbUnparsed: unparsed,
    dbNewest: dbNewest?.pubDate?.toISOString().split("T")[0],
    dbOldest: dbOldest?.pubDate?.toISOString().split("T")[0],
    amfAvailable: 10000,
    instructions: "POST with { size: 10000, parsePdfs: false } to sync all IDs, then POST to /api/reparse to fix parsing",
  });
}
