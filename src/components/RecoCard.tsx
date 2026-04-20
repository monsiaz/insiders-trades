"use client";

import Link from "next/link";
import type { RecoItem } from "@/lib/recommendation-engine";

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
}
function fmtAmt(n: number | null): string {
  if (!n) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M€`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k€`;
  return `${n.toFixed(0)}€`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

const BADGE_STYLE: Record<string, React.CSSProperties> = {
  "Cluster":    { background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)", color: "var(--c-indigo-2)" },
  "Score ≥80":  { background: "var(--c-mint-bg)",   border: "1px solid var(--c-mint-bd)",   color: "var(--c-mint)" },
  "Score ≥65":  { background: "var(--c-mint-bg)",   border: "1px solid var(--c-mint-bd)",   color: "var(--c-mint)" },
  "PDG/DG":     { background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)", color: "var(--c-indigo-2)" },
  "CFO/DAF":    { background: "var(--c-amber-bg)",  border: "1px solid var(--c-amber-bd)",  color: "var(--c-amber)" },
  ">2% mcap":   { background: "var(--c-red-bg)",    border: "1px solid var(--c-red-bd)",    color: "var(--c-red)" },
  ">0.5% mcap": { background: "var(--c-amber-bg)",  border: "1px solid var(--c-amber-bd)",  color: "var(--c-amber)" },
  ">1M€":       { background: "var(--c-mint-bg)",   border: "1px solid var(--c-mint-bd)",   color: "var(--c-mint)" },
  ">200k€":     { background: "var(--bg-raised)",   border: "1px solid var(--border-med)",  color: "var(--tx-2)" },
};

// Score bar: 0-100 → visual ring/bar
function ScoreRing({ score }: { score: number }) {
  const pct = Math.round(score);
  const color = pct >= 75 ? "var(--c-mint)" : pct >= 55 ? "var(--c-amber)" : "var(--c-red)";
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="flex-shrink-0 relative" style={{ width: 48, height: 48 }}>
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r={r} stroke="var(--bg-raised)" strokeWidth="4" />
        <circle cx="24" cy="24" r={r}
          stroke={color} strokeWidth="4"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 24 24)"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center"
        style={{ fontSize: "0.72rem", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif", color }}>
        {pct}
      </div>
    </div>
  );
}

export function RecoCard({ item, rank }: { item: RecoItem; rank: number }) {
  const isBuy = item.action === "BUY";
  const actionColor = isBuy ? "var(--c-mint)" : "var(--c-red)";
  const actionBg    = isBuy ? "var(--c-mint-bg)" : "var(--c-red-bg)";
  const actionBd    = isBuy ? "var(--c-mint-bd)" : "var(--c-red-bd)";
  const marketCap   = item.marketCap;
  const mcapStr     = marketCap
    ? marketCap >= 1e9 ? `${(marketCap / 1e9).toFixed(1)}Md€` : `${(marketCap / 1e6).toFixed(0)}M€`
    : null;

  return (
    <div className="card p-5 flex flex-col gap-4"
      style={{ borderTop: `3px solid ${actionColor}` }}>

      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Rank + company avatar */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
            style={{ background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)", color: "var(--c-indigo-2)" }}>
            {item.company.name.charAt(0)}
          </div>
          <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--tx-4)" }}>#{rank}</div>
        </div>

        <div className="flex-1 min-w-0">
          {/* Company + action */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Link href={`/company/${item.company.slug}`}
              className="text-sm font-bold hover:opacity-80 transition-opacity"
              style={{ color: "var(--tx-1)" }}>
              {item.company.name}
            </Link>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: actionBg, border: `1px solid ${actionBd}`, color: actionColor }}>
              {isBuy ? "▲ Achat" : "▼ Vente"}
            </span>
          </div>

          {/* Insider */}
          {item.insider.name && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{ background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)", color: "var(--c-indigo-2)" }}>
                {item.insider.name.charAt(0)}
              </div>
              <span className="text-xs" style={{ color: "var(--tx-2)" }}>{item.insider.name}</span>
              {item.insider.role !== "Autre" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: "var(--bg-raised)", color: "var(--tx-3)" }}>
                  {item.insider.role}
                </span>
              )}
            </div>
          )}

          {/* Badges */}
          {item.badges.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.badges.map((b) => (
                <span key={b} className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={BADGE_STYLE[b] ?? { background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--tx-3)" }}>
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Score ring */}
        <ScoreRing score={item.recoScore} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--tx-4)" }}>
            Win rate hist.
          </div>
          <div className="text-sm font-bold tabular-nums"
            style={{ color: (item.historicalWinRate90d ?? 0) >= 60 ? "var(--c-mint)" : "var(--tx-2)" }}>
            {item.historicalWinRate90d != null ? `${item.historicalWinRate90d.toFixed(0)}%` : "—"}
          </div>
          <div className="text-[10px]" style={{ color: "var(--tx-4)" }}>T+90 · {item.sampleSize} trades</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--tx-4)" }}>
            Retour estimé
          </div>
          <div className="text-sm font-bold tabular-nums"
            style={{ color: (item.expectedReturn90d ?? 0) >= 5 ? "var(--c-mint)" : (item.expectedReturn90d ?? 0) >= 0 ? "var(--tx-2)" : "var(--c-red)" }}>
            {fmt(item.expectedReturn90d)}
          </div>
          <div className="text-[10px]" style={{ color: "var(--tx-4)" }}>moy. T+90 histo.</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: "var(--tx-4)" }}>
            Montant
          </div>
          <div className="text-sm font-bold tabular-nums" style={{ color: "var(--tx-1)" }}>
            {fmtAmt(item.totalAmount)}
          </div>
          {item.pctOfMarketCap != null && item.pctOfMarketCap > 0 && (
            <div className="text-[10px]" style={{ color: "var(--tx-4)" }}>
              {item.pctOfMarketCap < 0.01
                ? `${item.pctOfMarketCap.toFixed(4)}% mcap`
                : item.pctOfMarketCap < 0.1
                ? `${item.pctOfMarketCap.toFixed(3)}% mcap`
                : `${item.pctOfMarketCap.toFixed(2)}% mcap`}
            </div>
          )}
        </div>
      </div>

      {/* Score breakdown bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--tx-4)" }}>
            Score de recommandation
          </span>
          <span className="text-[10px] font-bold" style={{ color: actionColor }}>
            {item.recoScore.toFixed(0)}/100
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-raised)" }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${item.recoScore}%`, background: actionColor, opacity: 0.8 }} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {mcapStr && (
            <span className="text-[11px] px-2 py-0.5 rounded-lg"
              style={{ color: "var(--c-amber)", background: "var(--c-amber-bg)", border: "1px solid var(--c-amber-bd)" }}>
              Mcap {mcapStr}
            </span>
          )}
          {item.analystReco && (
            <span className="text-[11px] px-2 py-0.5 rounded-lg"
              style={{ background: "var(--bg-raised)", border: "1px solid var(--border)", color: "var(--tx-3)" }}>
              Analystes: {item.analystReco}
              {item.targetMean && ` · obj. ${item.targetMean.toFixed(1)}€`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: "var(--tx-4)" }}>
            {fmtDate(item.pubDate)}
          </span>
          <a href={item.amfLink} target="_blank" rel="noopener noreferrer"
            className="btn-glass px-2 py-1 rounded-lg text-[11px] font-medium">
            AMF ↗
          </a>
        </div>
      </div>
    </div>
  );
}
