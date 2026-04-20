import Image from "next/image";
import Link from "next/link";
import { LogoMark } from "./Logo";

export function AppFooter() {
  return (
    <footer
      className="mt-16"
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-surface)",
      }}
    >
      <div className="content-wrapper py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">

          {/* Brand column */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <LogoMark size={28} />
              <span
                style={{
                  fontFamily: "'Banana Grotesk', 'Space Grotesk', system-ui, sans-serif",
                  fontWeight: 700,
                  fontSize: "0.95rem",
                  letterSpacing: "-0.03em",
                  color: "var(--tx-1)",
                }}
              >
                InsiderTrades
              </span>
            </div>
            <p style={{ fontSize: "0.8rem", color: "var(--tx-3)", lineHeight: 1.65, maxWidth: "260px" }}>
              Surveillance des déclarations de transactions de dirigeants publiées par l&apos;AMF, conformément au règlement européen MAR.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <div
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--tx-3)",
                marginBottom: "12px",
              }}
            >
              Navigation
            </div>
            <div className="flex flex-col gap-2">
              {[
                { href: "/", label: "Accueil" },
                { href: "/companies", label: "Sociétés" },
                { href: "/insiders", label: "Dirigeants" },
                { href: "/backtest", label: "Backtest & Signaux" },
                { href: "/portfolio", label: "Mon portfolio" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{ fontSize: "0.82rem", color: "var(--tx-2)" }}
                  className="hover:text-[var(--tx-1)] transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Data sources */}
          <div>
            <div
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--tx-3)",
                marginBottom: "12px",
              }}
            >
              Sources de données
            </div>
            <div className="flex flex-col gap-4">
              <a
                href="https://bdif.amf-france.org"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 group"
                title="AMF — Autorité des Marchés Financiers"
              >
                <div
                  className="flex items-center justify-center rounded-lg overflow-hidden flex-shrink-0"
                  style={{
                    width: 72,
                    height: 36,
                    background: "#fff",
                    padding: "4px 8px",
                  }}
                >
                  <Image
                    src="/logo-amf.png"
                    alt="AMF — Autorité des Marchés Financiers"
                    width={60}
                    height={26}
                    style={{ objectFit: "contain" }}
                    unoptimized
                  />
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--tx-1)" }}>AMF</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--tx-3)" }}>Déclarations MAR · BDIF</div>
                </div>
              </a>

              <a
                href="https://www.euronext.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 group"
                title="Euronext Paris"
              >
                <div
                  className="flex items-center justify-center rounded-lg overflow-hidden flex-shrink-0"
                  style={{
                    width: 72,
                    height: 36,
                    background: "#fff",
                    padding: "4px 8px",
                  }}
                >
                  <Image
                    src="/logo-euronext.png"
                    alt="NYSE Euronext"
                    width={60}
                    height={26}
                    style={{ objectFit: "contain", filter: "contrast(1.1)" }}
                    unoptimized
                  />
                </div>
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--tx-1)" }}>Euronext Paris</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--tx-3)" }}>Données boursières · SRD</div>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 pt-6"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <div style={{ fontSize: "0.72rem", color: "var(--tx-4)" }}>
            © {new Date().getFullYear()} InsiderTrades · Données AMF publiques · Règlement MAR 596/2014
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--tx-4)" }}>
            Usage informatif uniquement · non-conseil en investissement
          </div>
        </div>
      </div>
    </footer>
  );
}
