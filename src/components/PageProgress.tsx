"use client";

/**
 * PageProgress — thin gold progress bar at the top of the viewport.
 *
 * Shows on EVERY internal navigation (even fast ISR-cached pages):
 *  1. Intercepts clicks on internal <a> links → starts the bar immediately
 *  2. Watches pathname changes → completes & hides the bar
 *
 * Wrapping in <Suspense> is required because useSearchParams() is used inside.
 */

import { useEffect, useRef, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// ── Internal progress bar logic ──────────────────────────────────────────────

function ProgressInner() {
  const pathname    = usePathname();
  const searchParams = useSearchParams();
  const prevPath    = useRef(pathname);

  const [active,  setActive]  = useState(false);
  const [width,   setWidth]   = useState(0);
  const [exiting, setExiting] = useState(false);

  const crawlRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const exitRef   = useRef<ReturnType<typeof setTimeout>  | null>(null);

  // Start the bar ──────────────────────────────────────────────────────────────
  function start() {
    // Clear any pending exit
    if (exitRef.current)  clearTimeout(exitRef.current);
    if (crawlRef.current) clearInterval(crawlRef.current);
    setExiting(false);
    setWidth(20);
    setActive(true);
    // Slowly crawl to 85% while the page loads
    crawlRef.current = setInterval(() => {
      setWidth((w) => {
        if (w >= 85) { clearInterval(crawlRef.current!); return w; }
        // Exponential slowdown
        return w + Math.max(1, (85 - w) * 0.08);
      });
    }, 180);
  }

  // Complete & hide the bar ────────────────────────────────────────────────────
  function complete() {
    if (crawlRef.current) clearInterval(crawlRef.current);
    setWidth(100);
    setExiting(true);
    exitRef.current = setTimeout(() => {
      setActive(false);
      setWidth(0);
      setExiting(false);
    }, 420);
  }

  // Intercept clicks on internal <a> links ─────────────────────────────────────
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as Element).closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute("href") ?? "";
      // Skip external, hash, and mailto links
      if (!href || href.startsWith("http") || href.startsWith("//") ||
          href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      // Skip downloads
      if (a.hasAttribute("download") || a.target === "_blank") return;
      // Skip same-page (no actual navigation)
      const dest = href.split("?")[0].split("#")[0];
      const curr = window.location.pathname;
      if (dest && dest !== curr) start();
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Watch for pathname / searchParams change → navigation complete ─────────────
  useEffect(() => {
    const current = pathname + searchParams.toString();
    const prev    = prevPath.current;
    if (current !== prev) {
      prevPath.current = current;
      complete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Cleanup on unmount
  useEffect(() => () => {
    if (crawlRef.current) clearInterval(crawlRef.current);
    if (exitRef.current)  clearTimeout(exitRef.current);
  }, []);

  if (!active) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 9999,
        height: 2,
        width: `${width}%`,
        background: "var(--gold)",
        boxShadow: "0 0 10px rgba(184,149,90,0.7), 0 0 4px rgba(184,149,90,0.5)",
        transition: exiting
          ? "width 0.25s ease-out, opacity 0.18s ease 0.2s"
          : "width 0.18s ease-out",
        opacity: exiting ? 0 : 1,
        borderRadius: "0 2px 2px 0",
        pointerEvents: "none",
      }}
    />
  );
}

// ── Public export (wrapped in Suspense for useSearchParams) ──────────────────

export function PageProgress() {
  return (
    <Suspense fallback={null}>
      <ProgressInner />
    </Suspense>
  );
}
