"use client";

import { useState } from "react";
import Image from "next/image";

interface CompanyLogoProps {
  name: string;
  logoUrl?: string | null;
  /** Target height in px (width auto-adapts for wide wordmarks). */
  size?: number;
  /** Max aspect ratio allowed (default 3.5). Beyond this, the logo gets clipped. */
  maxAspect?: number;
  /** Force a square container (ignore aspect, useful for grid/table avatars). */
  square?: boolean;
  className?: string;
}

const letter = (name: string) =>
  name.replace(/^(la |le |les |l')/i, "").charAt(0).toUpperCase();

const radius = (size: number) =>
  size >= 48 ? "12px" : size >= 36 ? "9px" : "7px";

const fontSize = (size: number) =>
  size >= 48 ? "1.2rem" : size >= 36 ? "0.95rem" : "0.78rem";

/**
 * CompanyLogo — Aspect-aware logo display.
 * - Uses natural image dimensions to allow wordmark logos to render wider
 *   (so "TELEPERFORMANCE" doesn't shrink to unreadable size in a 56×56 box).
 * - Gracefully falls back to a letter avatar on error or missing logo.
 * - Always renders at the requested HEIGHT; width stretches up to `maxAspect × size`.
 */
export function CompanyLogo({
  name,
  logoUrl,
  size = 40,
  maxAspect = 3.5,
  square = false,
  className = "",
}: CompanyLogoProps) {
  const [error, setError] = useState(false);
  const [aspect, setAspect] = useState<number>(1);
  const l = letter(name);
  const r = radius(size);

  if (!logoUrl || error) {
    return (
      <span
        className={className}
        aria-label={`Logo ${name}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: r,
          background: "var(--c-indigo-bg)",
          border: "1px solid var(--c-indigo-bd)",
          color: "var(--c-indigo-2)",
          fontFamily: "'Banana Grotesk','JetBrains Mono',monospace",
          fontSize: fontSize(size),
          fontWeight: 700,
          letterSpacing: "-0.02em",
          userSelect: "none",
        }}
      >
        {l}
      </span>
    );
  }

  // Aspect ratio clamped to [1, maxAspect]; container uses height = size, width scales
  const clampedAspect = square ? 1 : Math.min(maxAspect, Math.max(1, aspect));
  const pad = Math.max(2, Math.round(size * 0.08));
  const containerWidth = Math.round(size * clampedAspect);
  const containerHeight = size;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: containerWidth,
        height: containerHeight,
        flexShrink: 0,
        borderRadius: r,
        overflow: "hidden",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        padding: pad,
      }}
    >
      <Image
        src={logoUrl}
        alt={name}
        width={containerWidth - pad * 2}
        height={containerHeight - pad * 2}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
        loading="lazy"
        onError={() => setError(true)}
        onLoadingComplete={(img) => {
          if (img.naturalHeight > 0) {
            const ratio = img.naturalWidth / img.naturalHeight;
            if (Number.isFinite(ratio) && ratio > 1.1) setAspect(ratio);
          }
        }}
        unoptimized
      />
    </span>
  );
}
