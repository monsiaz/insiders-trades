"use client";

import Link from "next/link";

interface BacktestSnapshot {
  total: number;
  avg90d: number;
  winRate90d: number;
}

export function HomeBacktestWidget({ snapshot }: { snapshot: BacktestSnapshot }) {
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--tx-1)" }}
            >
              Performance historique
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: "var(--tx-1)" }}
              >
                {total.toLocaleString("fr-FR")}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
                Trades analysés
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
                Rendement moyen T+90
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
                Taux de réussite
              </div>
            </div>
          </div>
        </div>
        <Link
          href="/backtest"
          className="btn-glass px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0"
        >
          Analyse →
        </Link>
      </div>
    </div>
  );
}
