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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <Link
          href="/companies"
          className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-4 inline-flex items-center gap-1"
        >
          ← Retour aux sociétés
        </Link>
        <h1 className="text-3xl font-bold text-white mt-2">Ajouter une société</h1>
        <p className="text-gray-400 mt-2">
          Entrez le jeton AMF de la société pour commencer à suivre ses déclarations.
          Le nom sera récupéré automatiquement depuis l&apos;AMF.
        </p>
      </div>

      <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Jeton AMF{" "}
              <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.amfToken}
              onChange={(e) => setForm({ ...form, amfToken: e.target.value.toUpperCase() })}
              placeholder="RS00005380"
              required
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
            />
            <p className="text-xs text-gray-500 mt-1.5">
              Trouvez le jeton sur{" "}
              <a
                href="https://bdif.amf-france.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-500 hover:text-emerald-400"
              >
                bdif.amf-france.org
              </a>{" "}
              dans l&apos;URL du flux RSS de la société.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description <span className="text-gray-500 font-normal">(optionnel)</span>
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description de la société..."
              rows={3}
              className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                ISIN <span className="text-gray-500 font-normal">(optionnel)</span>
              </label>
              <input
                type="text"
                value={form.isin}
                onChange={(e) => setForm({ ...form, isin: e.target.value.toUpperCase() })}
                placeholder="FR0000000000"
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Marché <span className="text-gray-500 font-normal">(optionnel)</span>
              </label>
              <input
                type="text"
                value={form.market}
                onChange={(e) => setForm({ ...form, market: e.target.value })}
                placeholder="Euronext Paris"
                className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !form.amfToken}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ajout en cours...
                </span>
              ) : (
                "Ajouter la société"
              )}
            </button>
            <Link
              href="/companies"
              className="px-5 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors font-medium"
            >
              Annuler
            </Link>
          </div>
        </form>
      </div>

      <div className="mt-6 rounded-xl border border-gray-800 bg-gray-900/30 p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">💡 Exemple de jeton AMF</h3>
        <div className="space-y-2 text-sm text-gray-500">
          <div className="flex justify-between">
            <span>NANOBIOTIX</span>
            <code className="text-gray-400 font-mono">RS00005380</code>
          </div>
          <p className="text-xs text-gray-600 pt-1">
            Le jeton se trouve dans l&apos;URL du flux RSS sur le site AMF BDIF :
            <br />
            <code className="text-gray-500 text-xs break-all">
              bdif.amf-france.org/back/api/v1/rss?lang=fr&jetons=RS00005380
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
