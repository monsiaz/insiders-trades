"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Les mots de passe ne correspondent pas"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur"); return; }
      router.push("/portfolio");
    } finally {
      setLoading(false);
    }
  }

  if (!token) return (
    <div className="text-center tx-neg py-8">Lien invalide. <Link href="/auth/forgot-password" className="tx-brand">Réessayer</Link></div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--tx-1)] mb-1">Nouveau mot de passe</h1>
          <p className="text-[var(--tx-2)] text-sm">Choisissez un nouveau mot de passe sécurisé</p>
        </div>
        <div className="glass-card rounded-2xl p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <div className="bg-neg-soft border bd-neg rounded-xl px-4 py-3 text-sm tx-neg">{error}</div>}
            <div>
              <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">Nouveau mot de passe</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                placeholder="8 caractères minimum" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">Confirmer</label>
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
                className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[var(--tx-1)] text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50">
              {loading ? "Mise à jour…" : "Mettre à jour le mot de passe"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>;
}
