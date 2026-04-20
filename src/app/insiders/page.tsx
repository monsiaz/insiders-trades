import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { InsidersClient, type InsiderRow } from "@/components/InsidersClient";

export const revalidate = 300; // Revalidate every 5 min

// Cache the Prisma query — invalidated every 5min or on demand
const getInsiders = unstable_cache(
  async () =>
    prisma.insider.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { declarations: true } },
        companies: {
          include: { company: { select: { name: true, slug: true } } },
          take: 3,
        },
        declarations: {
          orderBy: { pubDate: "desc" },
          take: 1,
          select: {
            pubDate: true,
            transactionNature: true,
            totalAmount: true,
          },
        },
      },
    }),
  ["insiders-list"],
  { revalidate: 300 }
);

export default async function InsidersPage() {
  const raw = await getInsiders();

  // Normalize + serialize for the client component (small prop shape)
  const insiders: InsiderRow[] = raw.map((i) => ({
    id: i.id,
    slug: i.slug,
    name: i.name,
    declarationCount: i._count.declarations,
    topFunction: i.companies[0]?.function ?? null,
    companies: i.companies.map((c) => c.company.name),
    lastDecl: i.declarations[0]
      ? {
          pubDate: i.declarations[0].pubDate.toISOString(),
          totalAmount: i.declarations[0].totalAmount
            ? Number(i.declarations[0].totalAmount)
            : null,
          nature: i.declarations[0].transactionNature,
        }
      : null,
  }));

  return (
    <div className="content-wrapper">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.64rem",
              fontWeight: 600,
              color: "var(--gold)",
              letterSpacing: "0.22em",
              textTransform: "uppercase",
            }}
          >
            Registre
          </span>
          <span
            style={{
              flex: 1,
              height: "1px",
              background: "var(--border-med)",
            }}
          />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.64rem",
              color: "var(--tx-3)",
              letterSpacing: "0.08em",
            }}
          >
            {insiders.length.toLocaleString("fr-FR")} dirigeants
          </span>
        </div>
        <h1
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(2.25rem, 4.5vw, 3.25rem)",
            fontWeight: 400,
            letterSpacing: "-0.015em",
            lineHeight: 1.05,
            color: "var(--tx-1)",
          }}
        >
          Dirigeants
        </h1>
        <p
          style={{
            color: "var(--tx-2)",
            fontSize: "0.9rem",
            marginTop: "6px",
            maxWidth: "520px",
            lineHeight: 1.6,
          }}
        >
          L&apos;ensemble des dirigeants français déclarant des transactions
          auprès de l&apos;AMF.
        </p>
      </div>

      <InsidersClient insiders={insiders} />
    </div>
  );
}
