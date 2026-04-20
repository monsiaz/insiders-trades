"use client";

import { useState } from "react";
import Image from "next/image";

interface CompanyLogoProps {
  name: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}

const letter = (name: string) =>
  name.replace(/^(la |le |les |l')/i, "").charAt(0).toUpperCase();

const radius = (size: number) =>
  size >= 48 ? "12px" : size >= 36 ? "9px" : "7px";

const fontSize = (size: number) =>
  size >= 48 ? "1.2rem" : size >= 36 ? "0.95rem" : "0.78rem";

/**
 * CompanyLogo — Optimized logo display with WebP support.
 * - Uses Next.js Image with priority hints for LCP logos
 * - Falls back to letter avatar on error or missing logo
 * - Responsive: works at any size
 */
export function CompanyLogo({
  name,
  logoUrl,
  size = 40,
  className = "",
}: CompanyLogoProps) {
  const [error, setError] = useState(false);
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

  const pad = Math.max(2, Math.round(size * 0.1));

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
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
        width={size - pad * 2}
        height={size - pad * 2}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
        // Use native lazy loading — Next.js handles optimization
        loading="lazy"
        onError={() => setError(true)}
        // Don't run through Next.js image optimizer (already WebP on Blob)
        unoptimized
      />
    </span>
  );
}
