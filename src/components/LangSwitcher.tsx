"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { localePath, localeNames, localeFlags, locales, type Locale } from "@/lib/i18n";
import { useState } from "react";

interface LangSwitcherProps {
  currentLocale: Locale;
  /** "compact" for nav header (icon only on mobile), "full" for footer */
  variant?: "compact" | "full";
}

export function LangSwitcher({ currentLocale, variant = "compact" }: LangSwitcherProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // pathname is the browser URL (e.g. /fr/companies or /companies)
  // For each locale, compute the sister page URL
  function getSisterPath(targetLocale: Locale): string {
    // Strip any existing locale prefix first
    let base = pathname;
    for (const loc of locales) {
      if (loc === "en") continue;
      if (base === `/${loc}`) { base = "/"; break; }
      if (base.startsWith(`/${loc}/`)) { base = base.slice(loc.length + 1); break; }
    }
    return localePath(base, targetLocale);
  }

  if (variant === "full") {
    return (
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        {locales.map((loc) => {
          const isActive = loc === currentLocale;
          return (
            <Link
              key={loc}
              href={getSisterPath(loc)}
              aria-current={isActive ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "5px",
                padding: "5px 10px",
                borderRadius: "4px",
                fontSize: "0.75rem",
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: "0.05em",
                border: `1px solid ${isActive ? "var(--gold)" : "var(--border-med)"}`,
                background: isActive ? "var(--gold-bg)" : "transparent",
                color: isActive ? "var(--gold)" : "var(--tx-3)",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              <span>{localeFlags[loc]}</span>
              <span>{localeNames[loc]}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  // Compact dropdown (for nav)
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Select language"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 8px",
          borderRadius: "4px",
          border: "1px solid var(--border-med)",
          background: "transparent",
          color: "var(--tx-2)",
          fontSize: "0.72rem",
          fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.06em",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "border-color 0.15s ease, color 0.15s ease",
        }}
      >
        <span>{localeFlags[currentLocale]}</span>
        <span style={{ display: "none", fontSize: "0.68rem" }} className="lang-label">
          {currentLocale.toUpperCase()}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 100 }}
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Dropdown */}
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              zIndex: 101,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-med)",
              borderRadius: "6px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              overflow: "hidden",
              minWidth: "140px",
            }}
          >
            {locales.map((loc) => {
              const isActive = loc === currentLocale;
              return (
                <Link
                  key={loc}
                  href={getSisterPath(loc)}
                  onClick={() => setOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "9px 14px",
                    fontSize: "0.82rem",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--gold)" : "var(--tx-1)",
                    background: isActive ? "var(--gold-bg)" : "transparent",
                    textDecoration: "none",
                    transition: "background 0.1s ease",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontSize: "1rem" }}>{localeFlags[loc]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: isActive ? 700 : 500 }}>{localeNames[loc]}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
                      {loc === "en" ? ".com/" : `.com/fr/`}
                    </div>
                  </div>
                  {isActive && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <polyline points="20 6 9 17 4 12" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
