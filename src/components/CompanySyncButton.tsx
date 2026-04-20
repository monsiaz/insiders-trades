"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompanySyncButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const data = await res.json();

      if (data.success) {
        setResult(`+${data.added}`);
        router.refresh();
      } else {
        setResult("Erreur");
      }
    } catch {
      setResult("Erreur");
    } finally {
      setLoading(false);
      setTimeout(() => setResult(null), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className="text-xs tx-pos">{result}</span>
      )}
      <button
        onClick={handleSync}
        disabled={loading}
        className="px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-400 hover-tx-1 text-sm transition-colors flex items-center gap-1.5"
      >
        {loading ? (
          <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          "↺"
        )}
        Sync
      </button>
    </div>
  );
}
