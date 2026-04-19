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
          <h1 className="text-2xl font-bold text-white mb-1">Mot de passe oublié</h1>
          <p className="text-slate-400 text-sm">Recevez un lien de réinitialisation par email</p>
        </div>
        <div className="glass-card rounded-2xl p-6">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">📬</div>
              <p className="text-slate-300 text-sm">Si un compte existe pour <strong className="text-white">{email}</strong>, vous recevrez un email avec un lien de réinitialisation.</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                  placeholder="vous@exemple.com" />
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50">
                {loading ? "Envoi…" : "Envoyer le lien"}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-sm text-slate-500 mt-4">
          <Link href="/auth/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">← Retour à la connexion</Link>
        </p>
      </div>
    </div>
  );
}
