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
    <div className="glass-card-static rounded-2xl p-5 border border-violet-500/10 bg-gradient-to-br from-violet-500/5 to-indigo-500/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">📊</span>
            <h2 className="text-sm font-semibold text-white">Performance historique</h2>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-xl font-bold text-white tabular-nums">{total.toLocaleString("fr-FR")}</div>
              <div className="text-xs text-slate-500 mt-0.5">Trades analysés</div>
            </div>
            <div>
              <div className={`text-xl font-bold tabular-nums ${avg90d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {sign}{avg90d.toFixed(1)}%
              </div>
              <div className="text-xs text-slate-500 mt-0.5">Rendement moyen T+90</div>
            </div>
            <div>
              <div className="text-xl font-bold text-violet-400 tabular-nums">{winRate90d.toFixed(0)}%</div>
              <div className="text-xs text-slate-500 mt-0.5">Taux de réussite</div>
            </div>
          </div>
        </div>
        <Link href="/backtest" className="btn-glass px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0">
          Analyse →
        </Link>
      </div>
    </div>
  );
}
