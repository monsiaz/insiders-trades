"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { lp } from "@/lib/locale-path";

interface BacktestSnapshot {
  total: number;
  avg90d: number;
  medianReturn90d?: number;
  winRate90d: number;
  sharpe90d?: number | null;
}

export function HomeBacktestWidget({ snapshot }: { snapshot: BacktestSnapshot }) {
  const pathname = usePathname();
  const isFr = pathname.startsWith("/fr");
  const { total, avg90d, medianReturn90d, winRate90d, sharpe90d } = snapshot;
  const sign = avg90d >= 0 ? "+" : "";
  const medSign = (medianReturn90d ?? 0) >= 0 ? "+" : "";

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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-5">
            <div>
              <div className="text-xl font-bold tabular-nums" style={{ color: "var(--tx-1)" }}>
                {total.toLocaleString(isFr ? "fr-FR" : "en-GB")}
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
                {isFr ? "Achats analysés" : "Insider buys"}
              </div>
            </div>
            <div>
              <div className="text-xl font-bold tabular-nums"
                style={{ color: avg90d >= 0 ? "var(--signal-pos)" : "var(--signal-neg)" }}>
                {sign}{avg90d.toFixed(1)}%
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
                {isFr ? "Retour moyen T+90" : "Avg. return T+90"}
              </div>
            </div>
            {medianReturn90d != null && (
              <div>
                <div className="text-xl font-bold tabular-nums"
                  style={{ color: (medianReturn90d) >= 0 ? "var(--signal-pos)" : "var(--signal-neg)" }}>
                  {medSign}{medianReturn90d.toFixed(1)}%
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
                  {isFr ? "Médiane T+90" : "Median T+90"}
                </div>
              </div>
            )}
            <div>
              <div className="text-xl font-bold tabular-nums" style={{ color: "var(--c-violet)" }}>
                {winRate90d.toFixed(0)}%
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
                {isFr ? "Taux de réussite" : "Win rate"}
              </div>
            </div>
          </div>
          {sharpe90d != null && (
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-[11px] font-mono" style={{ color: "var(--tx-4)" }}>
                Sharpe T+90: <span style={{ color: sharpe90d >= 0.5 ? "var(--gold)" : "var(--tx-3)", fontWeight: 600 }}>{sharpe90d.toFixed(2)}</span>
                <span style={{ marginLeft: "12px" }}>·</span>
                <span style={{ marginLeft: "12px", color: "var(--tx-4)" }}>
                  {isFr ? "Achats d'initiés uniquement" : "Insider buys only · all signal scores"}
                </span>
              </span>
            </div>
          )}
        </div>
        <Link
          href={lp(isFr, "/backtest/")}
          className="btn btn-glass flex-shrink-0 self-start"
          style={{ fontSize: "0.78rem", padding: "8px 14px", borderRadius: "8px" }}
        >
          {isFr ? "Analyse →" : "Backtest →"}
        </Link>
      </div>
    </div>
  );
}
