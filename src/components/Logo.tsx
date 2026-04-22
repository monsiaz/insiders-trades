import Image from "next/image";

interface LogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

/**
 * LogoMark ; the brand icon only (eye + upward arrow).
 *
 * Theme-aware: renders both light and dark variants and relies on CSS classes
 * (.light / .dark on <html>) to show the right one. No JS/flicker.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="logo-mark"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        position: "relative",
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <Image
        src="/logo-mark.webp"
        alt=""
        width={size * 2}
        height={size * 2}
        priority
        className="logo-mark-light"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
      <Image
        src="/logo-mark-dark.webp"
        alt=""
        width={size * 2}
        height={size * 2}
        priority
        className="logo-mark-dark"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </span>
  );
}

/**
 * Logo · mark + "InsiderTrades" text inline (used in nav).
 */
export function Logo({ size = 32, showText = true, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <div className="flex flex-col leading-none">
          <span
            style={{
              fontSize: size * 0.46,
              fontFamily: "'Banana Grotesk', 'Inter', system-ui, sans-serif",
              fontWeight: 800,
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
              color: "var(--tx-2)",
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

/**
 * LogoWordmark ; the full "INSIDERS TRADES SIGMA" lockup with mark above.
 * Perfect for hero / footer / social cards. Theme-aware.
 */
export function LogoWordmark({
  height = 44,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  // Aspect ratio of the processed wordmark ~ 1000×410 → 2.44:1
  const ratio = 1000 / 410;
  const width = Math.round(height * ratio);
  return (
    <span
      className={`logo-wordmark ${className}`}
      style={{
        display: "inline-block",
        width,
        height,
        position: "relative",
        flexShrink: 0,
      }}
      aria-label="InsiderTrades Sigma"
    >
      <Image
        src="/logo-wordmark.webp"
        alt="InsiderTrades Sigma"
        width={width * 2}
        height={height * 2}
        className="logo-wordmark-light"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
      <Image
        src="/logo-wordmark-dark.webp"
        alt=""
        aria-hidden="true"
        width={width * 2}
        height={height * 2}
        className="logo-wordmark-dark"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </span>
  );
}

/** Legacy export kept for compat with older imports. */
export function LogoLockup({ className = "" }: { className?: string }) {
  return <LogoWordmark height={44} className={className} />;
}
