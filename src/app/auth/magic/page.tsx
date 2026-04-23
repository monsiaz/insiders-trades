/**
 * /auth/magic — Landing page for the shared magic link.
 *
 * Shows a brief "Connecting you…" screen while the API auto-logs the visitor.
 * Uses a client-side fetch so the cookie is set correctly (not a plain redirect
 * which would happen before the cookie is written).
 */
"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import { Suspense } from "react";

function MagicLoginInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const called       = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const t    = searchParams.get("t") ?? "";
    const next = searchParams.get("next") ?? "/";

    // Call the API with the token — the API sets the cookie and redirects
    window.location.href = `/api/auth/magic/?t=${encodeURIComponent(t)}&next=${encodeURIComponent(next)}`;
  }, [searchParams, router]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "24px",
      background: "var(--bg-base)",
    }}>
      <LogoMark size={48} />
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontFamily: "'Banana Grotesk', 'Inter', system-ui",
          fontSize: "1.1rem",
          fontWeight: 700,
          color: "var(--tx-1)",
          letterSpacing: "-0.02em",
          marginBottom: "8px",
        }}>
          Connexion en cours…
        </div>
        <div style={{
          fontSize: "0.84rem",
          color: "var(--tx-3)",
          fontFamily: "'Inter', system-ui",
        }}>
          Vous allez être redirigé automatiquement.
        </div>
      </div>
      {/* Gold pulse bar */}
      <div style={{
        width: "120px",
        height: "2px",
        background: "var(--gold)",
        borderRadius: "2px",
        animation: "pulse 1.2s ease-in-out infinite",
        opacity: 0.7,
      }} />
    </div>
  );
}

export default function MagicPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-base)" }}>
        <div style={{ width: "120px", height: "2px", background: "var(--gold)", borderRadius: "2px", animation: "pulse 1.2s ease-in-out infinite" }} />
      </div>
    }>
      <MagicLoginInner />
    </Suspense>
  );
}
