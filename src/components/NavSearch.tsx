"use client";

import {
  useState, useEffect, useRef, useCallback, KeyboardEvent,
} from "react";
import { useRouter, usePathname } from "next/navigation";

// ── Types ──────────────────────────────────────────────────────────────────

interface CompanyResult {
  type: "company";
  name: string;
  slug: string;
  yahooSymbol: string | null;
  currentPrice: number | null;
  marketCap: number | null;
  declarationCount: number;
}

interface InsiderResult {
  type: "insider";
  name: string;
  slug: string;
  declarationCount: number;
}

type SearchResult = CompanyResult | InsiderResult;

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtMcap(n: number | null): string {
  if (!n) return "";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} M€`;
  return "";
}

function fmtTitle(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 42);
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "var(--c-indigo-bg)", color: "var(--c-indigo-2)", borderRadius: "2px", fontWeight: 700 }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

const IconBuilding = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const IconPerson = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
    <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const IconArrow = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconClock = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8"/>
    <polyline points="12 6 12 12 16 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Recent searches (localStorage) ────────────────────────────────────────

const STORAGE_KEY = "it-recent-searches";
const MAX_RECENT = 5;

function getRecent(): SearchResult[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

function addRecent(item: SearchResult) {
  try {
    const prev = getRecent().filter((r) => !(r.type === item.type && r.slug === item.slug));
    localStorage.setItem(STORAGE_KEY, JSON.stringify([item, ...prev].slice(0, MAX_RECENT)));
  } catch {}
}

// ── Debounce hook ──────────────────────────────────────────────────────────

function useDebounce<T>(value: T, ms: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debouncedValue;
}

// ── Main component ─────────────────────────────────────────────────────────

export function NavSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const locale: "fr" | "en" = (pathname === "/fr" || pathname.startsWith("/fr/")) ? "fr" : "en";
  const prefix = locale === "fr" ? "/fr" : "";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ companies: CompanyResult[]; insiders: InsiderResult[] }>({ companies: [], insiders: [] });
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recent, setRecent] = useState<SearchResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebounce(query, 200);

  // Flatten all results for keyboard navigation
  const allResults: SearchResult[] = [
    ...results.companies.map((c) => ({ ...c, type: "company" as const })),
    ...results.insiders.map((i) => ({ ...i, type: "insider" as const })),
  ];

  const showRecent = open && !query && recent.length > 0;
  const showResults = open && query.length >= 2;
  const dropdownItems: SearchResult[] = showRecent ? recent : allResults;

  // Fetch search results
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults({ companies: [], insiders: [] });
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setActiveIndex(-1);

    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`, { signal: abortRef.current.signal })
      .then((r) => r.json())
      .then((data) => {
        setResults(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setLoading(false);
      });
  }, [debouncedQuery]);

  // Load recent on open
  useEffect(() => {
    if (open) setRecent(getRecent());
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Navigate to selected result
  const navigate = useCallback((item: SearchResult) => {
    addRecent(item);
    setOpen(false);
    setQuery("");
    router.push(item.type === "company" ? `${prefix}/company/${item.slug}` : `${prefix}/insider/${item.slug}`);
  }, [router, prefix]);

  // Keyboard handler
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, dropdownItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && dropdownItems[activeIndex]) {
        navigate(dropdownItems[activeIndex]);
      } else if (query.trim()) {
        setOpen(false);
        router.push(`${prefix}/companies?all=1&q=${encodeURIComponent(query.trim())}`);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const isEmpty = showResults && !loading && allResults.length === 0;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", minWidth: 0 }}>

      {/* Input */}
      <div
        className="search-bar"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 12px",
          height: "44px",
          borderRadius: "9px",
          border: `1px solid ${open ? "var(--border-strong)" : "var(--border-med)"}`,
          background: open ? "var(--bg-surface)" : "var(--bg-raised)",
          transition: "all 0.18s ease",
          cursor: "text",
          minWidth: open ? "clamp(160px, 240px, 100%)" : "clamp(140px, 180px, 100%)",
        }}
        onClick={() => { inputRef.current?.focus(); setOpen(true); }}
      >
        <span style={{ color: open ? "var(--c-indigo-2)" : "var(--tx-4)", flexShrink: 0, transition: "color 0.18s", display: "flex" }}>
          <IconSearch />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={locale === "fr" ? "Société ou dirigeant…" : "Company or executive…"}
          autoComplete="off"
          spellCheck={false}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "0.84rem",
            color: "var(--tx-1)",
            width: "100%",
            caretColor: "var(--c-indigo)",
          }}
        />
        {query && (
          <button
            onClick={(e) => { e.stopPropagation(); setQuery(""); setResults({ companies: [], insiders: [] }); inputRef.current?.focus(); }}
            style={{ display: "flex", alignItems: "center", color: "var(--tx-4)", cursor: "pointer", background: "none", border: "none", padding: 0, flexShrink: 0 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (showRecent || showResults || isEmpty) && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: "min(360px, calc(100vw - 24px))",
          maxHeight: "480px",
          overflowY: "auto",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-med)",
          borderRadius: "14px",
          boxShadow: "var(--shadow-lg)",
          zIndex: 500,
          animation: "slideDown 0.15s ease",
        }}>

          {/* Recent searches */}
          {showRecent && (
            <div>
              <div style={{
                padding: "10px 14px 6px",
                fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.08em",
                textTransform: "uppercase", color: "var(--tx-4)",
                fontFamily: "'Inter', system-ui",
              }}>
                {locale === "fr" ? "Récents" : "Recent"}
              </div>
              {recent.map((item, i) => (
                <ResultRow
                  key={`recent-${i}`}
                  item={item}
                  query=""
                  locale={locale}
                  active={i === activeIndex}
                  isRecent
                  onSelect={() => navigate(item)}
                  onHover={() => setActiveIndex(i)}
                />
              ))}
              <div style={{ height: "1px", background: "var(--border)", margin: "6px 0" }} />
              <button
                onClick={() => { localStorage.removeItem(STORAGE_KEY); setRecent([]); }}
                style={{
                  display: "block", width: "100%", textAlign: "center",
                  padding: "8px", fontSize: "0.72rem", color: "var(--tx-4)",
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: "'Inter', system-ui",
                }}
              >
                {locale === "fr" ? "Effacer l'historique" : "Clear history"}
              </button>
            </div>
          )}

          {/* Loading skeleton */}
          {showResults && loading && (
            <div style={{ padding: "14px 14px" }}>
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "var(--bg-raised)", animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: "12px", borderRadius: "4px", background: "var(--bg-raised)", animation: "pulse 1.5s ease-in-out infinite", marginBottom: "6px", width: `${60 + i * 10}%` }} />
                    <div style={{ height: "9px", borderRadius: "3px", background: "var(--bg-raised)", animation: "pulse 1.5s ease-in-out infinite", width: "40%" }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {isEmpty && (
            <div style={{ padding: "28px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "8px", opacity: 0.4 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ margin: "0 auto", color: "var(--tx-4)" }}>
                  <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <path d="M8 11h6M11 8v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p style={{ fontFamily: "'Inter', system-ui", fontSize: "0.84rem", fontWeight: 600, color: "var(--tx-2)", marginBottom: "4px" }}>
                {locale === "fr" ? "Aucun résultat" : "No results"}
              </p>
              <p style={{ fontFamily: "'Inter', system-ui", fontSize: "0.75rem", color: "var(--tx-4)" }}>
                {locale === "fr"
                  ? <>Aucune société ou dirigeant pour &ldquo;{query}&rdquo;</>
                  : <>No company or executive for &ldquo;{query}&rdquo;</>}
              </p>
            </div>
          )}

          {/* Results */}
          {showResults && !loading && allResults.length > 0 && (
            <div style={{ padding: "6px 0" }}>
              {/* Companies section */}
              {results.companies.length > 0 && (
                <>
                  <SectionLabel icon={<IconBuilding />} label={locale === "fr" ? "Sociétés" : "Companies"} count={results.companies.length} />
                  {results.companies.map((c, i) => (
                    <ResultRow
                      key={`co-${c.slug}`}
                      item={{ ...c, type: "company" }}
                      query={query}
                      locale={locale}
                      active={i === activeIndex}
                      onSelect={() => navigate({ ...c, type: "company" })}
                      onHover={() => setActiveIndex(i)}
                    />
                  ))}
                </>
              )}

              {/* Insider section */}
              {results.insiders.length > 0 && (
                <>
                  {results.companies.length > 0 && (
                    <div style={{ height: "1px", background: "var(--border)", margin: "4px 0" }} />
                  )}
                  <SectionLabel icon={<IconPerson />} label={locale === "fr" ? "Dirigeants" : "Executives"} count={results.insiders.length} />
                  {results.insiders.map((ins, i) => {
                    const globalIdx = results.companies.length + i;
                    return (
                      <ResultRow
                        key={`ins-${ins.slug}`}
                        item={{ ...ins, type: "insider" }}
                        query={query}
                        locale={locale}
                        active={globalIdx === activeIndex}
                        onSelect={() => navigate({ ...ins, type: "insider" })}
                        onHover={() => setActiveIndex(globalIdx)}
                      />
                    );
                  })}
                </>
              )}

              {/* See all results */}
              {(results.companies.length >= 6 || results.insiders.length >= 6) && (
                <button
                  onClick={() => { setOpen(false); router.push(`${prefix}/companies?all=1&q=${encodeURIComponent(query)}`); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    gap: "6px", width: "100%", padding: "10px 14px",
                    marginTop: "4px",
                    borderTop: "1px solid var(--border)",
                    background: "none", border: "none",
                    fontFamily: "'Inter', system-ui", fontSize: "0.78rem",
                    fontWeight: 600, color: "var(--c-indigo-2)",
                    cursor: "pointer", transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  {locale === "fr"
                    ? <>Voir tous les résultats pour &ldquo;{query}&rdquo;</>
                    : <>View all results for &ldquo;{query}&rdquo;</>}
                  <IconArrow />
                </button>
              )}
            </div>
          )}

          {/* Keyboard hint */}
          {showResults && !loading && allResults.length > 0 && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              gap: "8px", padding: "7px 14px",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-raised)",
              borderRadius: "0 0 14px 14px",
            }}>
              {(locale === "fr"
                ? [["↑↓", "naviguer"], ["↵", "ouvrir"], ["Esc", "fermer"]]
                : [["↑↓", "navigate"], ["↵", "open"], ["Esc", "close"]]
              ).map(([key, label]) => (
                <span key={key} style={{ display: "flex", alignItems: "center", gap: "4px", fontFamily: "'Inter', system-ui", fontSize: "0.62rem", color: "var(--tx-4)" }}>
                  <kbd style={{ padding: "1px 5px", borderRadius: "4px", background: "var(--bg-active)", border: "1px solid var(--border-med)", fontFamily: "monospace", fontSize: "0.65rem", color: "var(--tx-3)" }}>{key}</kbd>
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SectionLabel({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "6px",
      padding: "8px 14px 4px",
      fontFamily: "'Inter', system-ui",
      fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.08em",
      textTransform: "uppercase", color: "var(--tx-4)",
    }}>
      <span style={{ display: "flex", opacity: 0.7 }}>{icon}</span>
      {label}
      <span style={{
        marginLeft: "auto",
        fontSize: "0.62rem",
        fontWeight: 600,
        color: "var(--tx-4)",
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: "4px",
        padding: "0 5px",
        lineHeight: "1.6",
      }}>
        {count}
      </span>
    </div>
  );
}

function ResultRow({
  item,
  query,
  locale,
  active,
  isRecent = false,
  onSelect,
  onHover,
}: {
  item: SearchResult;
  query: string;
  locale: "fr" | "en";
  active: boolean;
  isRecent?: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const isCompany = item.type === "company";
  const co = isCompany ? (item as CompanyResult) : null;
  const ins = !isCompany ? (item as InsiderResult) : null;

  const declShort = locale === "fr" ? "décl." : "decl.";
  const declFull = locale === "fr" ? "déclarations" : "declarations";

  const meta = isCompany && co
    ? [co.yahooSymbol, fmtMcap(co.marketCap), co.declarationCount ? `${co.declarationCount} ${declShort}` : null].filter(Boolean).join(" · ")
    : ins?.declarationCount
    ? `${ins.declarationCount} ${declFull}`
    : "";

  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onSelect(); }}
      onMouseEnter={onHover}
      style={{
        display: "flex", alignItems: "center", gap: "10px",
        width: "100%", textAlign: "left",
        padding: "11px 14px",
        minHeight: "44px",
        background: active ? "var(--bg-hover)" : "transparent",
        border: "none", cursor: "pointer",
        transition: "background 0.1s",
        fontFamily: "'Inter', system-ui",
      }}
    >
      {/* Icon */}
      <div style={{
        width: "32px", height: "32px", borderRadius: "8px", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: isRecent ? "var(--bg-raised)" : isCompany ? "var(--c-indigo-bg)" : "var(--c-violet-bg)",
        border: `1px solid ${isRecent ? "var(--border)" : isCompany ? "var(--c-indigo-bd)" : "var(--c-violet-bd)"}`,
        color: isRecent ? "var(--tx-3)" : isCompany ? "var(--c-indigo-2)" : "var(--c-violet)",
      }}>
        {isRecent ? <IconClock /> : isCompany ? <IconBuilding /> : <IconPerson />}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "0.84rem", fontWeight: 600, color: "var(--tx-1)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          lineHeight: 1.3,
        }}>
          {highlightMatch(fmtTitle(item.name), query)}
        </div>
        {meta && (
          <div style={{ fontSize: "0.69rem", color: "var(--tx-4)", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {meta}
          </div>
        )}
      </div>

      {/* Arrow on hover */}
      {active && (
        <span style={{ color: "var(--c-indigo-2)", flexShrink: 0, display: "flex" }}>
          <IconArrow />
        </span>
      )}
    </button>
  );
}
