"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AddCompanyPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    amfToken: "",
    description: "",
    isin: "",
    market: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Une erreur est survenue");
        return;
      }

      // Sync the new company immediately
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: data.company.id }),
      });

      router.push(`/company/${data.company.slug}`);
      router.refresh();
    } catch {
      setError("Erreur réseau. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto content-wrapper">
      <Link href="/companies" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6">
        ← Retour aux sociétés
      </Link>
      <h1 className="text-3xl font-bold text-gradient tracking-tight mb-2">Ajouter une société</h1>
      <p className="text-slate-500 mb-8">
        Entrez le jeton AMF pour commencer à suivre ses déclarations.
      </p>

      <div className="glass-card-static rounded-3xl p-6 mb-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Jeton AMF <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={form.amfToken}
              onChange={(e) => setForm({ ...form, amfToken: e.target.value.toUpperCase() })}
              placeholder="RS00005380"
              required
              className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
            />
            <p className="text-xs text-slate-600 mt-1.5">
              Trouvez le jeton sur{" "}
              <a href="https://bdif.amf-france.org" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300">
                bdif.amf-france.org
              </a>{" "}
              dans l&apos;URL du flux RSS.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Description <span className="text-slate-600 font-normal">(optionnel)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description..."
              rows={3}
              className="glass-input w-full px-4 py-2.5 rounded-xl text-sm resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">ISIN <span className="text-slate-600 font-normal">(optionnel)</span></label>
              <input
                type="text"
                value={form.isin}
                onChange={(e) => setForm({ ...form, isin: e.target.value.toUpperCase() })}
                placeholder="FR0000000000"
                className="glass-input w-full px-4 py-2.5 rounded-xl font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-300 mb-2">Marché <span className="text-slate-600 font-normal">(optionnel)</span></label>
              <input
                type="text"
                value={form.market}
                onChange={(e) => setForm({ ...form, market: e.target.value })}
                placeholder="Euronext Paris"
                className="glass-input w-full px-4 py-2.5 rounded-xl text-sm"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading || !form.amfToken}
              className="flex-1 btn-emerald py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ajout en cours...
                </>
              ) : "Ajouter la société"}
            </button>
            <Link href="/companies" className="btn-glass px-5 py-2.5 rounded-xl text-sm font-semibold">
              Annuler
            </Link>
          </div>
        </form>
      </div>

      <div className="glass-card-static rounded-2xl p-4">
        <p className="text-xs font-semibold text-slate-500 mb-2">💡 Exemple</p>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">NANOBIOTIX</span>
          <code className="text-slate-300 font-mono">RS00005380</code>
        </div>
      </div>
    </div>
  );
}
