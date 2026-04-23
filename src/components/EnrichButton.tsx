"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EnrichButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleEnrich() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, limit: 50 }),
      });
      const data = await res.json();

      if (data.success) {
        setResult(`✓ ${data.enriched} enriched`);
        router.refresh();
      } else {
        setResult("Error");
      }
    } catch {
      setResult("Error");
    } finally {
      setLoading(false);
      setTimeout(() => setResult(null), 5000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && <span className="text-xs tx-pos">{result}</span>}
      <button
        onClick={handleEnrich}
        disabled={loading}
        className="px-3 py-2 rounded-lg bg-violet-900/40 hover:bg-violet-900/60 disabled:opacity-50 disabled:cursor-not-allowed tx-violet hover:tx-violet text-sm transition-colors flex items-center gap-1.5 border border-violet-800/50"
        title="Load trade details (name, amount, price)"
      >
        {loading ? (
          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        )}
        Details
      </button>
    </div>
  );
}
