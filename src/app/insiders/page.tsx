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
        <div className="flex items-center gap-3 mb-3">
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.64rem",
            fontWeight: 600,
            color: "var(--gold)",
            letterSpacing: "0.22em",
            textTransform: "uppercase",
          }}>
            Registre
          </span>
          <span style={{ flex: 1, height: "1px", background: "var(--border-med)" }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.64rem",
            color: "var(--tx-3)",
            letterSpacing: "0.08em",
          }}>
            {insiders.length.toLocaleString("fr-FR")} dirigeants
          </span>
        </div>
        <h1 style={{
          fontFamily: "'DM Serif Display', Georgia, serif",
          fontSize: "clamp(2.25rem, 4.5vw, 3.25rem)",
          fontWeight: 400,
          letterSpacing: "-0.015em",
          lineHeight: 1.05,
          color: "var(--tx-1)",
        }}>
          Dirigeants
        </h1>
        <p style={{
          color: "var(--tx-2)",
          fontSize: "0.9rem",
          marginTop: "6px",
          maxWidth: "520px",
          lineHeight: 1.6,
        }}>
          L'ensemble des dirigeants français déclarant des transactions auprès de l'AMF.
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

            const stripeClass = isSell ? "sell" : lastDecl?.totalAmount ? "buy" : "";
            return (
              <Link
                key={insider.id}
                href={`/insider/${insider.slug}`}
                className="tearsheet"
                style={{ textDecoration: "none", padding: "16px 18px 14px 22px", gap: "10px" }}
              >
                <span className={`tearsheet-stripe ${stripeClass}`} aria-hidden="true" />

                {/* Head */}
                <div className="flex items-center gap-3">
                  <div
                    className="flex-shrink-0 flex items-center justify-center"
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "3px",
                      background: "var(--bg-raised)",
                      border: "1px solid var(--border-med)",
                      color: "var(--gold)",
                      fontFamily: "'DM Serif Display', Georgia, serif",
                      fontStyle: "italic",
                      fontSize: "1rem",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {initials}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3
                      style={{
                        fontFamily: "'DM Serif Display', Georgia, serif",
                        fontWeight: 400,
                        fontSize: "1.05rem",
                        color: "var(--tx-1)",
                        letterSpacing: "-0.005em",
                        lineHeight: 1.15,
                      }}
                      className="truncate"
                    >
                      {insider.name}
                    </h3>
                    {insider.companies[0]?.function && (
                      <p
                        className="truncate"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: "0.64rem",
                          color: "var(--tx-3)",
                          marginTop: "3px",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          fontWeight: 600,
                        }}
                      >
                        {insider.companies[0].function}
                      </p>
                    )}
                  </div>

                  {lastDecl?.totalAmount && (
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{
                        fontFamily: "'Banana Grotesk', sans-serif",
                        fontSize: "0.92rem",
                        fontWeight: 700,
                        color: isSell ? "var(--signal-neg)" : "var(--signal-pos)",
                        letterSpacing: "-0.02em",
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1,
                      }}>
                        {isSell ? "▼ " : "▲ "}
                        {new Intl.NumberFormat("fr-FR", {
                          style: "currency",
                          currency: "EUR",
                          maximumFractionDigits: 0,
                          notation: lastDecl.totalAmount >= 1_000_000 ? "compact" : "standard",
                        }).format(lastDecl.totalAmount)}
                      </div>
                      <div style={{
                        fontSize: "0.55rem",
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "var(--tx-4)",
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        fontWeight: 600,
                        marginTop: "3px",
                      }}>
                        Dernier
                      </div>
                    </div>
                  )}
                </div>

                {/* Companies as editorial byline */}
                {insider.companies.length > 0 && (
                  <div style={{
                    fontSize: "0.72rem",
                    color: "var(--tx-3)",
                    fontStyle: "italic",
                    lineHeight: 1.4,
                  }}>
                    — {insider.companies.slice(0, 3).map((ci) => ci.company.name).join(" · ")}
                  </div>
                )}

                {/* Rule + meta */}
                <div
                  className="flex items-center justify-between"
                  style={{ paddingTop: "9px", borderTop: "1px solid var(--border)" }}
                >
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.68rem",
                    color: "var(--tx-3)",
                    letterSpacing: "0.02em",
                  }}>
                    <strong style={{ color: "var(--tx-1)", fontWeight: 700 }}>
                      {insider._count.declarations}
                    </strong>{" "}
                    décl.
                  </span>
                  {lastDecl && (
                    <span style={{
                      fontSize: "0.64rem",
                      color: "var(--tx-4)",
                      fontFamily: "'JetBrains Mono', monospace",
                      letterSpacing: "0.04em",
                    }}>
                      {new Date(lastDecl.pubDate).toLocaleDateString("fr-FR", {
                        day: "2-digit",
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
