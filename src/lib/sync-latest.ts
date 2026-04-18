/**
 * Core logic for fetching and persisting the latest AMF DD declarations.
 * Used by both the hourly cron (/api/sync-latest) and daily deep sync (/api/cron).
 */

import { prisma } from "@/lib/prisma";
import { fetchDeclarationDetail } from "@/lib/amf-detail";
import slugify from "slugify";

const AMF_INFO_URL = "https://bdif.amf-france.org/back/api/v1/informations";

interface AmfInfoItem {
  id: number;
  numero: string;
  datePublication: string;
  typesDocument: string[];
  societes: Array<{ jeton: string; raisonSociale: string; role: string }>;
}

export interface SyncLatestResult {
  scanned: number;
  alreadyKnown: number;
  added: number;
  enriched: number;
  errors: string[];
}

async function fetchLatestDD(size: number): Promise<AmfInfoItem[]> {
  const url = new URL(AMF_INFO_URL);
  url.searchParams.set("typesDocument", "DeclarationDirigeants");
  url.searchParams.set("sort", "-datePublication");
  url.searchParams.set("size", String(size));
  url.searchParams.set("lang", "fr");

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15000),
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`AMF informations API ${res.status}`);
  const data = await res.json();
  return (data.result || []) as AmfInfoItem[];
}

function makeSlug(name: string, suffix: string): string {
  return `${slugify(name, { lower: true, strict: true })}-${suffix}`;
}

export async function syncLatest(
  size = 100,
  enrichPdfs = true
): Promise<SyncLatestResult> {
  const items = await fetchLatestDD(size);

  // Find which amfIds are already in the DB
  const amfIds = items.map((i) => i.numero);
  const existing = await prisma.declaration.findMany({
    where: { amfId: { in: amfIds } },
    select: { amfId: true },
  });
  const existingSet = new Set(existing.map((e) => e.amfId));

  const newItems = items.filter((i) => !existingSet.has(i.numero));
  const result: SyncLatestResult = {
    scanned: items.length,
    alreadyKnown: existingSet.size,
    added: 0,
    enriched: 0,
    errors: [],
  };

  if (newItems.length === 0) return result;

  for (const item of newItems) {
    try {
      const societe =
        item.societes.find((s) => s.role === "SocieteConcernee") ??
        item.societes[0];
      if (!societe) continue;

      // Upsert company (creates if not tracked yet)
      const tokenSuffix = societe.jeton.replace("RS", "").replace(/^0+/, "");
      const companyName = societe.raisonSociale.toUpperCase().trim();
      const companySlug = makeSlug(companyName, tokenSuffix);

      const company = await prisma.company.upsert({
        where: { amfToken: societe.jeton },
        update: {},
        create: { name: companyName, slug: companySlug, amfToken: societe.jeton },
      });

      // Create declaration
      const link = `https://bdif.amf-france.org/fr/details/${item.numero}?xtor=RSS-1`;
      const decl = await prisma.declaration.upsert({
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

      result.added++;

      // Enrich immediately with PDF trade details
      if (enrichPdfs) {
        try {
          const details = await fetchDeclarationDetail(item.numero);
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
          if (details?.insiderName) result.enriched++;
        } catch (enrichErr) {
          result.errors.push(`Enrich ${item.numero}: ${String(enrichErr)}`);
          await prisma.declaration.update({
            where: { id: decl.id },
            data: { pdfParsed: true },
          });
        }
      }

      // Polite delay between PDF fetches
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      result.errors.push(`${item.numero}: ${String(err)}`);
    }
  }

  return result;
}
