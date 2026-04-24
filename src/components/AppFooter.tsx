"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogoWordmark } from "./Logo";
import { LangSwitcher } from "./LangSwitcher";
import type { Locale } from "@/lib/i18n";

// All hrefs include trailing slashes to avoid middleware 301 redirects during
// client-side navigation (trailingSlash:true in next.config.ts requires them).
const NAV_LINKS_FR = [
  { href: "/fr/", label: "Accueil" },
  { href: "/fr/companies/", label: "Sociétés" },
  { href: "/fr/insiders/", label: "Dirigeants" },
  { href: "/fr/recommendations/", label: "Recommandations" },
  { href: "/fr/backtest/", label: "Backtest & Signaux" },
  { href: "/fr/portfolio/", label: "Mon portfolio" },
];
const NAV_LINKS_EN = [
  { href: "/", label: "Home" },
  { href: "/companies/", label: "Companies" },
  { href: "/insiders/", label: "Executives" },
  { href: "/recommendations/", label: "Recommendations" },
  { href: "/backtest/", label: "Backtest & Signals" },
  { href: "/portfolio/", label: "My portfolio" },
];

const ABOUT_LINKS_FR = [
  { href: "/fr/pitch/", label: "Le Pitch investisseur" },
  { href: "/fr/fonctionnement/", label: "Comment ça marche" },
  { href: "/fr/strategie/", label: "Stratégie Sigma ★" },
  { href: "/fr/methodologie/", label: "Méthodologie" },
  { href: "/fr/performance/", label: "Performance & transparence" },
  { href: "/fr/docs/", label: "Documentation API" },
  { href: "/fr/docs/mcp/", label: "MCP Server ↗" },
  { href: "/fr/account/api-keys/", label: "Mes clés API" },
];
const ABOUT_LINKS_EN = [
  { href: "/pitch/", label: "Investor Pitch" },
  { href: "/fonctionnement/", label: "How it works" },
  { href: "/strategie/", label: "Sigma Strategy ★" },
  { href: "/methodologie/", label: "Methodology" },
  { href: "/performance/", label: "Performance & transparency" },
  { href: "/docs/", label: "API Documentation" },
  { href: "/docs/mcp/", label: "MCP Server ↗" },
  { href: "/account/api-keys/", label: "My API keys" },
];

export function AppFooter() {
  const pathname = usePathname();
  const locale: Locale = (pathname === "/fr" || pathname.startsWith("/fr/")) ? "fr" : "en";
  const year = new Date().getFullYear();

  const NAV_LINKS = locale === "fr" ? NAV_LINKS_FR : NAV_LINKS_EN;
  const ABOUT_LINKS = locale === "fr" ? ABOUT_LINKS_FR : ABOUT_LINKS_EN;

  const tagline = locale === "fr"
    ? "Surveillance des déclarations de transactions de dirigeants publiées par l'AMF, conformément au règlement européen MAR."
    : "Track insider transaction declarations published by the AMF, in compliance with the European MAR regulation.";

  const aboutTitle = locale === "fr" ? "À propos" : "About";
  const sourcesTitle = locale === "fr" ? "Sources de données" : "Data sources";
  const amfDesc = locale === "fr" ? "Déclarations MAR · BDIF" : "MAR declarations · BDIF";
  const euronextDesc = locale === "fr" ? "Données boursières · SRD" : "Market data · SRD";
  const disclaimer = locale === "fr"
    ? "Usage informatif · ne constitue pas un conseil en investissement"
    : "Informational use only · not investment advice";
  const amfData = locale === "fr" ? "Données AMF publiques" : "Public AMF data";
  const marReg = locale === "fr" ? "Règlement MAR 596/2014" : "MAR Regulation 596/2014";

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        {/* Top grid */}
        <div className="app-footer-grid">
          {/* Brand column */}
          <div className="app-footer-brand">
            <a
              href={locale === "fr" ? "/fr/" : "/"}
              className="app-footer-logo"
              aria-label="InsiderTrades home"
            >
              <LogoWordmark height={60} />
            </a>
            <p className="app-footer-tagline">{tagline}</p>
            {/* Language switcher */}
            <div style={{ marginTop: "16px" }}>
              <LangSwitcher currentLocale={locale} variant="full" />
            </div>
          </div>

          {/* Navigation */}
          <div className="app-footer-col">
            <div className="app-footer-eyebrow">Navigation</div>
            <ul className="app-footer-links">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="app-footer-link">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* À propos / About */}
          <div className="app-footer-col">
            <div className="app-footer-eyebrow">{aboutTitle}</div>
            <ul className="app-footer-links">
              {ABOUT_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="app-footer-link">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Sources */}
          <div className="app-footer-col">
            <div className="app-footer-eyebrow">{sourcesTitle}</div>
            <div className="app-footer-sources">
              <a
                href="https://bdif.amf-france.org"
                target="_blank"
                rel="noopener noreferrer"
                className="app-footer-source"
                title="AMF · Autorité des Marchés Financiers"
              >
                <span className="app-footer-source-logo">
                  <Image
                    src="/logo-amf.png"
                    alt="AMF · Autorité des Marchés Financiers"
                    width={60}
                    height={26}
                    style={{ objectFit: "contain" }}
                    unoptimized
                  />
                </span>
                <span className="app-footer-source-text">
                  <span className="app-footer-source-name">AMF</span>
                  <span className="app-footer-source-desc">{amfDesc}</span>
                </span>
              </a>

              <a
                href="https://www.euronext.com"
                target="_blank"
                rel="noopener noreferrer"
                className="app-footer-source"
                title="Euronext Paris"
              >
                <span className="app-footer-source-logo">
                  <Image
                    src="/logo-euronext.png"
                    alt="NYSE Euronext"
                    width={60}
                    height={26}
                    style={{ objectFit: "contain", filter: "contrast(1.1)" }}
                    unoptimized
                  />
                </span>
                <span className="app-footer-source-text">
                  <span className="app-footer-source-name">Euronext Paris</span>
                  <span className="app-footer-source-desc">{euronextDesc}</span>
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="app-footer-bottom">
          <div className="app-footer-legal">
            <span className="app-footer-copy">© {year} InsiderTrades</span>
            <span className="app-footer-sep" aria-hidden>·</span>
            <span>{amfData}</span>
            <span className="app-footer-sep" aria-hidden>·</span>
            <span>{marReg}</span>
          </div>
          <div className="app-footer-disclaimer">{disclaimer}</div>
        </div>
      </div>
    </footer>
  );
}
