"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark, LogoWordmark } from "./Logo";
import { ThemeToggle } from "./ThemeProvider";
import { NavUser } from "./NavUser";
import { NavSearch } from "./NavSearch";
import { LangSwitcher } from "./LangSwitcher";
import type { Locale } from "@/lib/i18n";

function useLocale(): Locale {
  const pathname = usePathname();
  if (pathname === "/fr" || pathname.startsWith("/fr/")) return "fr";
  return "en";
}

const NAV_LABELS: Record<Locale, { home: string; companies: string; insiders: string; backtest: string; portfolio: string; recommendations: string }> = {
  en: { home: "Home", companies: "Companies", insiders: "Executives", backtest: "Backtesting", portfolio: "Portfolio", recommendations: "Recommendations" },
  fr: { home: "Accueil", companies: "Sociétés", insiders: "Dirigeants", backtest: "Backtesting", portfolio: "Portfolio", recommendations: "Recommandations" },
};

function makeNav(locale: Locale) {
  const L = NAV_LABELS[locale];
  const p = (path: string) => locale === "fr" ? (path === "/" ? "/fr" : `/fr${path}`) : path;
  return [
    {
      href: p("/"),
      label: L.home,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      href: p("/companies"),
      label: L.companies,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      href: p("/insiders"),
      label: L.insiders,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      href: p("/backtest"),
      label: L.backtest,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      href: p("/portfolio"),
      label: L.portfolio,
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      href: p("/recommendations"),
      label: L.recommendations,
      badge: "TOP",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ];
}

const NAV = [
  {
    href: "/",
    label: "Accueil",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/companies",
    label: "Sociétés",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/insiders",
    label: "Dirigeants",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/backtest",
    label: "Backtesting",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/recommendations",
    label: "Recommandations",
    badge: "TOP",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const NAV = makeNav(locale);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Prefetch all primary routes on mount so the first click feels instant.
  useEffect(() => {
    NAV.forEach((item) => {
      try { router.prefetch(item.href); } catch {}
    });
  }, [router]);

  // Close on outside pointer — covers BOTH header and panel refs
  useEffect(() => {
    if (!menuOpen) return;
    function handle(e: PointerEvent) {
      const inHeader = menuRef.current?.contains(e.target as Node);
      const inPanel  = panelRef.current?.contains(e.target as Node);
      if (!inHeader && !inPanel) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [menuOpen]);

  // iOS-safe scroll lock: fixed body trick keeps scroll position
  useEffect(() => {
    if (!menuOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflowY = "scroll";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflowY = "";
      window.scrollTo(0, scrollY);
    };
  }, [menuOpen]);

  return (
    <>
      <header className="app-nav" ref={menuRef}>
        <div className="nav-inner">

          {/* Logo · full wordmark on desktop, mark-only on mobile */}
          <Link href="/" className="nav-logo" aria-label="InsiderTrades Sigma accueil">
            <span className="nav-logo-desktop">
              <LogoWordmark height={36} />
            </span>
            <span className="nav-logo-mobile">
              <LogoMark size={36} />
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="nav-links" aria-label="Navigation principale">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  onMouseEnter={() => { try { router.prefetch(item.href); } catch {} }}
                  className={`nav-link${active ? " active" : ""}`}
                >
                  {item.label}
                  {"badge" in item && item.badge && (
                    <span className="nav-badge">{item.badge}</span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right actions */}
          <div className="nav-actions">
            <NavSearch />
            <LangSwitcher currentLocale={locale} variant="compact" />
            <ThemeToggle />
            <NavUser />
          </div>

          {/* Mobile: lang + user + burger */}
          <div className="nav-mobile-right">
            <LangSwitcher currentLocale={locale} variant="compact" />
            <NavUser />
            <button
              className="nav-burger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? (locale === "fr" ? "Fermer le menu" : "Close menu") : (locale === "fr" ? "Ouvrir le menu" : "Open menu")}
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          </div>
        </div>

      </header>

      {/* Mobile dropdown — rendered OUTSIDE the header to escape contain:paint clipping */}
      {menuOpen && (
        <>
          <div className="nav-mobile-menu" ref={panelRef}>
            <nav>
              {NAV.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={`nav-mobile-link${active ? " active" : ""}`}
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="nav-mobile-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    {"badge" in item && item.badge && (
                      <span className="nav-badge">{item.badge}</span>
                    )}
                    {active && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginLeft: "auto", color: "var(--c-indigo-2)" }}>
                        <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </Link>
                );
              })}

              {/* Bottom row: theme + AMF link */}
              <div className="nav-mobile-footer">
                <ThemeToggle />
                <a
                  href="https://bdif.amf-france.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nav-mobile-link"
                  style={{ flex: 1 }}
                >
                  <span className="nav-mobile-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                      <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <span>Source AMF</span>
                </a>
              </div>
            </nav>
          </div>

          {/* Backdrop — <button> fires reliably on iOS Safari unlike bare divs */}
          <button
            className="nav-backdrop"
            onClick={() => setMenuOpen(false)}
            aria-label="Fermer le menu"
            tabIndex={-1}
          />
        </>
      )}
    </>
  );
}
