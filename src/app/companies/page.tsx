import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { SyncButton } from "@/components/SyncButton";
import { CompaniesClient, type CompanyRow } from "@/components/CompaniesClient";

export const revalidate = 300; // Revalidate every 5 min

// Cache the Prisma query — invalidated every 5min or on demand
const getCompaniesWithDecl = unstable_cache(
  async () => prisma.company.findMany({
    where: { declarations: { some: { type: "DIRIGEANTS" } } },
    select: {
      id: true, name: true, slug: true, amfToken: true,
      marketCap: true, yahooSymbol: true, currentPrice: true, logoUrl: true,
      _count: { select: { declarations: { where: { type: "DIRIGEANTS" } } } },
      declarations: {
        where: { type: "DIRIGEANTS" },
        orderBy: { pubDate: "desc" },
        take: 1,
        select: { pubDate: true, insiderName: true, transactionNature: true, totalAmount: true },
      },
    },
    orderBy: { name: "asc" },
  }),
  ["companies-with-decl"],
  { revalidate: 300 }
);

const getAllCompanies = unstable_cache(
  async () => prisma.company.findMany({
    select: {
      id: true, name: true, slug: true, amfToken: true,
      marketCap: true, yahooSymbol: true, currentPrice: true, logoUrl: true,
      _count: { select: { declarations: { where: { type: "DIRIGEANTS" } } } },
      declarations: {
        where: { type: "DIRIGEANTS" },
        orderBy: { pubDate: "desc" },
        take: 1,
        select: { pubDate: true, insiderName: true, transactionNature: true, totalAmount: true },
      },
    },
    orderBy: { name: "asc" },
  }),
  ["companies-all"],
  { revalidate: 300 }
);

interface Props {
  searchParams: Promise<{ all?: string; q?: string }>;
}

export default async function CompaniesPage({ searchParams }: Props) {
  const { all, q } = await searchParams;
  const showAll = all === "1";

  const raw = await (showAll ? getAllCompanies() : getCompaniesWithDecl());

  // dead code kept for TypeScript type inference only — replaced by cached queries above
  if (false) await prisma.company.findMany({
    where: showAll ? undefined : { declarations: { some: { type: "DIRIGEANTS" } } },
      select: {
      id: true,
      name: true,
      slug: true,
      amfToken: true,
      marketCap: true,
      yahooSymbol: true,
      currentPrice: true,
      logoUrl: true,
      _count: { select: { declarations: { where: { type: "DIRIGEANTS" } } } },
      declarations: {
        where: { type: "DIRIGEANTS" },
        orderBy: { pubDate: "desc" },
        take: 1,
        select: {
          pubDate: true,
          insiderName: true,
          transactionNature: true,
          totalAmount: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const companies: CompanyRow[] = raw.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    amfToken: c.amfToken,
    marketCap: c.marketCap ? Number(c.marketCap) : null,
    yahooSymbol: c.yahooSymbol,
    currentPrice: c.currentPrice,
    logoUrl: c.logoUrl ?? null,
    declarationCount: c._count.declarations,
    lastDecl: c.declarations[0]
      ? {
          pubDate: c.declarations[0].pubDate.toISOString(),
          insiderName: c.declarations[0].insiderName,
          transactionNature: c.declarations[0].transactionNature,
          totalAmount: c.declarations[0].totalAmount
            ? Number(c.declarations[0].totalAmount)
            : null,
        }
      : null,
  }));

  return (
    <div className="content-wrapper">
      {/* Header — editorial masthead */}
      <div className="mb-8">
        <div className="masthead-dateline">
          <span className="masthead-folio">Cotation</span>
          <span className="masthead-rule" aria-hidden="true" />
          <span className="masthead-count">
            {companies.length.toLocaleString("fr-FR")} sociétés
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1
              style={{
                fontFamily: "var(--font-dm-serif), Georgia, serif",
                fontSize: "clamp(2rem, 5vw, 3.25rem)",
                fontWeight: 400,
                letterSpacing: "-0.015em",
                lineHeight: 1.05,
                color: "var(--tx-1)",
              }}
            >
              Sociétés
            </h1>
            <p style={{ color: "var(--tx-2)", fontSize: "0.9rem", marginTop: "6px", lineHeight: 1.6, maxWidth: "480px" }}>
              {!showAll
                ? "Toutes les sociétés cotées ayant fait l'objet d'une déclaration de dirigeant à l'AMF."
                : "L'ensemble des sociétés françaises référencées dans la base."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "2px",
                padding: "3px",
                background: "var(--bg-raised)",
                border: "1px solid var(--border-med)",
                borderRadius: "6px",
              }}
            >
              <Link
                href="/companies"
                style={{
                  padding: "5px 10px",
                  borderRadius: "3px",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  letterSpacing: "0.02em",
                  background: !showAll ? "var(--gold-bg)" : "transparent",
                  color: !showAll ? "var(--gold)" : "var(--tx-3)",
                }}
              >
                Avec décl.
              </Link>
              <Link
                href="/companies?all=1"
                style={{
                  padding: "5px 10px",
                  borderRadius: "3px",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  letterSpacing: "0.02em",
                  background: showAll ? "var(--gold-bg)" : "transparent",
                  color: showAll ? "var(--gold)" : "var(--tx-3)",
                }}
              >
                Toutes
              </Link>
            </div>
            <SyncButton />
            <Link href="/companies/add" className="btn btn-primary" style={{ fontSize: "0.8rem" }}>
              + Ajouter
            </Link>
          </div>
        </div>
      </div>

      {/* Client component: search + filters + grid */}
      <Suspense fallback={
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="card p-5" style={{ height: "140px", animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
      }>
        <CompaniesClient companies={companies} initialQ={q} />
      </Suspense>
    </div>
  );
}
