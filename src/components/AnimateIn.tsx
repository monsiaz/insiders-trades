"use client";

/**
 * AnimateIn – scroll-triggered staggered reveal for card grids.
 *
 * Grid mode (default):
 *   <AnimateIn className="grid grid-cols-3 gap-4" stagger={80}>
 *     <Card />  ← each child fades-up with increasing delay
 *     <Card />
 *   </AnimateIn>
 *
 * Single mode:
 *   <AnimateIn single>
 *     <Banner />  ← the wrapper div itself animates
 *   </AnimateIn>
 *
 * • Uses IntersectionObserver – no layout thrash, GPU-composited transform.
 * • Fires immediately if element is already in the viewport on mount.
 * • Respects prefers-reduced-motion via CSS.
 */

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

    // Respect prefers-reduced-motion at JS level too (CSS handles display).
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (single) {
      if (!reduced) {
        container.classList.add("ai-single");
        container.style.setProperty("--ai-delay", `${baseDelay}ms`);
      }
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            container.classList.add("ai-single-in");
            obs.disconnect();
          }
        },
        { threshold, rootMargin: "0px 0px -40px 0px" }
      );
      obs.observe(container);
      return () => obs.disconnect();
    }

    // Grid mode: animate each direct child with stagger.
    const items = Array.from(container.children) as HTMLElement[];
    if (!reduced) {
      items.forEach((item, i) => {
        item.classList.add("ai-item");
        item.style.setProperty("--ai-delay", `${baseDelay + i * stagger}ms`);
      });
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          items.forEach((item) => item.classList.add("ai-in"));
          obs.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" }
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
