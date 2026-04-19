"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface User { id: string; email: string; name: string | null; role: string }

export function NavUser() {
  const [user, setUser] = useState<User | null | "loading">("loading");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setUser(d.user ?? null)).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setOpen(false);
    router.push("/");
    router.refresh();
  }

  if (user === "loading") return <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />;

  if (!user) {
    return (
      <Link href="/auth/login" className="btn btn-glass" style={{ fontSize: "0.8rem", padding: "6px 14px" }}>
        Connexion
      </Link>
    );
  }

  const initials = user.name ? user.name.slice(0, 2).toUpperCase() : user.email.slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 8px", borderRadius: "10px", background: "transparent", border: "none", cursor: "pointer" }}
        className="hover:bg-[var(--bg-hover)] transition-colors">
        <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: "var(--c-indigo)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "0.7rem", fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", flexShrink: 0 }}>
          {initials}
        </div>
        <span className="hidden sm:block" style={{ fontSize: "0.85rem", color: "var(--tx-2)", maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {user.name ?? user.email}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: "var(--tx-3)", transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          <path d="M19 9l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div className="card" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: "200px", zIndex: 200, padding: "6px 0", boxShadow: "var(--shadow-lg)" }}>
          <div style={{ padding: "10px 16px 10px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--tx-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name ?? "Mon compte"}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
          </div>
          <Link href="/portfolio" onClick={() => setOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 16px", fontSize: "0.85rem", color: "var(--tx-2)", textDecoration: "none" }}
            className="hover:bg-[var(--bg-hover)] hover:text-[var(--tx-1)] transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            Mon portfolio
          </Link>
          <button onClick={logout}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "9px 16px", fontSize: "0.85rem", color: "var(--c-red-2)", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
            className="hover:bg-[var(--bg-hover)] transition-colors">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
