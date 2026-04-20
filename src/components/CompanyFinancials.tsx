"use client";

import { useEffect, useState } from "react";
import type { CompanyFinancials } from "@/lib/financials";

interface Props {
  companyId: string;
  companyName: string;
  initial?: Partial<CompanyFinancials> | null;
}

// ── Formatters ────────────────────────────────────────────────────────────

function fmtB(n: number | null | undefined, currency = "€"): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)} Md${currency}`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)} M${currency}`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)} k${currency}`;
  return `${sign}${abs.toFixed(0)} ${currency}`;
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

// ── Value coloring (semantic, theme-aware via CSS vars) ─────────────────

function positiveColor(positive: boolean | null): string {
  if (positive === null) return "var(--tx-1)";
  return positive ? "var(--c-emerald)" : "var(--c-crimson)";
}

// ── Analyst reco ─────────────────────────────────────────────────────────

const RECO_CONFIG: Record<string, { label: string; pct: number; positive: boolean }> = {
  strong_buy:   { label: "Achat fort",  pct: 100, positive: true  },
  buy:          { label: "Achat",       pct: 75,  positive: true  },
  hold:         { label: "Neutre",      pct: 50,  positive: false },
  underperform: { label: "Sous-perf.", pct: 30,  positive: false },
  sell:         { label: "Vente",       pct: 10,  positive: false },
};

function scoreToReco(s: number): string {
  if (s <= 1.5) return "strong_buy";
  if (s <= 2.2) return "buy";
  if (s <= 2.8) return "hold";
  if (s <= 3.5) return "underperform";
  return "sell";
}

function RecoGauge({ score, reco }: { score?: number | null; reco?: string | null }) {
  const key = reco ?? (score != null ? scoreToReco(score) : null);
  const cfg = key ? RECO_CONFIG[key] : null;
  if (!cfg && score == null) return <span style={{ color: "var(--tx-4)" }}>—</span>;

  const barPct = score != null ? Math.max(5, Math.round(((5 - score) / 4) * 100)) : (cfg?.pct ?? 50);
  const barColor = barPct >= 70 ? "var(--c-emerald)" : barPct >= 45 ? "var(--c-amber)" : "var(--c-crimson)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
      <div style={{ flex: 1, height: "6px", background: "var(--border-med)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${barPct}%`, background: barColor, borderRadius: "3px", transition: "width 0.6s" }} />
      </div>
      <span style={{ fontSize: "0.84rem", fontWeight: 700, color: barColor, minWidth: "70px", textAlign: "right" }}>
        {cfg?.label ?? `${fmtNum(score)}/5`}
      </span>
    </div>
  );
}

// ── Target price bar ──────────────────────────────────────────────────────

function TargetBar({ current, low, mean, high }: {
  current?: number | null; low?: number | null; mean?: number | null; high?: number | null;
}) {
  if (!low && !mean && !high) return null;
  const min = Math.min(current ?? mean ?? 0, low ?? mean ?? 0) * 0.85;
  const max = Math.max(current ?? mean ?? 0, high ?? mean ?? 0) * 1.05;
  const range = max - min;
  if (range <= 0) return null;

  const pct = (v: number) => `${Math.round(((v - min) / range) * 100)}%`;
  const upside = current && mean ? ((mean - current) / current) * 100 : null;

  return (
    <div style={{ marginTop: "8px" }}>
      <div style={{ position: "relative", height: "6px", background: "var(--border-med)", borderRadius: "3px", overflow: "hidden", margin: "0 4px" }}>
        {low && high && (
          <div style={{
            position: "absolute", height: "100%",
            background: "var(--c-indigo-bg)",
            left: pct(low), right: `${100 - parseInt(pct(high))}%`,
          }} />
        )}
        {mean && (
          <div style={{ position: "absolute", width: "2px", height: "100%", background: "var(--c-indigo)", left: pct(mean) }} />
        )}
        {current && (
          <div style={{ position: "absolute", width: "3px", height: "100%", background: "var(--tx-1)", left: pct(current), borderRadius: "2px" }} />
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "10px", color: "var(--tx-4)" }}>
        <span>{low ? fmtPrice(low) : ""}</span>
        <span style={{ color: "var(--tx-3)" }}>
          Objectif {fmtPrice(mean)}
          {upside != null && (
            <span style={{ color: positiveColor(upside > 0), marginLeft: "4px" }}>
              ({upside > 0 ? "+" : ""}{upside.toFixed(0)}%)
            </span>
          )}
        </span>
        <span>{high ? fmtPrice(high) : ""}</span>
      </div>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: "var(--tx-3)",
      marginBottom: "10px",
    }}>
      {children}
    </div>
  );
}

// ── Metric cell (theme-aware) ─────────────────────────────────────────────

function Metric({ label, value, sub, color, tooltip }: {
  label: string; value: string; sub?: string; color?: string; tooltip?: string;
}) {
  return (
    <div
      title={tooltip}
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        padding: "10px 12px",
        display: "flex", flexDirection: "column", gap: "2px",
        transition: "border-color 0.15s",
        cursor: tooltip ? "help" : "default",
      }}
    >
      <span style={{ fontSize: "11px", color: "var(--tx-3)", fontWeight: 500, lineHeight: 1.3 }}>{label}</span>
      <span style={{
        fontSize: "0.9375rem", fontWeight: 700,
        fontFamily: "'Banana Grotesk', 'JetBrains Mono', monospace",
        color: color ?? "var(--tx-1)",
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: "10px", color: "var(--tx-4)", marginTop: "1px" }}>{sub}</span>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function CompanyFinancials({ companyId, companyName, initial }: Props) {
  const [data, setData] = useState<Partial<CompanyFinancials> | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial && Object.keys(initial).length > 2) return;
    setLoading(true);
    fetch(`/api/financials?companyId=${companyId}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError(d.error); else setData(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [companyId, initial]);

  if (loading) {
    return (
      <div className="card p-5">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--tx-3)", fontSize: "0.84rem" }}>
          <span style={{ width: "16px", height: "16px", border: "2px solid var(--c-indigo)", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 1s linear infinite" }} />
          Chargement des données financières…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-5" style={{ color: "var(--tx-3)", fontSize: "0.84rem" }}>
        Données financières non disponibles pour {companyName}
        {error && <span style={{ color: "var(--c-crimson)", marginLeft: "8px", fontSize: "0.75rem" }}>({error})</span>}
      </div>
    );
  }

  const d = data;
  const hasIncome    = d.revenue || d.ebitda || d.netIncome;
  const hasValuation = d.trailingPE || d.forwardPE || d.priceToBook || d.beta;
  const hasBalance   = d.totalDebt || d.freeCashFlow || d.debtToEquity;
  const hasAnalyst   = d.analystReco || d.analystScore || d.targetMean;
  const hasOwnership = d.returnOnEquity || d.returnOnAssets || d.heldByInsiders || d.heldByInstitutions;

  const ebitdaMargin = d.ebitda && d.revenue ? (d.ebitda / d.revenue) * 100 : null;
  const netMargin    = d.profitMargin != null
    ? d.profitMargin * 100
    : (d.netIncome && d.revenue ? (d.netIncome / d.revenue) * 100 : null);

  return (
    <div className="card p-5" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
        <div>
          <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--tx-1)", margin: 0, letterSpacing: "-0.02em" }}>
            Données financières
          </h3>
          {d.fiscalYearEnd && (
            <p style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "3px" }}>
              Exercice clos {new Date(d.fiscalYearEnd).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
              {" · "}
              <span style={{ color: "var(--tx-4)" }}>{d.source?.join(", ")}</span>
            </p>
          )}
        </div>
        {d.currentPrice && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{
              fontFamily: "'Banana Grotesk', monospace",
              fontSize: "1.125rem", fontWeight: 700,
              color: "var(--tx-1)", letterSpacing: "-0.03em",
            }}>
              {fmtPrice(d.currentPrice)}
            </div>
            {d.fiftyTwoWeekLow && d.fiftyTwoWeekHigh && (
              <div style={{ fontSize: "10px", color: "var(--tx-4)", marginTop: "2px" }}>
                52s : {fmtPrice(d.fiftyTwoWeekLow)} – {fmtPrice(d.fiftyTwoWeekHigh)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Analyst consensus */}
      {hasAnalyst && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <SectionTitle>Consensus analystes</SectionTitle>
            {d.numAnalysts && (
              <span style={{ fontSize: "11px", color: "var(--tx-4)" }}>{d.numAnalysts} analystes</span>
            )}
          </div>
          <RecoGauge score={d.analystScore} reco={d.analystReco} />
          {(d.targetLow || d.targetMean || d.targetHigh) && (
            <TargetBar current={d.currentPrice} low={d.targetLow} mean={d.targetMean} high={d.targetHigh} />
          )}
        </div>
      )}

      {/* Income statement */}
      {hasIncome && (
        <div>
          <SectionTitle>Compte de résultat</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "8px" }}>
            {d.revenue != null && <Metric label="Chiffre d'affaires" value={fmtB(d.revenue)} />}
            {d.grossProfit != null && (
              <Metric label="Marge brute" value={fmtB(d.grossProfit)}
                sub={d.revenue ? `${((d.grossProfit / d.revenue) * 100).toFixed(0)}%` : undefined} />
            )}
            {d.ebitda != null && (
              <Metric label="EBITDA" value={fmtB(d.ebitda)}
                sub={ebitdaMargin != null ? `${ebitdaMargin.toFixed(0)}% marge` : undefined}
                color={positiveColor(d.ebitda > 0)} />
            )}
            {d.netIncome != null && (
              <Metric label="Résultat net" value={fmtB(d.netIncome)}
                sub={netMargin != null ? `${netMargin.toFixed(1)}% marge` : undefined}
                color={positiveColor(d.netIncome > 0)} />
            )}
          </div>
        </div>
      )}

      {/* Valuation */}
      {hasValuation && (
        <div>
          <SectionTitle>Valorisation</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "8px" }}>
            {d.trailingPE != null && (
              <Metric label="PER (trailing)" value={fmtNum(d.trailingPE, 1) + "x"}
                color={d.trailingPE < 15 ? "var(--c-emerald)" : d.trailingPE < 25 ? "var(--tx-1)" : "var(--c-crimson)"}
                tooltip="Price / Earnings ratio (historique)" />
            )}
            {d.forwardPE != null && (
              <Metric label="PER (forward)" value={fmtNum(d.forwardPE, 1) + "x"}
                color={d.forwardPE < 15 ? "var(--c-emerald)" : d.forwardPE < 25 ? "var(--tx-1)" : "var(--c-crimson)"}
                tooltip="Price / Earnings projeté" />
            )}
            {d.priceToBook != null && <Metric label="P/Book" value={fmtX(d.priceToBook)} tooltip="Price / Valeur comptable" />}
            {d.beta != null && (
              <Metric label="Bêta" value={fmtNum(d.beta)}
                color={d.beta > 1.5 ? "var(--c-crimson)" : d.beta < 0.8 ? "var(--c-emerald)" : "var(--tx-1)"}
                tooltip="Volatilité relative au marché (1 = même risque)" />
            )}
          </div>
        </div>
      )}

      {/* Balance sheet */}
      {hasBalance && (
        <div>
          <SectionTitle>Bilan & trésorerie</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "8px" }}>
            {d.marketCap != null && <Metric label="Capitalisation" value={fmtB(d.marketCap)} />}
            {d.totalDebt != null && (
              <Metric label="Dette totale" value={fmtB(d.totalDebt)}
                color={d.totalDebt > (d.marketCap ?? Infinity) * 0.5 ? "var(--c-crimson)" : "var(--tx-1)"} />
            )}
            {d.freeCashFlow != null && (
              <Metric label="Free Cash Flow" value={fmtB(d.freeCashFlow)}
                color={positiveColor(d.freeCashFlow > 0)} />
            )}
            {d.debtToEquity != null && (
              <Metric label="Dette / FP" value={fmtNum(d.debtToEquity, 0) + "%"}
                color={d.debtToEquity < 50 ? "var(--c-emerald)" : d.debtToEquity < 150 ? "var(--tx-1)" : "var(--c-crimson)"}
                tooltip="Ratio dette / capitaux propres" />
            )}
          </div>
        </div>
      )}

      {/* Rentabilité & actionnariat */}
      {hasOwnership && (
        <div>
          <SectionTitle>Rentabilité & actionnariat</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "8px" }}>
            {d.returnOnEquity != null && (
              <Metric label="ROE" value={fmtPct(d.returnOnEquity)}
                color={d.returnOnEquity > 0.15 ? "var(--c-emerald)" : d.returnOnEquity > 0 ? "var(--tx-1)" : "var(--c-crimson)"}
                tooltip="Return on Equity" />
            )}
            {d.returnOnAssets != null && (
              <Metric label="ROA" value={fmtPct(d.returnOnAssets)}
                color={d.returnOnAssets > 0.05 ? "var(--c-emerald)" : d.returnOnAssets > 0 ? "var(--tx-1)" : "var(--c-crimson)"}
                tooltip="Return on Assets" />
            )}
            {d.heldByInsiders != null && (
              <Metric label="% dirigeants" value={fmtPct(d.heldByInsiders)}
                color={d.heldByInsiders > 0.1 ? "var(--c-indigo-2)" : "var(--tx-1)"}
                tooltip="Part du capital détenue par les dirigeants" />
            )}
            {d.heldByInstitutions != null && (
              <Metric label="% institutionnels" value={fmtPct(d.heldByInstitutions)}
                tooltip="Part du capital détenue par les institutionnels" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
