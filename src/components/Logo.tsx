/**
 * Logo system — InsiderTrades Sigma
 *
 * All variants are pure SVG inline components (no external image files).
 * The mark uses the brand Sigma (Σ) path in navy-blue + a pulse ECG line in cyan.
 * Colors are compatible with both light and dark themes without any CSS tricks:
 *   – Sigma:  #0B5CFF  (vivid blue  — readable on both white & dark bg)
 *   – Pulse:  #14D9E6  (cyan        — readable on both white & dark bg)
 *
 * Exports:
 *   SigmaLogoMark   – standalone icon SVG
 *   LogoMark        – alias for SigmaLogoMark (compat)
 *   LogoWordmark    – icon + "InsiderTrades" text lockup (nav / footer)
 *   Logo            – alias for LogoWordmark (compat)
 *   LogoLockup      – alias for LogoWordmark (compat)
 */

// ─── Brand colours (same on light & dark) ─────────────────────────────────
const SIGMA_BLUE = "#0B5CFF";
const PULSE_CYAN = "#14D9E6";

// ─── Core SVG icon ────────────────────────────────────────────────────────

/**
 * The Sigma Σ + pulse ECG mark at any size.
 * Pass custom `stroke` / `pulse` to override brand colours (e.g. monochrome).
 */
export function SigmaLogoMark({
  size = 32,
  stroke = SIGMA_BLUE,
  pulse = PULSE_CYAN,
}: {
  size?: number;
  stroke?: string;
  pulse?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ flexShrink: 0, display: "block" }}
    >
      {/* Sigma Σ path */}
      <path
        d="M286 96H160C130 96 115 132 136 154L239 264L138 378C118 401 134 436 164 436H302"
        stroke={stroke}
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Pulse / ECG line */}
      <path
        d="M286 264H326L350 374L386 190L412 300H454"
        stroke={pulse}
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Alias — backwards-compat with existing `<LogoMark>` imports. */
export function LogoMark({ size = 32 }: { size?: number }) {
  return <SigmaLogoMark size={size} />;
}

// ─── Full wordmark lockup ─────────────────────────────────────────────────

/**
 * Icon + "InsiderTrades" / "SIGMA" text lockup.
 * Used in the nav bar (height ≈ 34–36) and footer (height ≈ 48–60).
 */
export function LogoWordmark({
  height = 44,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  const iconSize = Math.round(height * 0.92);
  const gap      = Math.round(height * 0.28);
  const titlePx  = Math.round(height * 0.44);
  const subPx    = Math.round(height * 0.21);

  return (
    <span
      className={className}
      aria-label="InsiderTrades Sigma"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        flexShrink: 0,
        textDecoration: "none",
      }}
    >
      <SigmaLogoMark size={iconSize} />

      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
        <span
          style={{
            fontFamily: "'Banana Grotesk', var(--font-inter), system-ui, sans-serif",
            fontWeight: 800,
            fontSize: titlePx,
            letterSpacing: "-0.03em",
            color: "var(--tx-1)",
            lineHeight: 1,
          }}
        >
          InsiderTrades
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            fontSize: subPx,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: PULSE_CYAN,
            marginTop: "3px",
            lineHeight: 1,
          }}
        >
          SIGMA
        </span>
      </span>
    </span>
  );
}

/** Legacy alias — compat with older Logo imports. */
export function Logo({
  size = 32,
  showText = true,
  className = "",
}: {
  size?: number;
  showText?: boolean;
  className?: string;
}) {
  return showText
    ? <LogoWordmark height={size} className={className} />
    : <SigmaLogoMark size={size} />;
}

/** Legacy alias — compat with older LogoLockup imports. */
export function LogoLockup({ className = "" }: { className?: string }) {
  return <LogoWordmark height={44} className={className} />;
}
