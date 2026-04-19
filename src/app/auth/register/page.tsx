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
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm">
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
            <span className="text-xl font-bold tracking-tight" style={{ color: "var(--tx-1)" }}>InsiderTrades</span>
          </div>
          <h1 className="text-2xl font-bold mb-1 mt-4" style={{ color: "var(--tx-1)" }}>Créer un compte</h1>
          <p className="text-sm" style={{ color: "var(--tx-3)" }}>Suivez vos positions et recevez des alertes</p>
        </div>

        <div className="glass-card rounded-2xl p-6" style={{ boxShadow: "var(--shadow-md)" }}>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl px-4 py-3 text-sm"
                style={{ background: "var(--c-red-bg)", border: "1px solid var(--c-red-bd)", color: "var(--c-red)" }}>
                {error}
              </div>
            )}
            {[
              { label: "Nom (optionnel)", key: "name", type: "text", auto: "name", placeholder: "Votre prénom" },
              { label: "Email", key: "email", type: "email", auto: "email", placeholder: "vous@exemple.com" },
              { label: "Mot de passe", key: "password", type: "password", auto: "new-password", placeholder: "8 caractères minimum" },
              { label: "Confirmer le mot de passe", key: "confirm", type: "password", auto: "new-password", placeholder: "••••••••" },
            ].map(({ label, key, type, auto, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--tx-2)" }}>{label}</label>
                <input type={type} value={form[key as keyof typeof form]} onChange={set(key)}
                  autoComplete={auto} required={key !== "name"}
                  className="w-full rounded-xl px-4 py-2.5 text-sm"
                  placeholder={placeholder} />
              </div>
            ))}
            <button type="submit" disabled={loading}
              className="btn btn-primary w-full py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">
              {loading ? "Création…" : "Créer mon compte"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-4" style={{ color: "var(--tx-3)" }}>
          Déjà un compte ?{" "}
          <Link href="/auth/login" className="font-medium transition-colors"
            style={{ color: "var(--c-indigo-2)" }}>
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
