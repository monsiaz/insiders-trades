"use client";

import { useEffect, useState } from "react";

interface NewsItem {
  title: string;
  publisher: string | null;
  link: string;
  pubDate: string;
  description: string | null;
}

interface ApiResponse {
  items: NewsItem[];
  ticker: string | null;
  source: string;
  reason?: string;
  fetchedAt?: string;
}

function fmtRelative(iso: string, isFr: boolean): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = now - then;
  const min = Math.round(diffMs / 60_000);
  if (min < 60) return isFr ? `il y a ${Math.max(1, min)} min` : `${Math.max(1, min)} min ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return isFr ? `il y a ${hrs} h` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return isFr ? `il y a ${days} j` : `${days}d ago`;
  return new Date(iso).toLocaleDateString(isFr ? "fr-FR" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function CompanyNews({ slug, companyName, locale = "en" }: { slug: string; companyName: string; locale?: string }) {
  const isFr = locale === "fr";
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/company/${encodeURIComponent(slug)}/news?locale=${isFr ? "fr" : "en"}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ApiResponse | null) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return <NewsSkeleton />;
  }
  if (!data || data.items.length === 0) {
    return (
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-med)",
          borderLeft: "2px solid var(--gold)",
          padding: "20px 22px",
          borderRadius: "2px",
        }}
      >
        <SectionHeader companyName={companyName} ticker={data?.ticker ?? null} count={0} isFr={isFr} />
        <p
          style={{
            fontSize: "0.86rem",
            color: "var(--tx-3)",
            fontStyle: "italic",
            margin: "10px 0 0",
            lineHeight: 1.55,
          }}
        >
          {isFr ? "Aucune dépêche récente pour cette société." : "No recent news for this company."}
        </p>
      </div>
    );
  }

  const visible = showAll ? data.items : data.items.slice(0, 4);

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: "2px solid var(--gold)",
        padding: "20px 22px 18px",
        borderRadius: "2px",
      }}
    >
      <SectionHeader companyName={companyName} ticker={data.ticker} count={data.items.length} isFr={isFr} />
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "14px 0 0",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {visible.map((n, i) => (
          <li
            key={n.link}
            style={{
              borderBottom:
                i < visible.length - 1 ? "1px solid var(--border)" : "none",
              padding: "12px 0",
            }}
          >
            <NewsRow n={n} isFr={isFr} />
          </li>
        ))}
      </ul>
      {data.items.length > 4 && (
        <div style={{ marginTop: "12px", textAlign: "right" }}>
          <button
            onClick={() => setShowAll((v) => !v)}
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--gold)",
              background: "transparent",
              border: "1px solid var(--gold-bd)",
              borderRadius: "3px",
              padding: "6px 14px",
              cursor: "pointer",
              letterSpacing: "0.02em",
              transition: "background 0.14s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--gold-bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {showAll
              ? (isFr ? "Voir moins" : "Show less")
              : isFr
                ? `Voir ${data.items.length - 4} dépêche${data.items.length - 4 > 1 ? "s" : ""} de plus →`
                : `Show ${data.items.length - 4} more →`}
          </button>
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  companyName,
  ticker,
  count,
  isFr = false,
}: {
  companyName: string;
  ticker: string | null;
  count: number;
  isFr?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.64rem",
          fontWeight: 600,
          color: "var(--gold)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {isFr ? "Actualités" : "News"}
      </span>
      <h3
        style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "1.15rem",
          fontWeight: 400,
          color: "var(--tx-1)",
          letterSpacing: "-0.01em",
          margin: 0,
        }}
      >
        {companyName}
        {count > 0 && (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.7rem",
              color: "var(--gold)",
              letterSpacing: "0.06em",
              marginLeft: "8px",
            }}
          >
 · {count.toString().padStart(2, "0")}
          </span>
        )}
      </h3>
      {ticker && (
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.62rem",
            color: "var(--tx-4)",
            letterSpacing: "0.08em",
          }}
        >
          Source : Yahoo Finance · {ticker}
        </span>
      )}
    </div>
  );
}

function NewsRow({ n, isFr = false }: { n: NewsItem; isFr?: boolean }) {
  return (
    <a
      href={n.link}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        textDecoration: "none",
        color: "inherit",
        transition: "background 0.12s",
        margin: "-4px -8px",
        padding: "4px 8px",
        borderRadius: "3px",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-raised)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "4px",
        }}
      >
        <div
          style={{
            fontSize: "0.92rem",
            fontWeight: 600,
            color: "var(--tx-1)",
            letterSpacing: "-0.005em",
            lineHeight: 1.4,
            flex: 1,
            minWidth: 0,
          }}
        >
          {n.title}
        </div>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          style={{ color: "var(--tx-4)", flexShrink: 0, marginTop: "4px" }}
          aria-hidden="true"
        >
          <path
            d="M7 17L17 7M17 7H8M17 7v9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {n.description && (
        <p
          style={{
            fontSize: "0.78rem",
            color: "var(--tx-3)",
            lineHeight: 1.5,
            margin: "0 0 6px",
          }}
        >
          {n.description}
        </p>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.66rem",
          color: "var(--tx-4)",
          letterSpacing: "0.04em",
        }}
      >
        {n.publisher && (
          <span style={{ color: "var(--gold)", fontWeight: 600 }}>{n.publisher}</span>
        )}
        {!n.publisher && <span>{hostname(n.link)}</span>}
        <span style={{ color: "var(--border-strong)" }}>·</span>
        <span>{fmtRelative(n.pubDate, isFr)}</span>
      </div>
    </a>
  );
}

function NewsSkeleton() {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: "2px solid var(--gold)",
        padding: "20px 22px",
        borderRadius: "2px",
      }}
    >
      <div className="skeleton" style={{ height: 10, width: 80, marginBottom: "14px" }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 52, borderRadius: "3px", opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </div>
  );
}
