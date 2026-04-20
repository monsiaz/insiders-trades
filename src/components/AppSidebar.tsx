"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeProvider";
import { NavUser } from "./NavUser";
import { NavSearch } from "./NavSearch";

const NAV = [
  {
    href: "/",
    label: "Accueil",
    icon: (
      <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/companies",
    label: "Sociétés",
    icon: (
      <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="12" y1="12" x2="12" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/insiders",
    label: "Dirigeants",
    icon: (
      <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    href: "/backtest",
    label: "Backtesting",
    icon: (
      <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    icon: (
      <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none">
        <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    href: "/recommendations",
    label: "Recommandations",
    badge: "TOP",
    icon: (
      <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <nav className="app-sidebar" aria-label="Navigation principale">
      {/* Logo — icon always visible; on hover: name beside + tagline below */}
      <div className="mb-4 flex-shrink-0 w-full">
        <Link href="/" className="block" aria-label="InsiderTrades accueil">
          <div className="flex items-center gap-3 px-3 py-1">
            <LogoMark size={36} />
            <div className="sidebar-label">
              <div style={{ fontFamily: "'Banana Grotesk', 'Inter', system-ui, sans-serif", fontWeight: 700, fontSize: "0.875rem", letterSpacing: "-0.025em", color: "var(--tx-1)" }}>InsiderTrades</div>
              <div style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "0.58rem", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--tx-3)", fontWeight: 600 }}>AMF · France</div>
            </div>
          </div>
        </Link>
        {/* Brand tagline — slides in below logo when sidebar expands */}
        <div className="sidebar-brand-text px-3 pb-1">
          <div style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "0.60rem",
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: "var(--c-indigo-2)",
            paddingLeft: "8px",
            borderLeft: "2px solid var(--c-indigo)",
            opacity: 0.75,
          }}>
            Signaux · Backtest · AMF
          </div>
        </div>
      </div>

      {/* Nav links */}
      <div className="sidebar-nav">
        {NAV.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`sidebar-link ${active ? "active" : ""}`}>
              {item.icon}
              <span className="sidebar-label flex items-center gap-1.5">
                {item.label}
                {"badge" in item && item.badge && (
                  <span style={{
                    fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.06em",
                    padding: "1px 5px", borderRadius: "4px",
                    background: "var(--c-mint-bg)", color: "var(--c-mint)",
                    border: "1px solid var(--c-mint-bd)", lineHeight: 1.4,
                  }}>
                    {item.badge}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Footer: theme + user */}
      <div className="sidebar-footer flex flex-col gap-2 items-center">
        <ThemeToggle />
        <a
          href="https://bdif.amf-france.org"
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-link w-full"
          style={{ margin: 0 }}
          title="AMF BDIF"
        >
          <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none">
            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="sidebar-label text-[var(--tx-3)]">AMF ↗</span>
        </a>
      </div>
    </nav>
  );
}

export function AppTopBar() {
  const pathname = usePathname();
  const currentNav = NAV.find((n) => n.href === "/" ? pathname === "/" : pathname.startsWith(n.href));

  return (
    <div className="app-topbar">
      {/* Mobile: logo */}
      <Link href="/" className="topbar-logo-mobile flex items-center gap-2 flex-shrink-0 md:hidden">
        <LogoMark size={28} />
        <span style={{ fontFamily: "'Banana Grotesk', 'Inter', system-ui, sans-serif", fontWeight: 700, fontSize: "0.875rem", letterSpacing: "-0.025em", color: "var(--tx-1)" }}>InsiderTrades</span>
      </Link>

      {/* Page title — with brand accent dot */}
      <div className="hidden md:flex items-center gap-2">
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--c-indigo)", flexShrink: 0, display: "inline-block" }} />
        <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: "0.875rem", fontWeight: 500, color: "var(--tx-2)", letterSpacing: "0" }}>
          {currentNav?.label ?? "InsiderTrades"}
        </span>
      </div>

      <div className="flex-1" />

      {/* Right actions */}
      <NavSearch />
      <ThemeToggle />
      <NavUser />
    </div>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav className="mobile-tabbar" aria-label="Navigation mobile">
      {NAV.slice(0, 5).map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={`tab-bar-item ${active ? "active" : ""}`}>
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
