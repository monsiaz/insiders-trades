import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Suspense } from "react";
import { SyncButton } from "@/components/SyncButton";
import { CompaniesClient, type CompanyRow } from "@/components/CompaniesClient";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ all?: string; q?: string }>;
}

export default async function CompaniesPage({ searchParams }: Props) {
  const { all, q } = await searchParams;
  const showAll = all === "1";

  const raw = await prisma.company.findMany({
    where: showAll ? undefined : {
      declarations: { some: { type: "DIRIGEANTS" } },
    },
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="heading-page">Sociétés</h1>
          <p style={{ color: "var(--tx-3)", fontSize: "0.875rem", marginTop: "4px" }}>
            {companies.length.toLocaleString("fr-FR")} société{companies.length !== 1 ? "s" : ""}
            {!showAll && " avec déclarations de dirigeants"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncButton />
          {/* Avec déclarations / Toutes toggle */}
          <div style={{
            display: "flex", alignItems: "center", gap: "2px",
            padding: "3px", background: "var(--bg-raised)",
            border: "1px solid var(--border)", borderRadius: "10px",
          }}>
            <Link
              href="/companies"
              style={{
                padding: "5px 12px", borderRadius: "8px",
                fontSize: "0.75rem", fontWeight: 700,
                textDecoration: "none", transition: "all 0.15s",
                background: !showAll ? "var(--c-indigo-bg)" : "transparent",
                color: !showAll ? "var(--c-indigo-2)" : "var(--tx-3)",
                outline: !showAll ? "1px solid var(--c-indigo-bd)" : "none",
              }}
            >
              Avec décl.
            </Link>
            <Link
              href="/companies?all=1"
              style={{
                padding: "5px 12px", borderRadius: "8px",
                fontSize: "0.75rem", fontWeight: 700,
                textDecoration: "none", transition: "all 0.15s",
                background: showAll ? "var(--c-indigo-bg)" : "transparent",
                color: showAll ? "var(--c-indigo-2)" : "var(--tx-3)",
                outline: showAll ? "1px solid var(--c-indigo-bd)" : "none",
              }}
            >
              Toutes
            </Link>
          </div>
          <Link href="/companies/add" className="btn btn-primary">
            + Ajouter
          </Link>
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
