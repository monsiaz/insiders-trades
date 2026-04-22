import Image from "next/image";
import Link from "next/link";
import { LogoWordmark } from "./Logo";

const NAV_LINKS = [
  { href: "/", label: "Accueil" },
  { href: "/companies", label: "Sociétés" },
  { href: "/insiders", label: "Dirigeants" },
  { href: "/recommendations", label: "Recommandations" },
  { href: "/backtest", label: "Backtest & Signaux" },
  { href: "/portfolio", label: "Mon portfolio" },
];

const ABOUT_LINKS = [
  { href: "/fonctionnement", label: "Comment ça marche" },
  { href: "/strategie", label: "Stratégie Sigma ★" },
  { href: "/methodologie", label: "Méthodologie" },
  { href: "/performance", label: "Performance & transparence" },
  { href: "/docs", label: "Documentation API" },
  { href: "/docs/mcp", label: "MCP Server ↗" },
  { href: "/account/api-keys", label: "Mes clés API" },
];

export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        {/* Top grid */}
        <div className="app-footer-grid">
          {/* Brand column */}
          <div className="app-footer-brand">
            <Link
              href="/"
              className="app-footer-logo"
              aria-label="InsiderTrades accueil"
            >
              <LogoWordmark height={60} />
            </Link>
            <p className="app-footer-tagline">
              Surveillance des déclarations de transactions de dirigeants publiées
              par l&apos;AMF, conformément au règlement européen MAR.
            </p>
          </div>

          {/* Navigation */}
          <div className="app-footer-col">
            <div className="app-footer-eyebrow">Navigation</div>
            <ul className="app-footer-links">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="app-footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* À propos */}
          <div className="app-footer-col">
            <div className="app-footer-eyebrow">À propos</div>
            <ul className="app-footer-links">
              {ABOUT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="app-footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Sources */}
          <div className="app-footer-col">
            <div className="app-footer-eyebrow">Sources de données</div>
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
                  <span className="app-footer-source-desc">
                    Déclarations MAR · BDIF
                  </span>
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
                  <span className="app-footer-source-desc">
                    Données boursières · SRD
                  </span>
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
            <span>Données AMF publiques</span>
            <span className="app-footer-sep" aria-hidden>·</span>
            <span>Règlement MAR 596/2014</span>
          </div>
          <div className="app-footer-disclaimer">
            Usage informatif · ne constitue pas un conseil en investissement
          </div>
        </div>
      </div>
    </footer>
  );
}
