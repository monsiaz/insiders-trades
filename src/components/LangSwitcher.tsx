"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { localePath, localeNames, localeFlags, locales, type Locale } from "@/lib/i18n";

interface LangSwitcherProps {
  currentLocale: Locale;
  /** "compact" for nav header (icon only on mobile), "full" for footer */
  variant?: "compact" | "full";
}

export function LangSwitcher({ currentLocale, variant = "compact" }: LangSwitcherProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close the dropdown when the user taps/clicks anywhere outside it.
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent | TouchEvent) {
      const target = ("touches" in e ? e.touches[0]?.target : (e as MouseEvent).target) as Node | null;
      if (target && containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside, true);
    document.addEventListener("touchstart", handleOutside, { capture: true, passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside, true);
      document.removeEventListener("touchstart", handleOutside, true);
    };
  }, [open]);

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Build the sister-page URL for a given target locale.
  // We use a plain <a href> (no onClick) so the browser performs a real full-page
  // load — this is intentional: locale changes must bypass the Next.js client-side
  // router cache (which reuses RSC payloads and ignores x-locale header changes).
  function getSisterPath(targetLocale: Locale): string {
    let base = pathname;
    for (const loc of locales) {
      if (loc === "en") continue;
      if (base === `/${loc}` || base === `/${loc}/`) { base = "/"; break; }
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
            <a
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
            </a>
          );
        })}
      </div>
    );
  }

  // Compact dropdown (for nav)
  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Select language"
        aria-expanded={open}
        aria-haspopup="listbox"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "6px 10px",
          borderRadius: "4px",
          border: "1px solid var(--border-med)",
          background: open ? "var(--gold-bg)" : "transparent",
          color: open ? "var(--gold)" : "var(--tx-2)",
          fontSize: "0.72rem",
          fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.06em",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "border-color 0.15s ease, color 0.15s ease, background 0.15s ease",
          touchAction: "manipulation",
          WebkitTapHighlightColor: "transparent",
          minHeight: "36px",
        }}
      >
        <span style={{ fontSize: "1rem", lineHeight: 1 }}>{localeFlags[currentLocale]}</span>
        <span style={{ fontSize: "0.68rem" }}>
          {currentLocale.toUpperCase()}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Language selector"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 9999,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-med)",
            borderRadius: "6px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.16)",
            overflow: "hidden",
            minWidth: "150px",
          }}
        >
          {locales.map((loc) => {
            const isActive = loc === currentLocale;
            return (
              <a
                key={loc}
                href={getSisterPath(loc)}
                role="option"
                aria-selected={isActive}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 14px",
                  fontSize: "0.82rem",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--gold)" : "var(--tx-1)",
                  background: isActive ? "var(--gold-bg)" : "transparent",
                  textDecoration: "none",
                  transition: "background 0.1s ease",
                  borderBottom: "1px solid var(--border)",
                  touchAction: "manipulation",
                  WebkitTapHighlightColor: "transparent",
                }}
              >
                <span style={{ fontSize: "1.1rem" }}>{localeFlags[loc]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: isActive ? 700 : 500 }}>{localeNames[loc]}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>
                    {loc === "en" ? ".com/" : ".com/fr/"}
                  </div>
                </div>
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <polyline points="20 6 9 17 4 12" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
