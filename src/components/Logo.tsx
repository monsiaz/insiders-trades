import React from "react";

interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

/**
 * LogoMark v3 — InsiderTrades "Midnight Analyst"
 *
 * Concept: un graphique ligne stylisé avec une flèche upward asymétrique.
 * Background deep navy, gradient indigo→emerald, ligne candlestick épurée.
 * Lisible à 16px comme à 256px.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lm-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0A1628"/>
          <stop offset="100%" stopColor="#050C18"/>
        </linearGradient>
        <linearGradient id="lm-accent" x1="0" y1="40" x2="40" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5B8AF6"/>
          <stop offset="60%" stopColor="#7BA3FF"/>
          <stop offset="100%" stopColor="#10B981"/>
        </linearGradient>
        <linearGradient id="lm-spike" x1="20" y1="28" x2="20" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5B8AF6" stopOpacity="0.7"/>
          <stop offset="100%" stopColor="#10B981"/>
        </linearGradient>
      </defs>

      {/* Background rounded square */}
      <rect width="40" height="40" rx="10" fill="url(#lm-bg)"/>

      {/* Border très subtil */}
      <rect width="40" height="40" rx="10" stroke="url(#lm-accent)" strokeWidth="0.8" strokeOpacity="0.25" fill="none"/>

      {/* Baseline chart line gauche — flat */}
      <line x1="5" y1="28" x2="13" y2="28" stroke="white" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.25"/>

      {/* Signal spike — le "insider event" */}
      <polyline
        points="13,28 17,18 20,8 23,18 27,28"
        stroke="url(#lm-accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Right flat — légèrement remonté (signal bullish) */}
      <line x1="27" y1="28" x2="35" y2="24" stroke="url(#lm-accent)" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.6"/>

      {/* Peak dot — emerald */}
      <circle cx="20" cy="8" r="3.2" fill="#050C18"/>
      <circle cx="20" cy="8" r="3.2" stroke="#10B981" strokeWidth="1.8"/>
      <circle cx="20" cy="8" r="1.4" fill="#10B981"/>
    </svg>
  );
}

export function Logo({ size = 32, showText = true, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <div className="flex flex-col leading-none">
          <span
            style={{
              fontSize: size * 0.44,
              fontFamily: "'Banana Grotesk', 'Inter', system-ui, sans-serif",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--tx-1)",
              lineHeight: 1,
            }}
          >
            InsiderTrades
          </span>
          <span
            style={{
              fontSize: size * 0.24,
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 600,
              letterSpacing: "0.09em",
              textTransform: "uppercase" as const,
              color: "var(--tx-3)",
              marginTop: "3px",
            }}
          >
            AMF · France
          </span>
        </div>
      )}
    </div>
  );
}

/** Full wordmark for hero / marketing */
export function LogoLockup({ className = "" }: { className?: string }) {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <LogoMark size={44} />
      <div className="flex flex-col leading-none">
        <span
          style={{
            fontFamily: "'Banana Grotesk', 'Inter', system-ui, sans-serif",
            fontSize: "1.375rem",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: "var(--tx-1)",
            lineHeight: 1,
          }}
        >
          InsiderTrades
        </span>
        <span
          style={{
            fontFamily: "'Inter', system-ui, sans-serif",
            fontSize: "0.6rem",
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase" as const,
            color: "var(--tx-3)",
            marginTop: "4px",
          }}
        >
          Déclarations AMF · Règlement MAR
        </span>
      </div>
    </div>
  );
}
