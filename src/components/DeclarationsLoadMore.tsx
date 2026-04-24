"use client";

import { useState, useCallback } from "react";
import { DeclarationCard } from "./DeclarationCard";

type DeclData = Parameters<typeof DeclarationCard>[0]["declaration"];

interface Props {
  initial: DeclData[];
  total: number;
  entityId: string;
  entityType: "company" | "insider";
  filterType?: string;
  showCompany?: boolean;
  locale?: string;
  pageSize?: number;
}

export function DeclarationsLoadMore({
  initial,
  total,
  entityId,
  entityType,
  filterType,
  showCompany = true,
  locale = "en",
  pageSize = 25,
}: Props) {
  const [items, setItems]     = useState<DeclData[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const isFr = locale === "fr";
  const hasMore = items.length < total;

  const loadMore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        [entityType === "company" ? "companyId" : "insiderId"]: entityId,
        skip: String(items.length),
        take: String(pageSize),
        ...(filterType ? { type: filterType } : {}),
      });
      const res = await fetch(`/api/declarations?${params}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setItems((prev) => [...prev, ...data.declarations]);
    } catch {
      setError(isFr ? "Erreur de chargement." : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, [items.length, entityId, entityType, filterType, pageSize, isFr]);

  return (
    <div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center" style={{ color: "var(--tx-3)" }}>
            {isFr ? "Aucune déclaration trouvée" : "No declarations found"}
          </div>
        ) : (
          items.map((decl) => (
            <DeclarationCard key={decl.id} declaration={decl} showCompany={showCompany} locale={locale} />
          ))
        )}
      </div>

      {/* Footer: count + load more */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <p style={{ fontSize: "0.75rem", color: "var(--tx-4)" }}>
          {isFr
            ? `${items.length} sur ${total} déclaration${total !== 1 ? "s" : ""}`
            : `${items.length} of ${total} declaration${total !== 1 ? "s" : ""}`}
        </p>

        {hasMore && (
          <button
            onClick={loadMore}
            disabled={loading}
            className="btn-glass"
            style={{
              padding: "10px 28px",
              borderRadius: "10px",
              fontSize: "0.84rem",
              fontWeight: 600,
              minWidth: "160px",
              opacity: loading ? 0.6 : 1,
              cursor: loading ? "default" : "pointer",
            }}
          >
            {loading
              ? (isFr ? "Chargement…" : "Loading…")
              : (isFr ? `Voir plus (${total - items.length} restantes)` : `Load more (${total - items.length} remaining)`)}
          </button>
        )}

        {error && (
          <p style={{ fontSize: "0.75rem", color: "var(--signal-neg)" }}>{error}</p>
        )}
      </div>
    </div>
  );
}
