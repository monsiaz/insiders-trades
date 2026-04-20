"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

/**
 * CompanyBadge — company logo + name, used everywhere a company is mentioned.
 * Falls back to a letter avatar if no logo or on image error.
 * size: "sm" (24px) | "md" (32px) | "lg" (40px) | "xl" (48px)
 */
export function CompanyBadge({
  name,
  slug,
  logoUrl,
  size = "md",
  showName = true,
  className = "",
  linked = true,
}: {
  name: string;
  slug: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  showName?: boolean;
  className?: string;
  linked?: boolean;
}) {
  const px = { sm: 24, md: 32, lg: 40, xl: 48 }[size];
  const fontSize = { sm: "0.65rem", md: "0.75rem", lg: "0.9rem", xl: "1rem" }[size];
  const nameFontSize = { sm: "0.75rem", md: "0.84rem", lg: "0.9375rem", xl: "1rem" }[size];
  const radius = { sm: "6px", md: "8px", lg: "10px", xl: "12px" }[size];
  const gap = { sm: "5px", md: "7px", lg: "9px", xl: "10px" }[size];

  const content = (
    <span style={{ display: "inline-flex", alignItems: "center", gap, maxWidth: "100%" }}>
      <LogoOrAvatar
        name={name}
        logoUrl={logoUrl}
        px={px}
        fontSize={fontSize}
        radius={radius}
      />
      {showName && (
        <span style={{
          fontSize: nameFontSize,
          fontWeight: 600,
          color: "var(--tx-1)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
        }}>
          {name}
        </span>
      )}
    </span>
  );

  if (!linked) return <span className={className}>{content}</span>;

  return (
    <Link
      href={`/company/${slug}`}
      className={className}
      style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
    >
      {content}
    </Link>
  );
}

/**
 * Just the logo/avatar square — no name, no link.
 */
export function CompanyAvatar({
  name,
  logoUrl,
  size = "md",
}: {
  name: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const px = { sm: 24, md: 32, lg: 40, xl: 48 }[size];
  const fontSize = { sm: "0.65rem", md: "0.75rem", lg: "0.9rem", xl: "1rem" }[size];
  const radius = { sm: "6px", md: "8px", lg: "10px", xl: "12px" }[size];
  return <LogoOrAvatar name={name} logoUrl={logoUrl} px={px} fontSize={fontSize} radius={radius} />;
}

// ── Internal logo/avatar ─────────────────────────────────────────────────────

function LogoOrAvatar({
  name, logoUrl, px, fontSize, radius,
}: {
  name: string; logoUrl?: string | null;
  px: number; fontSize: string; radius: string;
}) {
  const [error, setError] = useState(false);
  const letter = name.replace(/^(la |le |les |l')/i, "").charAt(0).toUpperCase();

  if (logoUrl && !error) {
    return (
      <span style={{
        width: px, height: px, flexShrink: 0,
        borderRadius: radius,
        overflow: "hidden",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        padding: Math.max(2, Math.round(px * 0.1)) + "px",
      }}>
        <Image
          src={logoUrl}
          alt={name}
          width={px}
          height={px}
          style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "2px" }}
          onError={() => setError(true)}
          unoptimized
        />
      </span>
    );
  }

  return (
    <span style={{
      width: px, height: px, flexShrink: 0,
      borderRadius: radius,
      background: "var(--c-indigo-bg)",
      border: "1px solid var(--c-indigo-bd)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Banana Grotesk', 'JetBrains Mono', monospace",
      fontWeight: 700, fontSize,
      color: "var(--c-indigo-2)",
      userSelect: "none",
    }}>
      {letter}
    </span>
  );
}
