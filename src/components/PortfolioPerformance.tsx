"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

interface Position {
  id: string;
  name: string;
  isin: string | null;
  yahooSymbol: string | null;
  quantity: number;
  buyingPrice: number;
  currentPrice: number | null;
  totalInvested: number;
  currentValue: number | null;
  pnl: number | null;
  pnlPct: number | null;
}

interface HistoryPoint {
  date: string;
  value: number;
  invested: number;
  pnl: number;
  pct: number;
}

interface HistoryData {
  points: HistoryPoint[];
  totalInvested: number;
  totalValue: number;
  totalPnl: number;
  totalPct: number;
  hasRealData: boolean;
  positions: { name: string; pnl: number | null; pnlPct: number | null; invested: number; value: number }[];
}

type Period = "1W" | "1M" | "3M" | "6M" | "1Y" | "MAX";

const PERIODS: { key: Period; label: string }[] = [
  { key: "1W",  label: "1S" },
  { key: "1M",  label: "1M" },
  { key: "3M",  label: "3M" },
  { key: "6M",  label: "6M" },
  { key: "1Y",  label: "1A" },
  { key: "MAX", label: "MAX" },
];

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtEur(n: number, d = 0) {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number, sign = true) {
  return `${sign && n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Custom Tooltips ────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const value    = payload[0]?.value;
  const invested = payload[1]?.value;
  const pnl      = value != null && invested != null ? value - invested : null;
  const pct      = pnl != null && invested != null && invested > 0 ? (pnl / invested) * 100 : null;
  const isPos    = (pnl ?? 0) >= 0;

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-med)", borderRadius: "10px", padding: "10px 14px", boxShadow: "var(--shadow-md)", fontSize: "12px", minWidth: "160px" }}>
      <p style={{ color: "var(--tx-3)", marginBottom: "6px", fontSize: "11px" }}>{label}</p>
      <p style={{ fontWeight: 700, color: "var(--tx-1)", fontFamily: "monospace", fontSize: "14px" }}>{value != null ? fmtEur(value) : "—"}</p>
      {pnl != null && (
        <p style={{ color: isPos ? "var(--c-emerald)" : "var(--c-crimson)", fontWeight: 600, fontSize: "12px", marginTop: "2px" }}>
          {isPos ? "+" : ""}{fmtEur(pnl)} ({pct != null ? fmtPct(pct) : "—"})
        </p>
      )}
      {invested != null && <p style={{ color: "var(--tx-4)", fontSize: "10px", marginTop: "3px" }}>Investi : {fmtEur(invested)}</p>}
    </div>
  );
}

function BarTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; pnl: number; pct: number; invested: number; value: number } }[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const isPos = d.pnl >= 0;
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-med)", borderRadius: "10px", padding: "10px 14px", boxShadow: "var(--shadow-md)", fontSize: "12px", minWidth: "180px" }}>
      <p style={{ fontWeight: 700, color: "var(--tx-1)", marginBottom: "6px" }}>{d.name}</p>
      <p style={{ color: isPos ? "var(--c-emerald)" : "var(--c-crimson)", fontWeight: 600 }}>
        {isPos ? "+" : ""}{fmtEur(d.pnl)} ({fmtPct(d.pct)})
      </p>
      <p style={{ color: "var(--tx-3)", fontSize: "11px", marginTop: "3px" }}>Investi : {fmtEur(d.invested)}</p>
      <p style={{ color: "var(--tx-3)", fontSize: "11px" }}>Valeur : {fmtEur(d.value)}</p>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="card p-5" style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
      <div style={{ height: "24px", width: "180px", background: "var(--bg-raised)", borderRadius: "6px", marginBottom: "12px" }} />
      <div style={{ height: "40px", width: "260px", background: "var(--bg-raised)", borderRadius: "8px", marginBottom: "8px" }} />
      <div style={{ height: "200px", background: "var(--bg-raised)", borderRadius: "10px" }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function PortfolioPerformance({ positions }: { positions: Position[] }) {
  const [period, setPeriod] = useState<Period>("3M");
  const [data, setData]     = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch from API whenever period changes
  useEffect(() => {
    setLoading(true);
    fetch(`/api/portfolio/history?period=${period}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [period]);

  // Fallback to local positions if API hasn't loaded yet
  const totalInvested = data?.totalInvested ?? positions.reduce((s, p) => s + p.totalInvested, 0);
  const totalValue    = data?.totalValue    ?? positions.reduce((s, p) => s + (p.currentValue ?? p.totalInvested), 0);
  const totalPnl      = data?.totalPnl      ?? (totalValue - totalInvested);
  const totalPct      = data?.totalPct      ?? (totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0);
  const isPositive    = totalPnl >= 0;
  const hasPrices     = positions.some((p) => p.currentPrice != null);

  // Chart points
  const chartPoints = useMemo(() => {
    if (!data?.points?.length) return [];
    // Thin out if too many points
    const pts = data.points;
    if (pts.length <= 100) return pts.map((p) => ({ ...p, dateLabel: fmtDate(p.date) }));
    const step = Math.ceil(pts.length / 100);
    return pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map((p) => ({ ...p, dateLabel: fmtDate(p.date) }));
  }, [data]);

  // Waterfall from API positions data
  const waterfallData = useMemo(() => {
    const src = data?.positions ?? positions.map((p) => ({
      name: p.name, pnl: p.pnl, pnlPct: p.pnlPct, invested: p.totalInvested, value: p.currentValue ?? p.totalInvested,
    }));
    return src
      .filter((p) => p.pnl != null || (p.value !== p.invested))
      .map((p) => ({ name: p.name, pnl: p.pnl ?? (p.value - p.invested), pct: p.pnlPct ?? ((p.value - p.invested) / p.invested * 100), invested: p.invested, value: p.value }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [data, positions]);

  if (loading) return <Skeleton />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── Equity curve card ──────────────────────────────────────────── */}
      <div className="card p-5">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tx-3)", marginBottom: "6px" }}>
              Performance globale
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'Banana Grotesk', monospace", fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.04em", color: "var(--tx-1)" }}>
                {fmtEur(totalValue)}
              </span>
              <span style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-0.02em", color: isPositive ? "var(--c-emerald)" : "var(--c-crimson)" }}>
                {isPositive ? "+" : ""}{fmtEur(totalPnl)} ({fmtPct(totalPct)})
              </span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--tx-4)", marginTop: "4px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>{fmtEur(totalInvested)} investi · {positions.length} position{positions.length > 1 ? "s" : ""}</span>
              {!hasPrices && <span style={{ color: "var(--c-amber)" }}>· Actualisez les cours pour voir la vraie perf</span>}
              {data?.hasRealData && <span style={{ color: "var(--c-emerald)", fontSize: "0.7rem", fontWeight: 600 }}>· Données Yahoo Finance</span>}
              {hasPrices && !data?.hasRealData && <span style={{ color: "var(--tx-4)", fontSize: "0.7rem" }}>· Courbe estimée</span>}
            </div>
          </div>

          {/* Period selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "3px", background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "10px" }}>
            {PERIODS.map((p) => (
              <button key={p.key} onClick={() => setPeriod(p.key)} style={{
                padding: "4px 11px", borderRadius: "7px",
                fontFamily: "'Inter', system-ui", fontSize: "0.75rem", fontWeight: 600,
                border: "none", cursor: "pointer",
                background: period === p.key ? (isPositive ? "var(--c-emerald-bg)" : "var(--c-crimson-bg)") : "transparent",
                color: period === p.key ? (isPositive ? "var(--c-emerald)" : "var(--c-crimson)") : "var(--tx-3)",
                outline: period === p.key ? `1px solid ${isPositive ? "var(--c-emerald-bd)" : "var(--c-crimson-bd)"}` : "none",
                transition: "all 0.12s",
              }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        {chartPoints.length > 0 ? (
          <div style={{ height: "220px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartPoints} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="pg-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isPositive ? "var(--c-emerald)" : "var(--c-crimson)"} stopOpacity={0.2}/>
                    <stop offset="100%" stopColor={isPositive ? "var(--c-emerald)" : "var(--c-crimson)"} stopOpacity={0.02}/>
                  </linearGradient>
                  <linearGradient id="pi-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--c-indigo)" stopOpacity={0.08}/>
                    <stop offset="100%" stopColor="var(--c-indigo)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: "var(--tx-4)" }} axisLine={false} tickLine={false}
                  interval={Math.ceil(chartPoints.length / 6)} />
                <YAxis tick={{ fontSize: 10, fill: "var(--tx-4)" }} axisLine={false} tickLine={false} width={75}
                  tickFormatter={(v) => fmtEur(v, 0)} domain={["auto", "auto"]}/>
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={totalInvested} stroke="var(--c-indigo)" strokeDasharray="4 4" strokeWidth={1} opacity={0.4}/>
                <Area type="monotone" dataKey="invested" stroke="var(--c-indigo)" strokeWidth={1.5} strokeDasharray="4 4"
                  fill="url(#pi-fill)" dot={false} activeDot={false}/>
                <Area type="monotone" dataKey="value" stroke={isPositive ? "var(--c-emerald)" : "var(--c-crimson)"}
                  strokeWidth={2.5} fill="url(#pg-fill)" dot={false}
                  activeDot={{ r: 4, fill: isPositive ? "var(--c-emerald)" : "var(--c-crimson)", strokeWidth: 0 }}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "12px" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ color: "var(--tx-4)", opacity: 0.5 }}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p style={{ color: "var(--tx-3)", fontSize: "0.84rem", textAlign: "center" }}>
              Actualisez les cours pour afficher le graphique de performance
            </p>
          </div>
        )}

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "16px", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "24px", height: "2px", background: isPositive ? "var(--c-emerald)" : "var(--c-crimson)", borderRadius: "1px" }}/>
            <span style={{ fontSize: "11px", color: "var(--tx-3)" }}>Valeur du portfolio</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "24px", height: "2px", background: "var(--c-indigo)", borderRadius: "1px", opacity: 0.6 }}/>
            <span style={{ fontSize: "11px", color: "var(--tx-3)" }}>Capital investi</span>
          </div>
        </div>
      </div>

      {/* ── P&L waterfall ──────────────────────────────────────────────── */}
      {waterfallData.length > 0 && (
        <div className="card p-5">
          <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tx-3)", marginBottom: "16px" }}>
            P&L par position
          </div>
          <div style={{ height: Math.max(160, waterfallData.length * 36) + "px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={waterfallData} layout="vertical" margin={{ top: 0, right: 80, left: 0, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" horizontal={false}/>
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--tx-4)" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`} domain={["auto", "auto"]}/>
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "var(--tx-2)", fontWeight: 500 }}
                  axisLine={false} tickLine={false} width={130}
                  tickFormatter={(v) => v.length > 18 ? v.slice(0, 17) + "…" : v}/>
                <Tooltip content={<BarTooltip />} cursor={{ fill: "var(--bg-hover)" }}/>
                <ReferenceLine x={0} stroke="var(--border-strong)" strokeWidth={1}/>
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                  {waterfallData.map((entry) => (
                    <Cell key={entry.name} fill={entry.pnl >= 0 ? "var(--c-emerald)" : "var(--c-crimson)"} fillOpacity={0.85}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── KPI grid ───────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
        {[
          { label: "Capital investi",     value: fmtEur(totalInvested),                   sub: `${positions.length} lignes`,          color: "var(--tx-1)" },
          { label: "Valeur actuelle",      value: fmtEur(totalValue),                      sub: hasPrices ? "cours temps réel" : "PRU × quantité", color: "var(--tx-1)" },
          { label: "Plus-value latente",   value: `${isPositive ? "+" : ""}${fmtEur(totalPnl)}`, sub: fmtPct(totalPct),              color: isPositive ? "var(--c-emerald)" : "var(--c-crimson)" },
          { label: "En hausse",            value: String(positions.filter((p) => (p.pnlPct ?? 0) > 0).length), sub: `${positions.filter((p) => (p.pnlPct ?? 0) < 0).length} en baisse`, color: "var(--c-emerald)" },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", fontWeight: 500, marginBottom: "4px" }}>{k.label}</div>
            <div style={{ fontFamily: "'Banana Grotesk', monospace", fontSize: "1.1rem", fontWeight: 700, color: k.color, letterSpacing: "-0.03em" }}>{k.value}</div>
            <div style={{ fontSize: "0.7rem", color: "var(--tx-4)", marginTop: "3px" }}>{k.sub}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
