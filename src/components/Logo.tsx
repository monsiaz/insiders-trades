/**
 * Logo system — InsiderTrades Sigma
 *
 * All variants are pure SVG inline components (no external image files).
 *
 * Colour scheme — theme-aware via CSS custom properties (no JS required):
 *   Light mode  →  Σ = var(--tx-1) near-black #0A0C10
 *                  Pulse = var(--gold) muted gold #B8955A
 *   Dark mode   →  Σ = var(--tx-1) warm white #F0EDE8
 *                  Pulse = var(--gold) gold #B8955A  (stays gold, pops on dark bg)
 *
 * SVG `stroke` supports CSS var() in all modern browsers — no client component
 * or JS context needed.
 *
 * Exports:
 *   SigmaLogoMark   – standalone icon SVG
 *   LogoMark        – alias (compat)
 *   LogoWordmark    – icon + "InsiderTrades / SIGMA" lockup (nav / footer)
 *   Logo            – alias (compat)
 *   LogoLockup      – alias (compat)
 */

// ─── Core SVG icon ────────────────────────────────────────────────────────

/**
 * The Sigma Σ + pulse ECG mark at any size.
 *
 * By default uses CSS vars so it adapts to light / dark theme automatically.
 * Pass explicit hex strings to override (e.g. for OG images or exports).
 */
export function SigmaLogoMark({
  size = 32,
  stroke = "var(--tx-1)",   // near-black in light, warm white in dark
  pulse  = "var(--gold)",   // brand gold in both themes
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
      {/* Sigma Σ path — adapts to theme via var(--tx-1) */}
      <path
        d="M286 96H160C130 96 115 132 136 154L239 264L138 378C118 401 134 436 164 436H302"
        stroke={stroke}
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Pulse / ECG line — always gold */}
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
            color: "var(--gold)",
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
