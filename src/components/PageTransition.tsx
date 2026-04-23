"use client";

/**
 * PageTransition – full-screen eye overlay on every internal navigation.
 *
 * Why the old version was broken:
 *  1. On mobile / prefetched routes the `click` event fires AFTER the route
 *     has already changed, so `finishLoading()` was never called → overlay
 *     stuck on screen.
 *  2. `visible` was captured in a stale closure inside the [currKey] effect.
 *
 * Fixes applied:
 *  - `touchstart` interception fires before navigation, even on fast routes.
 *  - A `visibleRef` (always fresh) replaces closure-captured `visible` state.
 *  - Route-change effect always calls `finishLoading()` — guard is inside the
 *    function via `visibleRef`.
 *  - Hard 3 s safety cap: overlay always exits even if `finishLoading()` is
 *    somehow never called.
 *  - Touch/click dedup flag prevents double-triggering on touch devices.
 */

import { useEffect, useRef, useState, Suspense, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const MIN_MS   = 550;   // minimum visible duration (ms)
const ENTER_MS = 240;   // "enter" → "scan" transition
const BLINK_MS = 200;   // eye blink on close
const FADE_MS  = 280;   // overlay fade-out
const MAX_MS   = 3000;  // hard safety cap — overlay ALWAYS exits by this time

// ── Animated SVG eye ─────────────────────────────────────────────────────────

function SigmaEye({ scanning, closing }: { scanning: boolean; closing: boolean }) {
  return (
    <svg
      viewBox="-115 -72 230 144"
      width="200"
      height="126"
      aria-hidden
      style={{
        display: "block",
        overflow: "visible",
        transform: closing ? "scaleY(0.04)" : "scaleY(1)",
        transition: closing
          ? `transform ${BLINK_MS}ms cubic-bezier(0.55,0,1,0.45)`
          : "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)",
        transformOrigin: "center center",
        willChange: "transform",
      }}
    >
      <defs>
        <radialGradient id="pt-iris" cx="42%" cy="38%" r="64%">
          <stop offset="0%"   stopColor="#F0C878" />
          <stop offset="30%"  stopColor="#C9A058" />
          <stop offset="65%"  stopColor="#8A6030" />
          <stop offset="100%" stopColor="#3C2A0E" />
        </radialGradient>
        <radialGradient id="pt-pupil" cx="36%" cy="32%" r="72%">
          <stop offset="0%"   stopColor="#1E1A14" />
          <stop offset="100%" stopColor="#060810" />
        </radialGradient>
        <filter id="pt-glow" x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="pt-dot-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id="pt-clip">
          <path d="M -105 0 Q 0 -64 105 0 Q 0 64 -105 0 Z" />
        </clipPath>
      </defs>
      <path d="M -105 0 Q 0 -64 105 0 Q 0 64 -105 0 Z" fill="#09101c" />
      <g clipPath="url(#pt-clip)">
        <circle cx="0" cy="0" r="40" fill="url(#pt-iris)" filter="url(#pt-glow)"
          style={{ animation: scanning ? "pt-iris-breathe 2.4s ease-in-out infinite" : "none" }} />
        <circle cx="0" cy="0" r="40" fill="none" stroke="#D4A860" strokeWidth="0.65" opacity="0.85" />
        <circle cx="0" cy="0" r="32" fill="none" stroke="#C09050" strokeWidth="0.45" opacity="0.65" />
        <circle cx="0" cy="0" r="24" fill="none" stroke="#A87840" strokeWidth="0.35" opacity="0.45" />
        <g style={{
          transformOrigin: "0px 0px",
          animation: scanning ? "pt-scan 2.1s linear infinite" : "none",
        }}>
          <path d="M 0 -40 A 40 40 0 0 1 34.6 20"
            stroke="#F0C878" strokeWidth="3" fill="none" strokeLinecap="round"
            filter="url(#pt-glow)" />
          <circle cx="34.6" cy="20" r="3.5" fill="#FFD888" filter="url(#pt-dot-glow)" />
          <circle cx="0" cy="-40" r="1.8" fill="#F0C878" opacity="0.5" />
        </g>
        <circle cx="0" cy="0" r="15" fill="url(#pt-pupil)"
          style={{ animation: scanning ? "pt-pupil-pulse 2.1s ease-in-out infinite" : "none" }} />
        <g opacity={scanning ? 1 : 0.5} style={{ transition: "opacity 0.5s ease" }}>
          <line x1="0" y1="9" x2="0" y2="-3" stroke="#F0C878" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M -5 2 L 0 -5 L 5 2" stroke="#F0C878" strokeWidth="2.2" fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
      <path d="M -105 0 Q 0 -64 105 0 Q 0 64 -105 0 Z"
        fill="none" stroke="#C9A058" strokeWidth="2" filter="url(#pt-glow)" />
      <g opacity="0.45" strokeLinecap="round">
        <line x1="-104" y1="-2"  x2="-118" y2="-13" stroke="#B89050" strokeWidth="1.4" />
        <line x1="-104" y1="2"   x2="-118" y2="13"  stroke="#B89050" strokeWidth="1.4" />
        <line x1="104"  y1="-2"  x2="118"  y2="-13" stroke="#B89050" strokeWidth="1.4" />
        <line x1="104"  y1="2"   x2="118"  y2="13"  stroke="#B89050" strokeWidth="1.4" />
      </g>
    </svg>
  );
}

const KEYFRAMES = `
  @keyframes pt-scan { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes pt-pupil-pulse { 0%,100%{r:15} 50%{r:17.5} }
  @keyframes pt-iris-breathe { 0%,100%{opacity:1} 50%{opacity:0.82} }
  @keyframes pt-ring-breathe { 0%,100%{opacity:0.12;transform:scale(1)} 50%{opacity:0.22;transform:scale(1.04)} }
  @keyframes pt-ring-breathe-2 { 0%,100%{opacity:0.07;transform:scale(1)} 50%{opacity:0.14;transform:scale(1.06)} }
  @keyframes pt-label-in { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
`;

// ── Core logic ────────────────────────────────────────────────────────────────

type Phase = "enter" | "scan" | "exit";

function TransitionInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const currKey      = pathname + "?" + searchParams.toString();
  const prevKey      = useRef(currKey);

  const [visible,  setVisible]  = useState(false);
  const [phase,    setPhase]    = useState<Phase>("enter");

  // Always-fresh ref so effects never read stale state from closures
  const visibleRef  = useRef(false);
  const startAt     = useRef(0);

  const exitTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep visibleRef in sync
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  const clearTimers = useCallback(() => {
    if (exitTimer.current)   clearTimeout(exitTimer.current);
    if (enterTimer.current)  clearTimeout(enterTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
  }, []);

  const finishLoading = useCallback(() => {
    if (!visibleRef.current) return; // nothing to close
    clearTimers();
    const elapsed   = Date.now() - startAt.current;
    const remaining = Math.max(0, MIN_MS - elapsed);
    exitTimer.current = setTimeout(() => {
      setPhase("exit");
      setTimeout(() => {
        setVisible(false);
        visibleRef.current = false;
      }, BLINK_MS + FADE_MS);
    }, remaining);
  }, [clearTimers]);

  const startLoading = useCallback(() => {
    // Skip animation for users who prefer reduced motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    clearTimers();
    startAt.current = Date.now();
    visibleRef.current = true;
    setPhase("enter");
    setVisible(true);
    enterTimer.current = setTimeout(() => setPhase("scan"), ENTER_MS);
    // Hard safety: overlay always exits within MAX_MS no matter what
    safetyTimer.current = setTimeout(() => {
      if (visibleRef.current) finishLoading();
    }, MAX_MS);
  }, [clearTimers, finishLoading]);

  // ── Route change → finish the loading animation ───────────────────────────
  useEffect(() => {
    if (currKey !== prevKey.current) {
      prevKey.current = currKey;
      // Always call finishLoading — guard is inside via visibleRef
      finishLoading();
    }
  }, [currKey, finishLoading]);

  // ── Intercept touches BEFORE navigation (mobile-first) ───────────────────
  useEffect(() => {
    let touchPending = false; // dedup: skip click if touch already handled

    function onTouchStart(e: TouchEvent) {
      const a = (e.target as Element).closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("http") || href.startsWith("//")
        || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (a.hasAttribute("download") || a.target === "_blank") return;
      const dest = href.split("?")[0].split("#")[0];
      if (dest && dest !== window.location.pathname) {
        touchPending = true;
        startLoading();
        // Reset flag after 1s (in case click never fires)
        setTimeout(() => { touchPending = false; }, 1000);
      }
    }

    function onClickCapture(e: MouseEvent) {
      if (touchPending) { touchPending = false; return; } // already handled
      const a = (e.target as Element).closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      if (!href || href.startsWith("http") || href.startsWith("//")
        || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (a.hasAttribute("download") || a.target === "_blank") return;
      const dest = href.split("?")[0].split("#")[0];
      if (dest && dest !== window.location.pathname) startLoading();
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("click",      onClickCapture);
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("click",      onClickCapture);
    };
  }, [startLoading]);

  // ── Back / forward navigation ─────────────────────────────────────────────
  useEffect(() => {
    const onPopState = () => startLoading();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [startLoading]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!visible) return null;

  const isExit     = phase === "exit";
  const isScanning = phase === "scan";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* Full-screen overlay */}
      <div
        aria-hidden
        role="presentation"
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 20,
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, #0E1828 0%, #060810 100%)",
          opacity: isExit ? 0 : 1,
          transition: isExit
            ? `opacity ${FADE_MS}ms ease ${BLINK_MS}ms`
            : "opacity 0.2s ease",
          pointerEvents: isExit ? "none" : "all",
        }}
      >
        {[320, 220, 150].map((size, i) => (
          <div key={size} style={{
            position: "absolute", width: size, height: size,
            borderRadius: "50%", border: "1px solid rgba(184,149,90,0.10)",
            animation: `${i % 2 === 0 ? "pt-ring-breathe" : "pt-ring-breathe-2"} ${2.4 + i * 0.6}s ease-in-out infinite`,
            animationDelay: `${i * 0.4}s`, pointerEvents: "none",
          }} />
        ))}

        <div style={{
          transform: phase === "enter" ? "scale(0.78)" : "scale(1)",
          transition: phase === "enter" ? "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)" : "none",
          willChange: "transform", position: "relative", zIndex: 1,
        }}>
          <SigmaEye scanning={isScanning} closing={isExit} />
        </div>

        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.56rem", fontWeight: 600,
          letterSpacing: "0.22em", textTransform: "uppercase",
          color: "rgba(200,160,88,0.55)",
          animation: isScanning ? "pt-label-in 0.4s ease forwards" : "none",
          opacity: isScanning ? undefined : 0,
          userSelect: "none", position: "relative", zIndex: 1,
        }}>
          {pathname.startsWith("/fr") ? "Sigma · Chargement" : "Sigma · Loading"}
        </div>
      </div>

      {/* Gold progress bar */}
      <div aria-hidden style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 2,
        zIndex: 9999, background: "var(--gold)",
        boxShadow: "0 0 12px rgba(184,149,90,0.7)",
        opacity: isExit ? 0 : 1,
        transition: isExit ? "opacity 0.2s ease" : "none",
        pointerEvents: "none",
        animation: isScanning ? "pt-iris-breathe 1.2s ease-in-out infinite" : "none",
      }} />
    </>
  );
}

export function PageTransition() {
  return (
    <Suspense fallback={null}>
      <TransitionInner />
    </Suspense>
  );
}
