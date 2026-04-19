import React from "react";

interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

/**
 * LogoMark v2 — InsiderTrades
 *
 * A bold, distinctive mark that reads at any size.
 * Concept: an EKG flatline that breaks violently upward — the insider signal.
 * Two weight lines (flat/active) + a spike + a mint peak dot.
 *
 * Grid: 40×40 on a 10px-radius indigo square.
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
      {/* Container */}
      <rect width="40" height="40" rx="10" fill="#5B5CF6" />

      {/* Flat line — before event */}
      <path
        d="M5 27 L14 27"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.45"
      />

      {/* The spike — insider event */}
      <path
        d="M14 27 L20 7 L26 27"
        stroke="white"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.95"
      />

      {/* Flat line — after event (slightly elevated: signal confirmed) */}
      <path
        d="M26 27 L35 27"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeOpacity="0.45"
      />

      {/* Peak dot — mint signal */}
      <circle cx="20" cy="7" r="3.5" fill="#00C896" />
      <circle cx="20" cy="7" r="1.6" fill="white" />
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
              fontFamily: "'Banana Grotesk', 'Space Grotesk', system-ui, sans-serif",
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
              fontFamily: "'Banana Grotesk', 'Space Grotesk', system-ui, sans-serif",
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
            fontFamily: "'Banana Grotesk', 'Space Grotesk', system-ui, sans-serif",
            fontSize: "1.375rem",
            fontWeight: 700,
            letterSpacing: "-0.035em",
            color: "var(--tx-1)",
            lineHeight: 1,
          }}
        >
          InsiderTrades
        </span>
        <span
          style={{
            fontFamily: "'Banana Grotesk', 'Space Grotesk', system-ui, sans-serif",
            fontSize: "0.625rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
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
