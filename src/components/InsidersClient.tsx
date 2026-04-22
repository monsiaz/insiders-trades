"use client";

import { memo, useEffect, useMemo, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────

export interface InsiderRow {
  id: string;
  slug: string;
  name: string;
  declarationCount: number;
  topFunction: string | null;
  companies: string[]; // up to 3 company names
  lastDecl: {
    pubDate: string;
    totalAmount: number | null;
    nature: string | null;
  } | null;
}

type SortKey = "name" | "activity" | "count" | "amount";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Alphabétique",
  activity: "Activité récente",
  count: "+ de déclarations",
  amount: "Montant dernier trade",
};

// ── InsiderCard ────────────────────────────────────────────────────────────

function InsiderCard({ insider }: { insider: InsiderRow }) {
  const lastDecl = insider.lastDecl;
  const isSell = (lastDecl?.nature ?? "").toLowerCase().includes("cession");
  const stripeClass = isSell ? "sell" : lastDecl?.totalAmount ? "buy" : "";
  const initials = insider.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Link
      href={`/insider/${insider.slug}`}
      className="tearsheet"
      style={{ textDecoration: "none", padding: "16px 18px 14px 22px", gap: "10px" }}
    >
      <span className={`tearsheet-stripe ${stripeClass}`} aria-hidden="true" />

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
            fontFamily: "var(--font-dm-serif), Georgia, serif",
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
              fontFamily: "var(--font-dm-serif), Georgia, serif",
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
          {insider.topFunction && (
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
              {insider.topFunction}
            </p>
          )}
        </div>

        {lastDecl?.totalAmount != null && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div
              style={{
                fontFamily: "'Banana Grotesk', sans-serif",
                fontSize: "0.92rem",
                fontWeight: 700,
                color: "var(--tx-1)",
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1,
              }}
            >
              {isSell ? <span style={{ color: "var(--signal-neg)", marginRight: "2px" }}>▼</span> : <span style={{ color: "var(--signal-pos)", marginRight: "2px" }}>▲</span>}
              {new Intl.NumberFormat("fr-FR", {
                style: "currency",
                currency: "EUR",
                maximumFractionDigits: 0,
                notation: lastDecl.totalAmount >= 1_000_000 ? "compact" : "standard",
              }).format(lastDecl.totalAmount)}
            </div>
            <div
              style={{
                fontSize: "0.55rem",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--tx-4)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 600,
                marginTop: "3px",
              }}
            >
              Dernier
            </div>
          </div>
        )}
      </div>

      {insider.companies.length > 0 && (
        <div
          style={{
            fontSize: "0.72rem",
            color: "var(--tx-3)",
            fontStyle: "italic",
            lineHeight: 1.4,
          }}
        >
          — {insider.companies.join(" · ")}
        </div>
      )}

      <div
        className="flex items-center justify-between"
        style={{ paddingTop: "9px", borderTop: "1px solid var(--border)" }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.68rem",
            color: "var(--tx-3)",
            letterSpacing: "0.02em",
          }}
        >
          <strong style={{ color: "var(--tx-1)", fontWeight: 700 }}>
            {insider.declarationCount}
          </strong>{" "}
          décl.
        </span>
        {lastDecl && (
          <span
            style={{
              fontSize: "0.64rem",
              color: "var(--tx-4)",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.04em",
            }}
          >
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
}

const MemoInsiderCard = memo(
  InsiderCard,
  (prev, next) => prev.insider.id === next.insider.id
);

// ── Main ───────────────────────────────────────────────────────────────────

export function InsidersClient({ insiders }: { insiders: InsiderRow[] }) {
  const PAGE_SIZE = 120;
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [sort, setSort] = useState<SortKey>("activity");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDq(q), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [dq, sort]);

  const filtered = useMemo(() => {
    let rows = insiders;
    if (dq.trim()) {
      const lq = dq.trim().toLowerCase();
      rows = rows.filter(
        (i) =>
          i.name.toLowerCase().includes(lq) ||
          i.companies.some((c) => c.toLowerCase().includes(lq))
      );
    }
    rows = [...rows].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "fr");
      if (sort === "count") return b.declarationCount - a.declarationCount;
      if (sort === "activity") {
        const ad = a.lastDecl ? new Date(a.lastDecl.pubDate).getTime() : 0;
        const bd = b.lastDecl ? new Date(b.lastDecl.pubDate).getTime() : 0;
        return bd - ad;
      }
      if (sort === "amount") {
        return (b.lastDecl?.totalAmount ?? 0) - (a.lastDecl?.totalAmount ?? 0);
      }
      return 0;
    });
    return rows;
  }, [insiders, dq, sort]);

  return (
    <div>
      {/* Search + sort */}
      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            style={{
              position: "absolute",
              left: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--tx-4)",
              pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
            <path
              d="m21 21-4.35-4.35"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un dirigeant ou une société…"
            style={{
              width: "100%",
              paddingLeft: "34px",
              paddingRight: q ? "32px" : "12px",
              height: "38px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-med)",
              borderRadius: "6px",
              outline: "none",
              fontSize: "0.84rem",
              color: "var(--tx-1)",
            }}
          />
          {q && (
            <button
              onClick={() => setQ("")}
              style={{
                position: "absolute",
                right: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--tx-4)",
                display: "flex",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setSortOpen((v) => !v)}
            onBlur={() => setTimeout(() => setSortOpen(false), 120)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 14px",
              borderRadius: "6px",
              border: "1px solid var(--border-med)",
              background: "var(--bg-raised)",
              color: "var(--tx-2)",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 6h18M7 12h10M11 18h2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            {SORT_LABELS[sort]}
          </button>
          {sortOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                background: "var(--bg-surface)",
                border: "1px solid var(--border-med)",
                borderRadius: "6px",
                boxShadow: "var(--shadow-md)",
                zIndex: 50,
                minWidth: "200px",
                overflow: "hidden",
              }}
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <button
                  key={k}
                  onMouseDown={() => {
                    setSort(k);
                    setSortOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "9px 14px",
                    background:
                      sort === k ? "var(--bg-hover)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    fontWeight: sort === k ? 700 : 400,
                    color: sort === k ? "var(--gold)" : "var(--tx-2)",
                    textAlign: "left",
                  }}
                >
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Count line */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.7rem",
          color: "var(--tx-3)",
          letterSpacing: "0.04em",
          marginBottom: "16px",
        }}
      >
        {filtered.length.toLocaleString("fr-FR")} dirigeant
        {filtered.length !== 1 ? "s" : ""}
        {dq && ` · filtre : "${dq}"`}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <p style={{ color: "var(--tx-3)" }}>Aucun dirigeant trouvé.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.slice(0, visibleCount).map((insider) => (
              <MemoInsiderCard key={insider.id} insider={insider} />
            ))}
          </div>
          {visibleCount < filtered.length && (
            <div className="flex justify-center mt-8">
              <button
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="btn btn-outline"
                style={{ padding: "10px 22px", fontSize: "0.85rem" }}
              >
                Charger{" "}
                {Math.min(PAGE_SIZE, filtered.length - visibleCount)} dirigeant
                {Math.min(PAGE_SIZE, filtered.length - visibleCount) > 1
                  ? "s"
                  : ""}{" "}
                de plus
                <span
                  style={{
                    marginLeft: "8px",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.72rem",
                    color: "var(--tx-4)",
                    letterSpacing: "0.04em",
                  }}
                >
                  · {(filtered.length - visibleCount).toLocaleString("fr-FR")}{" "}
                  restants
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
