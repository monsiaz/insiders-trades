"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CompanyLogo } from "./CompanyLogo";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  amfToken: string | null;
  marketCap: number | null;
  yahooSymbol: string | null;
  currentPrice: number | null;
  logoUrl: string | null;
  declarationCount: number;
  lastDecl: {
    pubDate: string;
    insiderName: string | null;
    transactionNature: string | null;
    totalAmount: number | null;
  } | null;
}

type CapFilter   = "all" | "micro" | "small" | "mid" | "large" | "mega";
type ActivityFilter = "all" | "7d" | "30d" | "90d";
type ActionFilter = "all" | "buy" | "sell";
type SortKey = "name" | "activity" | "count" | "cap";

// ── Filter config ──────────────────────────────────────────────────────────

const CAP_LABELS: Record<CapFilter, string> = {
  all: "Toutes",
  micro: "Micro (<50M€)",
  small: "Small (50-300M€)",
  mid: "Mid (0.3-2B€)",
  large: "Large (2-10B€)",
  mega: "Mega (>10B€)",
};

const ACTIVITY_LABELS: Record<ActivityFilter, string> = {
  all: "Toutes périodes",
  "7d": "7 derniers jours",
  "30d": "30 derniers jours",
  "90d": "3 derniers mois",
};

const ACTION_LABELS: Record<ActionFilter, string> = {
  all: "Toutes",
  buy: "Achats récents",
  sell: "Ventes récentes",
};

const SORT_LABELS: Record<SortKey, string> = {
  name: "Alphabétique",
  activity: "Activité récente",
  count: "+ de déclarations",
  cap: "Capitalisation",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtMcap(n: number | null): string {
  if (!n) return "";
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)} T€`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(1)} Md€`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(0)} M€`;
  return `${(n / 1e3).toFixed(0)} k€`;
}

function fmtAmount(n: number | null): string {
  if (!n) return "";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M€`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k€`;
  return `${n.toFixed(0)} €`;
}

function capOf(row: CompanyRow): CapFilter {
  const mc = row.marketCap;
  if (!mc) return "all"; // unknown
  if (mc < 50e6)    return "micro";
  if (mc < 300e6)   return "small";
  if (mc < 2e9)     return "mid";
  if (mc < 10e9)    return "large";
  return "mega";
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86400_000);
}

function isBuy(nature: string | null): boolean {
  return (nature ?? "").toLowerCase().includes("acqui");
}
function isSell(nature: string | null): boolean {
  return (nature ?? "").toLowerCase().includes("cession");
}

// ── FilterPills ─────────────────────────────────────────────────────────────

function Pill<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "3px",
      padding: "3px",
      background: "var(--bg-raised)",
      border: "1px solid var(--border)",
      borderRadius: "10px",
      flexWrap: "wrap",
    }}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: "4px 11px",
            borderRadius: "7px",
            border: "none",
            cursor: "pointer",
            fontFamily: "'Inter', system-ui",
            fontSize: "0.75rem",
            fontWeight: value === opt ? 700 : 500,
            background: value === opt ? "var(--c-indigo-bg)" : "transparent",
            color: value === opt ? "var(--c-indigo-2)" : "var(--tx-3)",
            outline: value === opt ? "1px solid var(--c-indigo-bd)" : "none",
            transition: "all 0.12s",
            whiteSpace: "nowrap",
          }}
        >
          {labels[opt]}
        </button>
      ))}
    </div>
  );
}

// ── Sort dropdown ───────────────────────────────────────────────────────────

function SortDropdown({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: "6px",
          padding: "6px 12px", borderRadius: "9px",
          border: "1px solid var(--border-med)",
          background: "var(--bg-raised)",
          color: "var(--tx-2)", cursor: "pointer",
          fontFamily: "'Inter', system-ui", fontSize: "0.78rem", fontWeight: 500,
          whiteSpace: "nowrap",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M7 12h10M11 18h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        {SORT_LABELS[value]}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.5 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-med)",
          borderRadius: "12px", boxShadow: "var(--shadow-md)",
          zIndex: 100, minWidth: "180px", overflow: "hidden",
        }}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => { onChange(k); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                width: "100%", padding: "9px 14px",
                background: value === k ? "var(--bg-hover)" : "transparent",
                border: "none", cursor: "pointer",
                fontFamily: "'Inter', system-ui", fontSize: "0.8rem",
                fontWeight: value === k ? 700 : 400,
                color: value === k ? "var(--c-indigo-2)" : "var(--tx-2)",
                textAlign: "left",
              }}
            >
              {value === k && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {value !== k && <span style={{ width: 12 }} />}
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Company card ────────────────────────────────────────────────────────────

function CompanyCard({ company, q }: { company: CompanyRow; q: string }) {
  const lastDecl = company.lastDecl;
  const nature = lastDecl?.transactionNature?.toLowerCase() ?? "";
  const isB = isBuy(lastDecl?.transactionNature ?? null);
  const isS = isSell(lastDecl?.transactionNature ?? null);
  const mcap = fmtMcap(company.marketCap);

  function highlight(text: string): React.ReactNode {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return <>
      {text.slice(0, idx)}
      <mark style={{ background: "var(--c-indigo-bg)", color: "var(--c-indigo-2)", borderRadius: "2px" }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>;
  }

  const stripeClass = isB ? "buy" : isS ? "sell" : "";

  return (
    <Link
      href={`/company/${company.slug}`}
      className="tearsheet"
      style={{
        textDecoration: "none",
        padding: "16px 18px 14px 22px",
        gap: "12px",
      }}
    >
      <span className={`tearsheet-stripe ${stripeClass}`} aria-hidden="true" />

      {/* Head: logo + name + last amount */}
      <div className="flex items-start gap-3">
        <CompanyLogo name={company.name} logoUrl={company.logoUrl} size={38} />
        <div className="min-w-0 flex-1">
          <h3 style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontWeight: 400,
            fontSize: "1.05rem",
            color: "var(--tx-1)",
            letterSpacing: "-0.005em",
            lineHeight: 1.15,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {highlight(company.name)}
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
            {company.yahooSymbol && (
              <span style={{
                fontSize: "0.65rem",
                fontFamily: "'JetBrains Mono', monospace",
                color: "var(--gold)",
                letterSpacing: "0.04em",
                fontWeight: 600,
              }}>
                {company.yahooSymbol.replace(".PA", "")}
              </span>
            )}
            {company.currentPrice && (
              <>
                <span style={{ color: "var(--border-strong)", fontSize: "0.55rem" }}>·</span>
                <span style={{
                  fontSize: "0.65rem",
                  fontFamily: "'JetBrains Mono', monospace",
                  color: "var(--tx-3)",
                }}>
                  {company.currentPrice.toFixed(2)} €
                </span>
              </>
            )}
          </div>
        </div>

        {lastDecl?.totalAmount ? (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{
              fontSize: "0.92rem",
              fontWeight: 700,
              color: isB ? "var(--signal-pos)" : isS ? "var(--signal-neg)" : "var(--tx-2)",
              fontFamily: "'Banana Grotesk', sans-serif",
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}>
              {isB ? "▲ " : isS ? "▼ " : ""}{fmtAmount(lastDecl.totalAmount)}
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
        ) : null}
      </div>

      {/* Rule + meta */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingTop: "10px",
        borderTop: "1px solid var(--border)",
        gap: "8px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.68rem",
            color: "var(--tx-3)",
            letterSpacing: "0.02em",
          }}>
            <strong style={{ color: "var(--tx-1)", fontWeight: 700 }}>
              {company.declarationCount}
            </strong>{" "}
            décl.
          </span>
          {mcap && (
            <>
              <span className="tearsheet-foot-sep" aria-hidden="true" />
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.68rem",
                color: "var(--tx-3)",
                letterSpacing: "0.02em",
              }}>
                MCap <strong style={{ color: "var(--gold)", fontWeight: 600 }}>{mcap}</strong>
              </span>
            </>
          )}
        </div>
        {lastDecl && (
          <span style={{
            fontSize: "0.64rem",
            color: "var(--tx-4)",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.04em",
          }}>
            {new Date(lastDecl.pubDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" })}
          </span>
        )}
      </div>

      {lastDecl?.insiderName && (
        <div style={{
          fontSize: "0.72rem",
          color: "var(--tx-3)",
          fontStyle: "italic",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginTop: "-4px",
        }}>
          — {lastDecl.insiderName}
        </div>
      )}
    </Link>
  );
}

// ── Active filters badge ────────────────────────────────────────────────────

function ActiveCount({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span style={{
      padding: "1px 6px", borderRadius: "10px",
      background: "var(--c-indigo-bg)", color: "var(--c-indigo-2)",
      fontSize: "0.65rem", fontWeight: 800,
      border: "1px solid var(--c-indigo-bd)",
    }}>
      {n}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function CompaniesClient({ companies, initialQ }: {
  companies: CompanyRow[];
  initialQ?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filter state
  const [q, setQ]             = useState(initialQ ?? "");
  const [cap, setCap]         = useState<CapFilter>("all");
  const [activity, setActivity] = useState<ActivityFilter>("all");
  const [action, setAction]   = useState<ActionFilter>("all");
  const [sort, setSort]       = useState<SortKey>("activity");
  const [showFilters, setShowFilters] = useState(false);

  // Count active filters (non-default)
  const activeFilterCount = [
    cap !== "all", activity !== "all", action !== "all",
  ].filter(Boolean).length;

  // Apply filters + sort
  const filtered = useMemo(() => {
    let rows = companies;

    // Text search
    if (q.trim()) {
      const lq = q.trim().toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(lq) || (c.yahooSymbol ?? "").toLowerCase().includes(lq));
    }

    // Capitalisation filter
    if (cap !== "all") {
      rows = rows.filter((c) => {
        if (cap === "micro") return c.marketCap != null && c.marketCap < 50e6;
        if (cap === "small") return c.marketCap != null && c.marketCap >= 50e6 && c.marketCap < 300e6;
        if (cap === "mid")   return c.marketCap != null && c.marketCap >= 300e6 && c.marketCap < 2e9;
        if (cap === "large") return c.marketCap != null && c.marketCap >= 2e9 && c.marketCap < 10e9;
        if (cap === "mega")  return c.marketCap != null && c.marketCap >= 10e9;
        return true;
      });
    }

    // Activity filter (based on last declaration date)
    if (activity !== "all") {
      const days = activity === "7d" ? 7 : activity === "30d" ? 30 : 90;
      const cutoff = daysAgo(days);
      rows = rows.filter((c) => c.lastDecl && new Date(c.lastDecl.pubDate) >= cutoff);
    }

    // Action filter (based on last declaration type)
    if (action !== "all") {
      rows = rows.filter((c) => {
        if (!c.lastDecl) return false;
        if (action === "buy")  return isBuy(c.lastDecl.transactionNature);
        if (action === "sell") return isSell(c.lastDecl.transactionNature);
        return true;
      });
    }

    // Sort
    rows = [...rows].sort((a, b) => {
      if (sort === "name")     return a.name.localeCompare(b.name, "fr");
      if (sort === "count")    return b.declarationCount - a.declarationCount;
      if (sort === "cap") {
        const acap = a.marketCap ?? 0;
        const bcap = b.marketCap ?? 0;
        return bcap - acap;
      }
      if (sort === "activity") {
        const ad = a.lastDecl?.pubDate ? new Date(a.lastDecl.pubDate).getTime() : 0;
        const bd = b.lastDecl?.pubDate ? new Date(b.lastDecl.pubDate).getTime() : 0;
        return bd - ad;
      }
      return 0;
    });

    return rows;
  }, [companies, q, cap, activity, action, sort]);

  function resetFilters() {
    setCap("all"); setActivity("all"); setAction("all");
  }

  return (
    <div>
      {/* ── Search + filter bar ─────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
        {/* Row 1: search + sort + filter toggle */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 200px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--tx-4)", pointerEvents: "none" }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
              <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrer par nom ou ticker…"
              style={{
                width: "100%", paddingLeft: "34px", paddingRight: q ? "32px" : "12px",
                height: "38px",
                background: "var(--bg-surface)", border: "1px solid var(--border-med)",
                borderRadius: "10px", outline: "none",
                fontFamily: "'Inter', system-ui", fontSize: "0.84rem", color: "var(--tx-1)",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => e.target.style.borderColor = "var(--c-indigo)"}
              onBlur={(e) => e.target.style.borderColor = "var(--border-med)"}
            />
            {q && (
              <button
                onClick={() => setQ("")}
                style={{
                  position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer", color: "var(--tx-4)", display: "flex",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          {/* Sort */}
          <SortDropdown value={sort} onChange={setSort} />

          {/* Filter toggle */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "6px",
              padding: "6px 12px", borderRadius: "9px",
              border: `1px solid ${showFilters || activeFilterCount ? "var(--c-indigo-bd)" : "var(--border-med)"}`,
              background: showFilters || activeFilterCount ? "var(--c-indigo-bg)" : "var(--bg-raised)",
              color: showFilters || activeFilterCount ? "var(--c-indigo-2)" : "var(--tx-2)",
              cursor: "pointer",
              fontFamily: "'Inter', system-ui", fontSize: "0.78rem", fontWeight: 600,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Filtres
            <ActiveCount n={activeFilterCount} />
          </button>
        </div>

        {/* Row 2: filter panels (expanded) */}
        {showFilters && (
          <div style={{
            display: "flex", flexDirection: "column", gap: "10px",
            padding: "14px", borderRadius: "12px",
            background: "var(--bg-raised)", border: "1px solid var(--border)",
            animation: "slideDown 0.15s ease",
          }}>
            {/* Capitalisation */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Inter', system-ui", fontSize: "0.72rem", fontWeight: 700, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.07em", minWidth: "80px" }}>
                Capitalisation
              </span>
              <Pill
                options={["all", "micro", "small", "mid", "large", "mega"] as CapFilter[]}
                value={cap}
                onChange={setCap}
                labels={CAP_LABELS}
              />
            </div>

            {/* Activité */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Inter', system-ui", fontSize: "0.72rem", fontWeight: 700, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.07em", minWidth: "80px" }}>
                Activité
              </span>
              <Pill
                options={["all", "7d", "30d", "90d"] as ActivityFilter[]}
                value={activity}
                onChange={setActivity}
                labels={ACTIVITY_LABELS}
              />
            </div>

            {/* Dernière transaction */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Inter', system-ui", fontSize: "0.72rem", fontWeight: 700, color: "var(--tx-3)", textTransform: "uppercase", letterSpacing: "0.07em", minWidth: "80px" }}>
                Transaction
              </span>
              <Pill
                options={["all", "buy", "sell"] as ActionFilter[]}
                value={action}
                onChange={setAction}
                labels={ACTION_LABELS}
              />
            </div>

            {/* Reset */}
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                style={{
                  alignSelf: "flex-start",
                  padding: "4px 10px", borderRadius: "7px",
                  border: "1px solid var(--border-med)",
                  background: "transparent",
                  fontFamily: "'Inter', system-ui", fontSize: "0.72rem", fontWeight: 600,
                  color: "var(--tx-3)", cursor: "pointer",
                }}
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Results count ───────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: "16px",
      }}>
        <div style={{ fontFamily: "'Inter', system-ui", fontSize: "0.82rem", color: "var(--tx-3)" }}>
          <span style={{ fontWeight: 700, color: "var(--tx-2)" }}>{filtered.length.toLocaleString("fr-FR")}</span>
          {" "}société{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== companies.length && (
            <span style={{ color: "var(--tx-4)" }}> sur {companies.length.toLocaleString("fr-FR")}</span>
          )}
        </div>

        {/* Active filter summary */}
        {activeFilterCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {cap !== "all" && (
              <FilterTag label={CAP_LABELS[cap]} onRemove={() => setCap("all")} />
            )}
            {activity !== "all" && (
              <FilterTag label={ACTIVITY_LABELS[activity]} onRemove={() => setActivity("all")} />
            )}
            {action !== "all" && (
              <FilterTag label={ACTION_LABELS[action]} onRemove={() => setAction("all")} />
            )}
          </div>
        )}
      </div>

      {/* ── Company grid ────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="card p-16 text-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto 12px", color: "var(--tx-3)" }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "6px" }}>
            Aucune société trouvée
          </h2>
          <p style={{ color: "var(--tx-3)", fontSize: "0.84rem", marginBottom: "16px" }}>
            Essayez d&apos;ajuster vos filtres.
          </p>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="btn btn-primary"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((company) => (
            <CompanyCard key={company.id} company={company} q={q} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "2px 8px 2px 10px",
      background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)",
      borderRadius: "20px",
      fontFamily: "'Inter', system-ui", fontSize: "0.7rem", fontWeight: 600,
      color: "var(--c-indigo-2)",
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{ display: "flex", background: "none", border: "none", cursor: "pointer", color: "var(--c-indigo-2)", padding: 0 }}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      </button>
    </span>
  );
}
