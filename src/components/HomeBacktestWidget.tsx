"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BacktestSnapshot {
  total: number;
  avg90d: number;
  winRate90d: number;
}

export function HomeBacktestWidget({ snapshot }: { snapshot: BacktestSnapshot }) {
  const pathname = usePathname();
  const isFr = pathname.startsWith("/fr");
  const { total, avg90d, winRate90d } = snapshot;
  const sign = avg90d >= 0 ? "+" : "";

  return (
    <div
      className="glass-card-static rounded-2xl p-5"
      style={{
        borderColor: "var(--border-med)",
        background: "var(--bg-surface)",
      }}
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--tx-1)" }}
          >
            {isFr ? "Performance historique" : "Historical performance"}
          </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            <div>
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: "var(--tx-1)" }}
              >
                {total.toLocaleString(isFr ? "fr-FR" : "en-US")}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
                {isFr ? "Trades analysés" : "Analysed trades"}
              </div>
            </div>
            <div>
              <div
                className="text-xl font-bold tabular-nums"
                style={{
                  color: avg90d >= 0 ? "var(--signal-pos)" : "var(--signal-neg)",
                }}
              >
                {sign}
                {avg90d.toFixed(1)}%
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
                {isFr ? "Rendement moyen T+90" : "Avg. return T+90"}
              </div>
            </div>
            <div>
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: "var(--c-violet)" }}
              >
                {winRate90d.toFixed(0)}%
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
                {isFr ? "Taux de réussite" : "Win rate"}
              </div>
            </div>
          </div>
        </div>
        <Link
          href="/backtest"
          className="btn btn-glass flex-shrink-0 self-start"
          style={{ fontSize: "0.78rem", padding: "8px 14px", borderRadius: "8px" }}
        >
          Analyse →
        </Link>
      </div>
    </div>
  );
}
