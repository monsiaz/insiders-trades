"use client";

import { useEffect, useRef } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Stagger delay between children in ms. Default: 85 */
  stagger?: number;
  /** Intersection threshold. Default: 0.07 */
  threshold?: number;
  /** Animate the wrapper div itself instead of its children. */
  single?: boolean;
  /** Extra delay before the first item starts (ms). Default: 0 */
  baseDelay?: number;
}

export function AnimateIn({
  children,
  className = "",
  style,
  stagger = 85,
  threshold = 0.07,
  single = false,
  baseDelay = 0,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const vh = window.innerHeight || document.documentElement.clientHeight;

    // ── SINGLE mode ────────────────────────────────────────────────────────
    if (single) {
      const rect = container.getBoundingClientRect();
      const alreadyVisible = rect.top < vh * 0.9 && rect.bottom > 0;

      // Content already on screen — never hide it, skip animation to avoid FOIC
      if (alreadyVisible) return;

      // Below fold: hide then animate in when scrolled to
      container.classList.add("ai-single");
      container.style.setProperty("--ai-delay", `${baseDelay}ms`);

      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            container.classList.add("ai-single-in");
            obs.disconnect();
          }
        },
        { threshold, rootMargin: "0px 0px -20px 0px" }
      );
      obs.observe(container);
      return () => obs.disconnect();
    }

    // ── GRID / STAGGER mode ───────────────────────────────────────────────
    const items = Array.from(container.children) as HTMLElement[];
    if (items.length === 0) return;

    const rect = container.getBoundingClientRect();
    const alreadyVisible = rect.top < vh * 0.9 && rect.bottom > 0;

    // Content already on screen — never hide it, skip animation to avoid FOIC
    if (alreadyVisible) return;

    // Below fold: hide each child then stagger them in when scrolled to
    items.forEach((item, i) => {
      item.classList.add("ai-item");
      item.style.setProperty("--ai-delay", `${baseDelay + i * stagger}ms`);
    });

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          items.forEach((item) => item.classList.add("ai-in"));
          obs.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -20px 0px" }
    );
    obs.observe(container);
    return () => obs.disconnect();
  }, [stagger, threshold, single, baseDelay]);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
