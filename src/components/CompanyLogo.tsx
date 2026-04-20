"use client";

import { useState } from "react";
import Image from "next/image";

interface CompanyLogoProps {
  name: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}

/**
 * Shows a company logo from Vercel Blob CDN.
 * Falls back to a colored letter avatar if no logo or on error.
 */
export function CompanyLogo({ name, logoUrl, size = 40, className = "" }: CompanyLogoProps) {
  const [error, setError] = useState(false);

  const letter = name.replace(/^(la |le |les |l')/i, "").charAt(0).toUpperCase();

  const avatarStyle: React.CSSProperties = {
    width: size, height: size, borderRadius: size >= 48 ? "14px" : "10px",
    flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)",
    color: "var(--c-indigo-2)",
    fontFamily: "'Banana Grotesk', 'JetBrains Mono', monospace",
    fontSize: size >= 48 ? "1.25rem" : "0.9rem",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    userSelect: "none",
  };

  if (!logoUrl || error) {
    return (
      <div className={className} style={avatarStyle}>
        {letter}
      </div>
    );
  }

  return (
    <div className={className} style={{
      width: size, height: size, borderRadius: size >= 48 ? "14px" : "10px",
      flexShrink: 0, overflow: "hidden",
      background: "var(--bg-surface)",
      border: "1px solid var(--border-med)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: size >= 48 ? "6px" : "4px",
    }}>
      <Image
        src={logoUrl}
        alt={`Logo ${name}`}
        width={size}
        height={size}
        style={{
          width: "100%", height: "100%",
          objectFit: "contain",
          borderRadius: "2px",
        }}
        onError={() => setError(true)}
        unoptimized
      />
    </div>
  );
}
