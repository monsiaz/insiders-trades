"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--tx-1)] mb-1">Mot de passe oublié</h1>
          <p className="text-[var(--tx-2)] text-sm">Recevez un lien de réinitialisation par email</p>
        </div>
        <div className="glass-card rounded-2xl p-6">
          {sent ? (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex items-center justify-center w-12 h-12 rounded-2xl" style={{ background: "var(--c-emerald-bg)", border: "1px solid var(--c-emerald-bd)" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: "var(--c-emerald)" }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="22,6 12,13 2,6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <p className="text-[var(--tx-2)] text-sm">Si un compte existe pour <strong className="text-[var(--tx-1)]">{email}</strong>, vous recevrez un email avec un lien de réinitialisation.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--tx-2)] mb-1.5">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500/50 transition-all"
                  placeholder="vous@exemple.com" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-[var(--tx-1)] text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50">
                {loading ? "Envoi…" : "Envoyer le lien"}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-sm text-[var(--tx-3)] mt-4">
          <Link href="/auth/login" className="tx-brand hover:tx-brand transition-colors">← Retour à la connexion</Link>
        </p>
      </div>
    </div>
  );
}
