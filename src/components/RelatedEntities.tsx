import Link from "next/link";
import Image from "next/image";

interface RelatedCompany {
  slug: string;
  name: string;
  logoUrl?: string | null;
  sectorTag?: string | null;
  sectorTagEn?: string | null;
}

interface RelatedInsider {
  slug: string;
  name: string;
  primaryRole?: string | null;
}

interface RelatedEntitiesProps {
  relatedCompanies?: RelatedCompany[];
  relatedInsiders?: RelatedInsider[];
  locale?: string;
  entityType?: "company" | "insider";
}

export function RelatedEntities({
  relatedCompanies = [],
  relatedInsiders = [],
  locale = "en",
  entityType = "company",
}: RelatedEntitiesProps) {
  if (relatedCompanies.length === 0 && relatedInsiders.length === 0) return null;

  const isFr = locale === "fr";

  return (
    <div className="related-entities-block" style={{ marginTop: "3rem" }}>
      {/* Related Companies */}
      {relatedCompanies.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--tx-3)",
              marginBottom: "1rem",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {isFr ? "Sociétés similaires" : "Similar companies"}
          </h2>
          <div className="related-entities-grid">
            {relatedCompanies.slice(0, 5).map((c) => (
              <Link
                key={c.slug}
                href={isFr ? `/fr/company/${c.slug}` : `/company/${c.slug}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  borderRadius: "0.875rem",
                  background: "var(--glass-bg)",
                  border: "1px solid var(--glass-border)",
                  textDecoration: "none",
                  transition: "border-color 0.15s, background 0.15s",
                }}
                className="related-entity-card"
              >
                {c.logoUrl ? (
                  <Image
                    src={c.logoUrl}
                    alt={c.name}
                    width={28}
                    height={28}
                    style={{ borderRadius: "6px", objectFit: "contain", flexShrink: 0 }}
                    unoptimized
                  />
                ) : (
                  <div
                    style={{
                      width: 28, height: 28, borderRadius: "6px", flexShrink: 0,
                      background: "var(--bg-raised)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.6rem", fontWeight: 700, color: "var(--tx-3)",
                    }}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "var(--tx-1)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.name}
                  </div>
                  {(isFr ? c.sectorTag : c.sectorTagEn) && (
                    <div
                      style={{
                        fontSize: "0.65rem",
                        color: "var(--tx-3)",
                        marginTop: "2px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isFr ? c.sectorTag : c.sectorTagEn}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Related Insiders */}
      {relatedInsiders.length > 0 && (
        <div>
          <h2
            style={{
              fontSize: "0.72rem",
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--tx-3)",
              marginBottom: "1rem",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {isFr ? "Dirigeants associés" : "Related executives"}
          </h2>
          <div className="related-entities-grid">
            {relatedInsiders.slice(0, 5).map((i) => {
              const initials = i.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
              return (
                <Link
                  key={i.slug}
                  href={isFr ? `/fr/insider/${i.slug}` : `/insider/${i.slug}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.75rem 1rem",
                    borderRadius: "0.875rem",
                    background: "var(--glass-bg)",
                    border: "1px solid var(--glass-border)",
                    textDecoration: "none",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  className="related-entity-card"
                >
                  <div
                    style={{
                      width: 28, height: 28, borderRadius: "6px", flexShrink: 0,
                      background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(217,70,239,0.2))",
                      border: "1px solid rgba(139,92,246,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.55rem", fontWeight: 700, color: "var(--c-violet)",
                    }}
                  >
                    {initials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--tx-1)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {i.name}
                    </div>
                    {i.primaryRole && (
                      <div
                        style={{
                          fontSize: "0.62rem",
                          color: "var(--tx-3)",
                          marginTop: "2px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {i.primaryRole}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
