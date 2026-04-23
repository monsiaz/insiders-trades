"use client";

/**
 * PageTransition — animated full-screen overlay on every internal navigation.
 *
 * Phases:
 *   "enter"  → overlay fades in, eye scales up with spring (0–280ms)
 *   "scan"   → iris arc rotates, pupil pulses, rings breathe
 *   "exit"   → eye blinks shut (scaleY → 0), overlay fades out
 *
 * Guarantees a minimum display of MIN_MS so the animation is always visible,
 * even on ISR-cached pages that resolve in < 50ms.
 *
 * Wrapped in <Suspense> because useSearchParams() requires it in App Router.
 */

import { useEffect, useRef, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MIN_MS   = 640;  // minimum overlay duration (ms)
const ENTER_MS = 260;  // enter animation duration (ms) before "scan" phase
const BLINK_MS = 220;  // eye blink/close duration (ms)
const FADE_MS  = 300;  // overlay fade-out duration (ms)

// ── Animated SVG eye ─────────────────────────────────────────────────────────

function SigmaEye({ scanning, closing }: { scanning: boolean; closing: boolean }) {
  return (
    <svg
      viewBox="-115 -72 230 144"
      width="230"
      height="144"
      aria-hidden
      style={{
        display: "block",
        overflow: "visible",
        transform: closing ? "scaleY(0.04)" : "scaleY(1)",
        transition: closing
          ? `transform ${BLINK_MS}ms cubic-bezier(0.55, 0, 1, 0.45)`
          : "transform 0.45s cubic-bezier(0.34,1.56,0.64,1)",
        transformOrigin: "center center",
        willChange: "transform",
      }}
    >
      <defs>
        {/* Iris gradient — deep gold to dark amber */}
        <radialGradient id="pt-iris" cx="42%" cy="38%" r="64%">
          <stop offset="0%"   stopColor="#F0C878" />
          <stop offset="30%"  stopColor="#C9A058" />
          <stop offset="65%"  stopColor="#8A6030" />
          <stop offset="100%" stopColor="#3C2A0E" />
        </radialGradient>

        {/* Pupil gradient */}
        <radialGradient id="pt-pupil" cx="36%" cy="32%" r="72%">
          <stop offset="0%"   stopColor="#1E1A14" />
          <stop offset="100%" stopColor="#060810" />
        </radialGradient>

        {/* Outer glow for iris & outline */}
        <filter id="pt-glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Tight glow for scan dot */}
        <filter id="pt-dot-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Clip to eye silhouette */}
        <clipPath id="pt-clip">
          <path d="M -105 0 Q 0 -64 105 0 Q 0 64 -105 0 Z" />
        </clipPath>
      </defs>

      {/* ── Eye background fill ── */}
      <path d="M -105 0 Q 0 -64 105 0 Q 0 64 -105 0 Z" fill="#09101c" />

      {/* ── Everything inside the eye shape ── */}
      <g clipPath="url(#pt-clip)">

        {/* Iris */}
        <circle cx="0" cy="0" r="40"
          fill="url(#pt-iris)"
          filter="url(#pt-glow)"
          style={{ animation: scanning ? "pt-iris-breathe 2.4s ease-in-out infinite" : "none" }}
        />

        {/* Iris rings (from outer to inner) */}
        <circle cx="0" cy="0" r="40" fill="none" stroke="#D4A860" strokeWidth="0.65" opacity="0.85" />
        <circle cx="0" cy="0" r="32" fill="none" stroke="#C09050" strokeWidth="0.45" opacity="0.65" />
        <circle cx="0" cy="0" r="24" fill="none" stroke="#A87840" strokeWidth="0.35" opacity="0.45" />

        {/* ── Rotating scan arc ── */}
        <g style={{
          transformOrigin: "0px 0px",
          animation: scanning ? "pt-scan 2.1s linear infinite" : "none",
        }}>
          {/* Main arc: roughly 130° sweep */}
          <path
            d="M 0 -40 A 40 40 0 0 1 34.6 20"
            stroke="#F0C878"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            filter="url(#pt-glow)"
          />
          {/* Leading bright dot */}
          <circle cx="34.6" cy="20" r="3.5"
            fill="#FFD888"
            filter="url(#pt-dot-glow)"
          />
          {/* Tail fade dot at arc start */}
          <circle cx="0" cy="-40" r="1.8"
            fill="#F0C878"
            opacity="0.5"
          />
        </g>

        {/* Pupil */}
        <circle cx="0" cy="0" r="15"
          fill="url(#pt-pupil)"
          style={{ animation: scanning ? "pt-pupil-pulse 2.1s ease-in-out infinite" : "none" }}
        />

        {/* Brand arrow: upward pointer inside pupil */}
        <g opacity={scanning ? 1 : 0.5}
          style={{ transition: "opacity 0.5s ease" }}>
          <line x1="0" y1="9" x2="0" y2="-3"
            stroke="#F0C878" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M -5 2 L 0 -5 L 5 2"
            stroke="#F0C878" strokeWidth="2.2" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        </g>

      </g>

      {/* ── Eye outline + glow ── */}
      <path d="M -105 0 Q 0 -64 105 0 Q 0 64 -105 0 Z"
        fill="none"
        stroke="#C9A058"
        strokeWidth="2"
        filter="url(#pt-glow)"
      />

      {/* ── Corner lash accents ── */}
      <g opacity="0.45" strokeLinecap="round">
        <line x1="-104" y1="-2"  x2="-118" y2="-13" stroke="#B89050" strokeWidth="1.4" />
        <line x1="-104" y1="2"   x2="-118" y2="13"  stroke="#B89050" strokeWidth="1.4" />
        <line x1="104"  y1="-2"  x2="118"  y2="-13" stroke="#B89050" strokeWidth="1.4" />
        <line x1="104"  y1="2"   x2="118"  y2="13"  stroke="#B89050" strokeWidth="1.4" />
      </g>
    </svg>
  );
}

// ── Inline keyframes ──────────────────────────────────────────────────────────

const KEYFRAMES = `
  @keyframes pt-scan {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes pt-pupil-pulse {
    0%, 100% { r: 15; }
    50%       { r: 17.5; }
  }
  @keyframes pt-iris-breathe {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.82; }
  }
  @keyframes pt-ring-breathe {
    0%, 100% { opacity: 0.12; transform: scale(1); }
    50%       { opacity: 0.22; transform: scale(1.04); }
  }
  @keyframes pt-ring-breathe-2 {
    0%, 100% { opacity: 0.07; transform: scale(1); }
    50%       { opacity: 0.14; transform: scale(1.06); }
  }
  @keyframes pt-label-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

// ── Main component logic ──────────────────────────────────────────────────────

type Phase = "enter" | "scan" | "exit";

function TransitionInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const currKey      = pathname + "?" + searchParams.toString();
  const prevKey      = useRef(currKey);

  const [visible, setVisible] = useState(false);
  const [phase,   setPhase]   = useState<Phase>("enter");

  const startAt     = useRef(0);
  const exitTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (exitTimer.current)  clearTimeout(exitTimer.current);
    if (enterTimer.current) clearTimeout(enterTimer.current);
  }

  function startLoading() {
    clearTimers();
    startAt.current = Date.now();
    setPhase("enter");
    setVisible(true);
    // Transition to "scan" after the enter animation finishes
    enterTimer.current = setTimeout(() => setPhase("scan"), ENTER_MS);
  }

  function finishLoading() {
    const elapsed   = Date.now() - startAt.current;
    const remaining = Math.max(0, MIN_MS - elapsed);
    exitTimer.current = setTimeout(() => {
      setPhase("exit");
      // Give the blink animation time to run, then fade the overlay
      setTimeout(() => setVisible(false), BLINK_MS + FADE_MS);
    }, remaining);
  }

  // ── Intercept internal link clicks ────────────────────────────────────────
  useEffect(() => {
    function onClickCapture(e: MouseEvent) {
      const a = (e.target as Element).closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!href
        || href.startsWith("http")
        || href.startsWith("//")
        || href.startsWith("#")
        || href.startsWith("mailto:")
        || href.startsWith("tel:"))  return;
      if (a.hasAttribute("download") || a.target === "_blank") return;
      // Only trigger if destination differs from current path
      const dest = href.split("?")[0].split("#")[0];
      if (dest && dest !== window.location.pathname) startLoading();
    }
    document.addEventListener("click", onClickCapture);
    return () => document.removeEventListener("click", onClickCapture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Detect pathname change → navigation complete ──────────────────────────
  useEffect(() => {
    if (currKey !== prevKey.current) {
      prevKey.current = currKey;
      if (visible) finishLoading();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currKey]);

  // Cleanup
  useEffect(() => () => clearTimers(), []);

  if (!visible) return null;

  const isExit    = phase === "exit";
  const isScanning = phase === "scan";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* ── Full-screen overlay ── */}
      <div
        aria-hidden
        role="presentation"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          // Radial gradient: slightly lighter navy centre to pitch-black edges
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, #0E1828 0%, #060810 100%)",
          opacity: isExit ? 0 : 1,
          transition: isExit
            ? `opacity ${FADE_MS}ms ease ${BLINK_MS}ms`
            : "opacity 0.22s ease",
          pointerEvents: isExit ? "none" : "all",
        }}
      >
        {/* Background breathing rings */}
        {[320, 220, 150].map((size, i) => (
          <div
            key={size}
            style={{
              position: "absolute",
              width: size,
              height: size,
              borderRadius: "50%",
              border: "1px solid rgba(184,149,90,0.10)",
              animation: `${i % 2 === 0 ? "pt-ring-breathe" : "pt-ring-breathe-2"} ${2.4 + i * 0.6}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
              pointerEvents: "none",
            }}
          />
        ))}

        {/* Eye — scales in on enter, blinks on exit */}
        <div
          style={{
            transform: phase === "enter" ? "scale(0.78)" : "scale(1)",
            transition: phase === "enter"
              ? `transform 0.42s cubic-bezier(0.34,1.56,0.64,1)`
              : "none",
            willChange: "transform",
            position: "relative",
            zIndex: 1,
          }}
        >
          <SigmaEye scanning={isScanning} closing={isExit} />
        </div>

        {/* Label */}
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.58rem",
            fontWeight: 600,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(200,160,88,0.55)",
            animation: isScanning ? "pt-label-in 0.4s ease forwards" : "none",
            opacity: isScanning ? undefined : 0,
            userSelect: "none",
            position: "relative",
            zIndex: 1,
          }}
        >
                    {typeof window !== "undefined" && window.location.pathname.startsWith("/fr") ? "Sigma · Chargement" : "Sigma · Loading"}
        </div>
      </div>

      {/* Gold top bar — persistent progress indicator (above overlay) */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0,
          height: 2,
          zIndex: 9999,
          background: "var(--gold)",
          boxShadow: "0 0 12px rgba(184,149,90,0.7)",
          opacity: isExit ? 0 : 1,
          transition: isExit ? "opacity 0.2s ease" : "none",
          pointerEvents: "none",
          animation: isScanning ? "pt-iris-breathe 1.2s ease-in-out infinite" : "none",
        }}
      />
    </>
  );
}

// ── Public export ─────────────────────────────────────────────────────────────

export function PageTransition() {
  return (
    <Suspense fallback={null}>
      <TransitionInner />
    </Suspense>
  );
}
