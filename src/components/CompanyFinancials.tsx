"use client";

import { useEffect, useState } from "react";
import type { CompanyFinancials } from "@/lib/financials";

interface Props {
  companyId: string;
  companyName: string;
  /** Pre-fetched data from server (avoids waterfall) */
  initial?: Partial<CompanyFinancials> | null;
}

// ── Formatters ────────────────────────────────────────────────────────────

function fmtB(n: number | null | undefined, currency = "€"): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}Md${currency}`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M${currency}`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}k${currency}`;
  return `${sign}${abs.toFixed(0)}${currency}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function fmtX(n: number | null | undefined, decimals = 1): string {
  if (n == null) return "—";
  return n.toFixed(decimals) + "x";
}

function fmtNum(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)} €`;
}

// ── Analyst reco display ──────────────────────────────────────────────────

const RECO_CONFIG: Record<string, { label: string; color: string; bar: number }> = {
  strong_buy:   { label: "Achat fort",   color: "text-emerald-400", bar: 100 },
  buy:          { label: "Achat",        color: "text-emerald-300", bar: 75 },
  hold:         { label: "Neutre",       color: "text-amber-400",   bar: 50 },
  underperform: { label: "Sous-perf.",   color: "text-orange-400",  bar: 30 },
  sell:         { label: "Vente",        color: "text-rose-400",    bar: 10 },
};

function RecoGauge({ score, reco }: { score?: number | null; reco?: string | null }) {
  const key = reco ?? (score != null ? scoreToReco(score) : null);
  const cfg = key ? RECO_CONFIG[key] : null;
  if (!cfg && score == null) return <span className="text-slate-500">—</span>;

  // score 1.0 (strong buy) → 5.0 (strong sell), map to 0-100%
  const barPct = score != null ? Math.max(5, Math.round(((5 - score) / 4) * 100)) : (cfg?.bar ?? 50);
  const barColor =
    barPct >= 80 ? "bg-emerald-400" :
    barPct >= 60 ? "bg-emerald-300" :
    barPct >= 40 ? "bg-amber-400" :
    barPct >= 20 ? "bg-orange-400" : "bg-rose-400";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${barPct}%` }} />
        </div>
      </div>
      <span className={`text-sm font-semibold tabular-nums ${cfg?.color ?? "text-slate-300"}`}>
        {cfg?.label ?? `${fmtNum(score)}/5`}
      </span>
    </div>
  );
}

function scoreToReco(s: number): string {
  if (s <= 1.5) return "strong_buy";
  if (s <= 2.2) return "buy";
  if (s <= 2.8) return "hold";
  if (s <= 3.5) return "underperform";
  return "sell";
}

// ── Metric cell ───────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  sub,
  color = "text-white",
  tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  tooltip?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 p-3 rounded-xl bg-white/4 border border-white/6 hover:bg-white/6 transition-colors" title={tooltip}>
      <span className="text-[11px] text-slate-500 font-medium">{label}</span>
      <span className={`text-base font-bold tabular-nums ${color}`}>{value}</span>
      {sub && <span className="text-[10px] text-slate-600">{sub}</span>}
    </div>
  );
}

// ── Target price bar ─────────────────────────────────────────────────────

function TargetBar({
  current,
  low,
  mean,
  high,
}: {
  current?: number | null;
  low?: number | null;
  mean?: number | null;
  high?: number | null;
}) {
  if (!low && !mean && !high) return null;
  const min = Math.min(current ?? mean ?? 0, low ?? mean ?? 0) * 0.85;
  const max = Math.max(current ?? mean ?? 0, high ?? mean ?? 0) * 1.05;
  const range = max - min;
  if (range <= 0) return null;

  const pct = (v: number) => `${Math.round(((v - min) / range) * 100)}%`;
  const upside = current && mean ? ((mean - current) / current) * 100 : null;

  return (
    <div className="mt-1">
      <div className="relative h-2 bg-white/10 rounded-full overflow-hidden mx-1">
        {low && high && (
          <div
            className="absolute h-full bg-indigo-500/30 rounded-full"
            style={{ left: pct(low), right: `${100 - parseInt(pct(high))}%` }}
          />
        )}
        {mean && (
          <div
            className="absolute w-1 h-full bg-indigo-400 rounded-full"
            style={{ left: pct(mean) }}
          />
        )}
        {current && (
          <div
            className="absolute w-1.5 h-full bg-white rounded-full shadow-sm"
            style={{ left: pct(current) }}
          />
        )}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-slate-600">
        <span>{low ? fmtPrice(low) : ""}</span>
        <span className="text-slate-400">
          Objectif {fmtPrice(mean)}
          {upside != null && (
            <span className={upside > 0 ? " text-emerald-400" : " text-rose-400"}>
              {" "}({upside > 0 ? "+" : ""}{upside.toFixed(0)}%)
            </span>
          )}
        </span>
        <span>{high ? fmtPrice(high) : ""}</span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function CompanyFinancials({ companyId, companyName, initial }: Props) {
  const [data, setData] = useState<Partial<CompanyFinancials> | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial && Object.keys(initial).length > 2) return; // skip if server gave us rich data
    setLoading(true);
    fetch(`/api/financials?companyId=${companyId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [companyId, initial]);

  if (loading) {
    return (
      <div className="glass-card-static rounded-2xl p-6">
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          Chargement des données financières…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-card-static rounded-2xl p-5 text-slate-600 text-sm">
        Données financières non disponibles pour {companyName}
        {error && <span className="text-rose-500/60 ml-2 text-xs">({error})</span>}
      </div>
    );
  }

  const d = data;
  const hasIncome = d.revenue || d.ebitda || d.netIncome;
  const hasValuation = d.trailingPE || d.forwardPE || d.priceToBook || d.beta;
  const hasBalance = d.totalDebt || d.freeCashFlow || d.debtToEquity;
  const hasAnalyst = d.analystReco || d.analystScore || d.targetMean;

  // Ebitda margin
  const ebitdaMargin = d.ebitda && d.revenue ? (d.ebitda / d.revenue) * 100 : null;
  const netMargin = d.profitMargin != null ? d.profitMargin * 100 : (d.netIncome && d.revenue ? (d.netIncome / d.revenue) * 100 : null);

  return (
    <div className="glass-card-static rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white tracking-tight">Données financières</h3>
          {d.fiscalYearEnd && (
            <p className="text-[11px] text-slate-500 mt-0.5">
              Exercice clos {new Date(d.fiscalYearEnd).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              {" · "}
              <span className="text-slate-600">{d.source?.join(", ")}</span>
            </p>
          )}
        </div>
        {d.currentPrice && (
          <div className="text-right">
            <div className="text-lg font-bold text-white tabular-nums">{fmtPrice(d.currentPrice)}</div>
            {d.fiftyTwoWeekLow && d.fiftyTwoWeekHigh && (
              <div className="text-[10px] text-slate-500 mt-0.5">
                52s : {fmtPrice(d.fiftyTwoWeekLow)} – {fmtPrice(d.fiftyTwoWeekHigh)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Analyst consensus */}
      {hasAnalyst && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Consensus analystes</span>
            {d.numAnalysts && (
              <span className="text-[11px] text-slate-600">{d.numAnalysts} analystes</span>
            )}
          </div>
          <RecoGauge score={d.analystScore} reco={d.analystReco} />
          {(d.targetLow || d.targetMean || d.targetHigh) && (
            <div className="mt-3">
              <TargetBar
                current={d.currentPrice}
                low={d.targetLow}
                mean={d.targetMean}
                high={d.targetHigh}
              />
            </div>
          )}
        </div>
      )}

      {/* Valuation */}
      {hasValuation && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Valorisation</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {d.trailingPE != null && (
              <Metric
                label="PER (trailing)"
                value={fmtNum(d.trailingPE, 1) + "x"}
                color={d.trailingPE < 15 ? "text-emerald-400" : d.trailingPE < 25 ? "text-white" : "text-rose-400"}
                tooltip="Price / Earnings ratio (historique)"
              />
            )}
            {d.forwardPE != null && (
              <Metric
                label="PER (forward)"
                value={fmtNum(d.forwardPE, 1) + "x"}
                color={d.forwardPE < 15 ? "text-emerald-400" : d.forwardPE < 25 ? "text-white" : "text-rose-400"}
                tooltip="Price / Earnings projeté"
              />
            )}
            {d.priceToBook != null && (
              <Metric label="P/Book" value={fmtX(d.priceToBook)} tooltip="Price / Valeur comptable" />
            )}
            {d.beta != null && (
              <Metric
                label="Bêta"
                value={fmtNum(d.beta)}
                color={d.beta > 1.5 ? "text-rose-400" : d.beta < 0.8 ? "text-emerald-400" : "text-white"}
                tooltip="Volatilité relative au marché (1 = même risque)"
              />
            )}
          </div>
        </div>
      )}

      {/* Income statement */}
      {hasIncome && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Compte de résultat</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {d.revenue != null && <Metric label="Chiffre d'affaires" value={fmtB(d.revenue)} />}
            {d.grossProfit != null && (
              <Metric
                label="Marge brute"
                value={fmtB(d.grossProfit)}
                sub={d.revenue ? `${((d.grossProfit / d.revenue) * 100).toFixed(0)}%` : undefined}
              />
            )}
            {d.ebitda != null && (
              <Metric
                label="EBITDA"
                value={fmtB(d.ebitda)}
                sub={ebitdaMargin != null ? `${ebitdaMargin.toFixed(0)}% marge` : undefined}
                color={d.ebitda > 0 ? "text-emerald-400" : "text-rose-400"}
              />
            )}
            {d.netIncome != null && (
              <Metric
                label="Résultat net"
                value={fmtB(d.netIncome)}
                sub={netMargin != null ? `${netMargin.toFixed(1)}% marge` : undefined}
                color={d.netIncome > 0 ? "text-emerald-400" : "text-rose-400"}
              />
            )}
          </div>
        </div>
      )}

      {/* Balance sheet & cash */}
      {hasBalance && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Bilan & trésorerie</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {d.marketCap != null && <Metric label="Capitalisation" value={fmtB(d.marketCap)} />}
            {d.totalDebt != null && (
              <Metric
                label="Dette totale"
                value={fmtB(d.totalDebt)}
                color={d.totalDebt > (d.marketCap ?? Infinity) * 0.5 ? "text-rose-400" : "text-white"}
              />
            )}
            {d.freeCashFlow != null && (
              <Metric
                label="Free Cash Flow"
                value={fmtB(d.freeCashFlow)}
                color={d.freeCashFlow > 0 ? "text-emerald-400" : "text-rose-400"}
              />
            )}
            {d.debtToEquity != null && (
              <Metric
                label="Dette/Fonds propres"
                value={fmtNum(d.debtToEquity, 0) + "%"}
                color={d.debtToEquity < 50 ? "text-emerald-400" : d.debtToEquity < 150 ? "text-white" : "text-rose-400"}
                tooltip="Ratio dette / capitaux propres"
              />
            )}
          </div>
        </div>
      )}

      {/* Rentabilité & actionnariat */}
      {(d.returnOnEquity || d.returnOnAssets || d.heldByInsiders || d.heldByInstitutions) && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Rentabilité & actionnariat</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {d.returnOnEquity != null && (
              <Metric
                label="ROE"
                value={fmtPct(d.returnOnEquity)}
                color={d.returnOnEquity > 0.15 ? "text-emerald-400" : d.returnOnEquity > 0 ? "text-white" : "text-rose-400"}
                tooltip="Return on Equity"
              />
            )}
            {d.returnOnAssets != null && (
              <Metric
                label="ROA"
                value={fmtPct(d.returnOnAssets)}
                color={d.returnOnAssets > 0.05 ? "text-emerald-400" : d.returnOnAssets > 0 ? "text-white" : "text-rose-400"}
                tooltip="Return on Assets"
              />
            )}
            {d.heldByInsiders != null && (
              <Metric
                label="% dirigeants"
                value={fmtPct(d.heldByInsiders)}
                color={d.heldByInsiders > 0.1 ? "text-indigo-400" : "text-white"}
                tooltip="Part du capital détenue par les dirigeants"
              />
            )}
            {d.heldByInstitutions != null && (
              <Metric
                label="% institutionnels"
                value={fmtPct(d.heldByInstitutions)}
                tooltip="Part du capital détenue par les institutionnels"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
