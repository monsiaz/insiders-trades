import { prisma } from "./prisma";
import { fetchAmfRss, parseDeclarationType, extractAmfId } from "./amf";

export async function syncCompany(companyId: string): Promise<{
  added: number;
  skipped: number;
  errors: string[];
}> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error(`Company ${companyId} not found`);

  const feed = await fetchAmfRss(company.amfToken);
  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of feed.items) {
    try {
      const amfId = extractAmfId(item.description);
      const type = parseDeclarationType(item.description);
      const pubDate = new Date(item["dc:date"] || item.pubDate);

      const existing = await prisma.declaration.findUnique({
        where: { amfId },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.declaration.create({
        data: {
          amfId,
          companyId: company.id,
          type,
          pubDate,
          link: item.link,
          description: item.description,
          rawData: { title: item.title, guid: item.guid },
        },
      });

      added++;
    } catch (err) {
      errors.push(`Error processing ${item.description}: ${err}`);
    }
  }

  await prisma.company.update({
    where: { id: companyId },
    data: { updatedAt: new Date() },
  });

  return { added, skipped, errors };
}

export async function syncAllCompanies(): Promise<{
  company: string;
  added: number;
  skipped: number;
  errors: string[];
}[]> {
  const companies = await prisma.company.findMany();
  const results = [];

  for (const company of companies) {
    try {
      const result = await syncCompany(company.id);
      results.push({ company: company.name, ...result });
    } catch (err) {
      results.push({
        company: company.name,
        added: 0,
        skipped: 0,
        errors: [`Sync failed: ${err}`],
      });
    }
  }

  return results;
}
