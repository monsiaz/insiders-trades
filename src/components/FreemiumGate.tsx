"use client";

import Link from "next/link";

interface FreemiumGateProps {
  visibleCount?: number;
  feature?: string;
  locale?: string;
  children: React.ReactNode;
}

export default function FreemiumGate({ children, feature, locale = "en" }: FreemiumGateProps) {
  const isFr = locale === "fr";
  const defaultFeature = isFr ? "cette fonctionnalité" : "this feature";
  const displayFeature = feature ?? defaultFeature;
  return (
    <div style={{ position: "relative" }}>
      {/* Blurred content */}
      <div style={{
        filter: "blur(7px)",
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        opacity: 0.8,
      }}>
        {children}
      </div>

      {/* Overlay CTA */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "14px",
        background: "linear-gradient(to bottom, transparent 0%, var(--bg-base) 60%)",
        zIndex: 10,
        padding: "24px",
      }}>
        <div style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-med)",
          borderRadius: "16px",
          padding: "24px 28px",
          maxWidth: "380px",
          textAlign: "center",
          boxShadow: "var(--shadow-lg)",
        }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "linear-gradient(135deg, var(--c-indigo), var(--c-violet))",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 14px",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="white" strokeWidth="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h3 style={{
            fontFamily: "'Banana Grotesk', 'Inter', system-ui",
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--tx-1)",
            letterSpacing: "-0.025em",
            marginBottom: "6px",
          }}>
            {isFr ? "Contenu réservé aux membres" : "Members-only content"}
          </h3>
          <p style={{
            fontSize: "0.84rem",
            color: "var(--tx-3)",
            lineHeight: 1.5,
            marginBottom: "18px",
            fontFamily: "'Inter', system-ui",
          }}>
            {isFr
              ? `Créez un compte gratuit pour accéder à ${displayFeature} et à toutes les données de signaux insiders.`
              : `Create a free account to access ${displayFeature} and all insider signal data.`}
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
            <Link
              href={isFr ? "/fr/auth/register" : "/auth/register"}
              style={{
                display: "inline-block",
                padding: "9px 20px",
                borderRadius: "10px",
                fontWeight: 700,
                fontSize: "0.875rem",
                fontFamily: "'Inter', system-ui",
                background: "linear-gradient(135deg, var(--c-indigo) 0%, var(--c-violet) 100%)",
                color: "white",
                textDecoration: "none",
                boxShadow: "0 4px 14px rgba(91,92,246,0.4)",
              }}
            >
              {isFr ? "Créer un compte gratuit" : "Create a free account"}
            </Link>
            <Link
              href={isFr ? "/fr/auth/login" : "/auth/login"}
              style={{
                display: "inline-block",
                padding: "9px 16px",
                borderRadius: "10px",
                fontWeight: 600,
                fontSize: "0.875rem",
                fontFamily: "'Inter', system-ui",
                background: "var(--bg-sub)",
                border: "1px solid var(--border-med)",
                color: "var(--tx-2)",
                textDecoration: "none",
              }}
            >
              {isFr ? "Se connecter" : "Sign in"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
