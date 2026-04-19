import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { SyncButton } from "@/components/SyncButton";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ all?: string; q?: string }>;
}

export default async function CompaniesPage({ searchParams }: Props) {
  const { all, q } = await searchParams;
  const showAll = all === "1";

  const where = {
    ...(q ? { name: { contains: q.toUpperCase() } } : {}),
    ...(!showAll ? { declarations: { some: { type: "DIRIGEANTS" as const } } } : {}),
  };

  const companies = await prisma.company.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { declarations: true } },
      declarations: {
        where: { type: "DIRIGEANTS" },
        orderBy: { pubDate: "desc" },
        take: 1,
        select: { pubDate: true, insiderName: true, transactionNature: true, totalAmount: true },
      },
    },
  });

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
          <Link href="/companies/add" className="btn btn-primary">
            + Ajouter
          </Link>
        </div>
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap gap-3 mb-7">
        <form action="/companies" className="flex-1 min-w-56 relative">
          <input
            name="q"
            defaultValue={q || ""}
            placeholder="Filtrer par nom..."
            className="glass-input w-full pl-9 pr-4 py-2.5 rounded-xl text-sm"
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
            style={{ color: "var(--tx-3)" }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {all && <input type="hidden" name="all" value="1" />}
        </form>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-1 card-raised rounded-xl" style={{ borderRadius: "12px" }}>
          <Link
            href={`/companies${q ? `?q=${q}` : ""}`}
            style={{
              padding: "5px 12px",
              borderRadius: "9px",
              fontSize: "0.75rem",
              fontWeight: 700,
              transition: "all 0.15s",
              textDecoration: "none",
              background: !showAll ? "var(--c-indigo-bg)" : "transparent",
              color: !showAll ? "var(--c-indigo-2)" : "var(--tx-3)",
              border: !showAll ? "1px solid var(--c-indigo-bd)" : "1px solid transparent",
            }}
          >
            Avec déclarations
          </Link>
          <Link
            href={`/companies?all=1${q ? `&q=${q}` : ""}`}
            style={{
              padding: "5px 12px",
              borderRadius: "9px",
              fontSize: "0.75rem",
              fontWeight: 700,
              transition: "all 0.15s",
              textDecoration: "none",
              background: showAll ? "var(--c-indigo-bg)" : "transparent",
              color: showAll ? "var(--c-indigo-2)" : "var(--tx-3)",
              border: showAll ? "1px solid var(--c-indigo-bd)" : "1px solid transparent",
            }}
          >
            Toutes
          </Link>
        </div>
      </div>

      {/* Companies grid */}
      {companies.length === 0 ? (
        <div className="card p-16 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto mb-4" style={{ color: "var(--tx-3)" }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "8px" }}>
            Aucune société trouvée
          </h2>
          <p style={{ color: "var(--tx-3)" }}>
            Essayez un autre terme de recherche ou{" "}
            <Link href="/companies?all=1" style={{ color: "var(--c-indigo-2)", textDecoration: "none" }}>
              affichez toutes les sociétés
            </Link>.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => {
            const lastDecl = company.declarations[0];
            const nature = lastDecl?.transactionNature?.toLowerCase();
            const isBuy = nature?.includes("acquisition");
            const isSell = nature?.includes("cession");

            return (
              <Link
                key={company.id}
                href={`/company/${company.slug}`}
                className="card p-5 flex flex-col gap-3 group"
                style={{ textDecoration: "none" }}
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div
                      className="flex-shrink-0 flex items-center justify-center text-base font-bold"
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "10px",
                        background: "var(--c-indigo-bg)",
                        border: "1px solid var(--c-indigo-bd)",
                        color: "var(--c-indigo-2)",
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {company.name.charAt(0)}
                    </div>
                    <div>
                      <h3 style={{
                        fontWeight: 700,
                        fontSize: "0.875rem",
                        color: "var(--tx-1)",
                        letterSpacing: "-0.01em",
                        lineHeight: 1.3,
                      }}>
                        {company.name}
                      </h3>
                      <span style={{
                        fontSize: "0.65rem",
                        fontFamily: "JetBrains Mono, monospace",
                        color: "var(--tx-4)",
                        letterSpacing: "0.03em",
                      }}>
                        {company.amfToken}
                      </span>
                    </div>
                  </div>

                  {lastDecl?.totalAmount && (
                    <span
                      className="flex-shrink-0 tabular-nums"
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        color: isBuy ? "var(--c-mint)" : isSell ? "var(--c-red)" : "var(--tx-3)",
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {isBuy ? "▲" : isSell ? "▼" : ""}
                      {new Intl.NumberFormat("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                        maximumFractionDigits: 0,
                        notation: lastDecl.totalAmount >= 1_000_000 ? "compact" : "standard",
                      }).format(lastDecl.totalAmount)}
                    </span>
                  )}
                </div>

                {/* Stats row */}
                <div
                  className="flex items-center justify-between"
                  style={{ paddingTop: "10px", borderTop: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-1.5">
                    <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--tx-2)", fontFamily: "JetBrains Mono, monospace" }}>
                      {company._count.declarations}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--tx-3)" }}>décl.</span>
                  </div>
                  {lastDecl && (
                    <span style={{ fontSize: "0.68rem", color: "var(--tx-4)", fontFamily: "JetBrains Mono, monospace" }}>
                      {new Date(lastDecl.pubDate).toLocaleDateString("fr-FR", {
                        day: "numeric", month: "short", year: "2-digit",
                      })}
                    </span>
                  )}
                </div>

                {/* Last insider */}
                {lastDecl?.insiderName && (
                  <div
                    className="truncate"
                    style={{ fontSize: "0.72rem", color: "var(--tx-3)" }}
                  >
                    {lastDecl.insiderName}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
