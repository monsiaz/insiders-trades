import { PrismaClient } from "@prisma/client";
import slugify from "slugify";

const prisma = new PrismaClient();

const COMPANIES = [
  { amfToken: "RS00005380", description: "Société de biotechnologies spécialisée dans les nanoparticules de hafnium.", isin: "FR0011341205", market: "Euronext Paris" },
];

async function main() {
  console.log("Seeding database...");

  for (const company of COMPANIES) {
    const { amfToken, description, isin, market } = company;

    // Fetch company name from AMF RSS
    const url = `https://bdif.amf-france.org/back/api/v1/rss?lang=fr&jetons=${amfToken}`;
    const res = await fetch(url);
    const xml = await res.text();

    const nameMatch = xml.match(/<channel><title>(.*?)<\/title>/);
    const name = nameMatch ? nameMatch[1] : amfToken;
    const slug = slugify(name, { lower: true, strict: true });

    const existing = await prisma.company.findUnique({ where: { amfToken } });
    if (!existing) {
      await prisma.company.create({
        data: { name, slug, amfToken, description, isin, market },
      });
      console.log(`Created company: ${name}`);
    } else {
      console.log(`Company already exists: ${name}`);
    }
  }

  console.log("Seed complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
