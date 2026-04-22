"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur"); return; }
      router.push(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm">
        {/* Logo + brand */}
        <div className="text-center mb-8">
          <div className="inline-flex flex-col items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--c-indigo)", boxShadow: "0 4px 20px rgba(91,92,246,0.35)" }}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <path d="M6 27 L14 27" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.5"/>
                <path d="M14 27 L20 10 L26 27" stroke="white" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M26 27 L34 27" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.5"/>
                <circle cx="20" cy="10" r="3" fill="#00C896"/>
                <circle cx="20" cy="10" r="1.4" fill="white"/>
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight" style={{ color: "var(--tx-1)" }}>Insiders Trades Sigma</span>
          </div>
          <div
            className="inline-flex items-center gap-2 mb-3 mt-4 px-3 py-1 rounded-full"
            style={{
              background: "var(--gold-bg)",
              border: "1px solid var(--gold-bd)",
              color: "var(--gold)",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.62rem",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
            }}
          >
            Accès beta
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--tx-1)" }}>Connexion</h1>
          <p className="text-sm" style={{ color: "var(--tx-3)" }}>
            Phase bêta · accès sur invitation uniquement.
          </p>
        </div>

        {/* Card */}
        <div className="glass-card rounded-2xl p-6" style={{ boxShadow: "var(--shadow-md)" }}>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm"
                style={{ background: "var(--c-red-bg)", border: "1px solid var(--c-red-bd)", color: "var(--c-red)" }}>
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--tx-2)" }}>Email</label>
              <input
                type="email" required autoComplete="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm"
                placeholder="vous@exemple.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: "var(--tx-2)" }}>Mot de passe</label>
              <input
                type="password" required autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 text-sm"
                placeholder="••••••••"
              />
            </div>
            <div className="flex justify-end">
              <Link href="/auth/forgot-password" className="text-xs transition-colors"
                style={{ color: "var(--c-indigo-2)" }}>
                Mot de passe oublié ?
              </Link>
            </div>
            <button
              type="submit" disabled={loading}
              className="btn btn-primary w-full rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Connexion…" : "Se connecter"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: "var(--tx-4)", lineHeight: 1.6 }}>
          L&apos;inscription est fermée pendant la phase beta.<br />
          Pour une demande d&apos;accès, contactez l&apos;administrateur.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
