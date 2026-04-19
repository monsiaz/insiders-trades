"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NavSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/companies?all=1&q=${encodeURIComponent(q.trim())}`);
      }}
      className="search-bar hidden md:flex"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: "var(--tx-4)", flexShrink: 0 }}>
        <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
        <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher…"
        style={{ width: "160px" }}
      />
    </form>
  );
}
