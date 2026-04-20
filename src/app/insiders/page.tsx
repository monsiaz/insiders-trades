import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const revalidate = 300; // Revalidate every 5 min

export default async function InsidersPage() {
  const insiders = await prisma.insider.findMany({
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
        select: { pubDate: true, transactionNature: true, totalAmount: true, currency: true },
      },
    },
  });

  return (
    <div className="content-wrapper">
      <div className="mb-8">
        <h1 className="heading-page">Dirigeants</h1>
        <p style={{ color: "var(--tx-3)", fontSize: "0.875rem", marginTop: "4px" }}>
          {insiders.length} dirigeant{insiders.length !== 1 ? "s" : ""} dans la base
        </p>
      </div>

      {insiders.length === 0 ? (
        <div className="card p-16 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mx-auto mb-4" style={{ color: "var(--tx-3)" }}>
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "8px" }}>
            Aucun dirigeant enregistré
          </h2>
          <p style={{ color: "var(--tx-3)", marginBottom: "24px" }}>
            Les dirigeants apparaissent lors des synchronisations.
          </p>
          <Link href="/companies/add" className="btn btn-primary">
            Ajouter une société
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {insiders.map((insider) => {
            const initials = insider.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            const lastDecl = insider.declarations[0];
            const nature = lastDecl?.transactionNature?.toLowerCase();
            const isSell = nature?.includes("cession");

            return (
              <Link
                key={insider.id}
                href={`/insider/${insider.slug}`}
                className="card p-5 group flex flex-col gap-3"
                style={{ textDecoration: "none" }}
              >
                {/* Header row */}
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center text-sm font-bold"
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "12px",
                      background: "var(--c-indigo-bg)",
                      border: "1px solid var(--c-indigo-bd)",
                      color: "var(--c-indigo-2)",
                      fontFamily: "JetBrains Mono, monospace",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {initials}
                  </div>

                  {/* Name + function */}
                  <div className="min-w-0 flex-1">
                    <h3
                      style={{
                        fontWeight: 700,
                        fontSize: "0.875rem",
                        color: "var(--tx-1)",
                        letterSpacing: "-0.01em",
                        lineHeight: 1.3,
                      }}
                      className="truncate"
                    >
                      {insider.name}
                    </h3>
                    {insider.companies[0]?.function && (
                      <p
                        className="truncate"
                        style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "1px" }}
                      >
                        {insider.companies[0].function}
                      </p>
                    )}
                  </div>

                  {/* Amount badge */}
                  {lastDecl?.totalAmount && (
                    <span
                      className="flex-shrink-0 tabular-nums"
                      style={{
                        fontSize: "0.78rem",
                        fontWeight: 700,
                        color: isSell ? "var(--c-red)" : "var(--c-mint)",
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                    >
                      {isSell ? "▼" : "▲"}
                      {new Intl.NumberFormat("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                        maximumFractionDigits: 0,
                        notation: lastDecl.totalAmount >= 1_000_000 ? "compact" : "standard",
                      }).format(lastDecl.totalAmount)}
                    </span>
                  )}
                </div>

                {/* Company chips */}
                {insider.companies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {insider.companies.map((ci) => (
                      <span
                        key={ci.company.slug}
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 600,
                          letterSpacing: "0.02em",
                          padding: "2px 7px",
                          borderRadius: "5px",
                          background: "var(--bg-raised)",
                          border: "1px solid var(--border-med)",
                          color: "var(--tx-3)",
                        }}
                      >
                        {ci.company.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div
                  className="flex items-center justify-between"
                  style={{ paddingTop: "10px", borderTop: "1px solid var(--border)" }}
                >
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--tx-3)" }}>
                    {insider._count.declarations} décl.
                  </span>
                  {lastDecl && (
                    <span style={{ fontSize: "0.72rem", color: "var(--tx-4)", fontFamily: "JetBrains Mono, monospace" }}>
                      {new Date(lastDecl.pubDate).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
