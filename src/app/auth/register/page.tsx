"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) { setError("Les mots de passe ne correspondent pas"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password, name: form.name }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erreur"); return; }
      router.push("/portfolio?new=1");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5"><path d="M3 17l4-8 4 4 4-6 4 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span className="text-lg font-bold text-white">InsiderTrades</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Créer un compte</h1>
          <p className="text-slate-400 text-sm">Suivez vos positions et recevez des alertes</p>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm text-rose-400">{error}</div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Nom (optionnel)</label>
              <input type="text" value={form.name} onChange={set("name")} autoComplete="name"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                placeholder="Votre prénom" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
              <input type="email" required value={form.email} onChange={set("email")} autoComplete="email"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                placeholder="vous@exemple.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Mot de passe</label>
              <input type="password" required value={form.password} onChange={set("password")} autoComplete="new-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                placeholder="8 caractères minimum" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Confirmer le mot de passe</label>
              <input type="password" required value={form.confirm} onChange={set("confirm")} autoComplete="new-password"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-sm font-semibold hover:from-indigo-600 hover:to-violet-700 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20">
              {loading ? "Création…" : "Créer mon compte"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          Déjà un compte ?{" "}
          <Link href="/auth/login" className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
