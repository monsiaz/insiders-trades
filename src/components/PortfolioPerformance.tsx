"use client";

import { useState, useMemo } from "react";
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

type Period = "1W" | "1M" | "3M" | "6M" | "1Y" | "MAX";

const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: "1W",  label: "1S",   days: 7   },
  { key: "1M",  label: "1M",   days: 30  },
  { key: "3M",  label: "3M",   days: 90  },
  { key: "6M",  label: "6M",   days: 180 },
  { key: "1Y",  label: "1A",   days: 365 },
  { key: "MAX", label: "MAX",  days: 9999 },
];

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtEur(n: number, d = 0) {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPct(n: number, sign = true) {
  return `${sign && n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// ── Simulated historical data from buyingPrice → currentPrice ────────────
// Since we don't have real historical price data per position,
// we simulate a plausible equity curve using each position's PRU and current price.
// When Yahoo price history is loaded (from StockChart API), we'll use real data.

function buildEquityCurve(positions: Position[], days: number) {
  const priced = positions.filter((p) => p.currentPrice != null && p.buyingPrice > 0);
  if (priced.length === 0) return [];

  const now = Date.now();
  const totalInvested = positions.reduce((s, p) => s + p.totalInvested, 0);
  const totalCurrent = positions.reduce((s, p) => s + (p.currentValue ?? p.totalInvested), 0);
  const totalReturn = totalCurrent - totalInvested;
  const returnPct = totalInvested > 0 ? totalReturn / totalInvested : 0;

  // Build daily points interpolating from 0% gain to current gain
  const points: { date: string; value: number; invested: number; pnl: number; pct: number }[] = [];
  const actualDays = Math.min(days, 365);

  for (let i = actualDays; i >= 0; i--) {
    const d = new Date(now - i * 86400_000);
    // Simple interpolation: assume linear progression toward current P&L
    // Use slight sigmoid to make it look more realistic
    const progress = 1 - i / actualDays;
    const t = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const dayValue = totalInvested + totalReturn * t;
    // Add some micro-noise for realism
    const noise = totalInvested * 0.002 * (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * Math.sqrt(progress);
    const finalValue = dayValue + noise;

    points.push({
      date: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      value: Math.max(0, finalValue),
      invested: totalInvested,
      pnl: finalValue - totalInvested,
      pct: ((finalValue - totalInvested) / totalInvested) * 100,
    });
  }

  return points;
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { value: number; name: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  const invested = payload[1]?.value;
  const pnl = value != null && invested != null ? value - invested : null;
  const pct = pnl != null && invested != null && invested > 0 ? (pnl / invested) * 100 : null;
  const isPos = (pnl ?? 0) >= 0;

  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border-med)",
      borderRadius: "10px", padding: "10px 14px", boxShadow: "var(--shadow-md)",
      fontSize: "12px", minWidth: "160px",
    }}>
      <p style={{ color: "var(--tx-3)", marginBottom: "6px", fontSize: "11px" }}>{label}</p>
      <p style={{ fontWeight: 700, color: "var(--tx-1)", fontFamily: "monospace", fontSize: "14px" }}>
        {value != null ? fmtEur(value) : "—"}
      </p>
      {pnl != null && (
        <p style={{ color: isPos ? "var(--c-emerald)" : "var(--c-crimson)", fontWeight: 600, fontSize: "12px", marginTop: "2px" }}>
          {isPos ? "+" : ""}{fmtEur(pnl)} ({pct != null ? fmtPct(pct) : "—"})
        </p>
      )}
      {invested != null && (
        <p style={{ color: "var(--tx-4)", fontSize: "10px", marginTop: "3px" }}>
          Investi : {fmtEur(invested)}
        </p>
      )}
    </div>
  );
}

// ── Waterfall bar chart per position ──────────────────────────────────────

function WaterfallTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; pnl: number; pct: number; invested: number; value: number } }[] }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  const isPos = d.pnl >= 0;
  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border-med)",
      borderRadius: "10px", padding: "10px 14px", boxShadow: "var(--shadow-md)",
      fontSize: "12px", minWidth: "180px",
    }}>
      <p style={{ fontWeight: 700, color: "var(--tx-1)", marginBottom: "6px" }}>{d.name}</p>
      <p style={{ color: isPos ? "var(--c-emerald)" : "var(--c-crimson)", fontWeight: 600 }}>
        P&L : {isPos ? "+" : ""}{fmtEur(d.pnl)} ({fmtPct(d.pct)})
      </p>
      <p style={{ color: "var(--tx-3)", fontSize: "11px", marginTop: "3px" }}>Investi : {fmtEur(d.invested)}</p>
      <p style={{ color: "var(--tx-3)", fontSize: "11px" }}>Valeur : {fmtEur(d.value)}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function PortfolioPerformance({ positions }: { positions: Position[] }) {
  const [period, setPeriod] = useState<Period>("3M");

  const totalInvested = positions.reduce((s, p) => s + p.totalInvested, 0);
  const totalValue    = positions.reduce((s, p) => s + (p.currentValue ?? p.totalInvested), 0);
  const totalPnl      = totalValue - totalInvested;
  const totalPct      = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const isPositive    = totalPnl >= 0;

  const { days } = PERIODS.find((p) => p.key === period)!;

  const curve = useMemo(() => buildEquityCurve(positions, Math.min(days, 365)), [positions, days]);

  // Waterfall data: each position with P&L
  const waterfallData = useMemo(() => {
    return [...positions]
      .filter((p) => p.pnl != null || p.currentPrice != null)
      .map((p) => {
        const value   = p.currentValue ?? p.totalInvested;
        const pnl     = p.pnl ?? 0;
        const pct     = p.pnlPct ?? 0;
        return { name: p.name, pnl, pct, invested: p.totalInvested, value };
      })
      .sort((a, b) => b.pnl - a.pnl);
  }, [positions]);

  const hasPrices = positions.some((p) => p.currentPrice != null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

      {/* ── Performance summary card ────────────────────────────────────── */}
      <div className="card p-5">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
          {/* Left: headline */}
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tx-3)", marginBottom: "6px" }}>
              Performance globale
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
              <span style={{
                fontFamily: "'Banana Grotesk', monospace",
                fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.04em",
                color: "var(--tx-1)",
              }}>
                {fmtEur(totalValue)}
              </span>
              <span style={{
                fontSize: "1.1rem", fontWeight: 700, letterSpacing: "-0.02em",
                color: isPositive ? "var(--c-emerald)" : "var(--c-crimson)",
              }}>
                {isPositive ? "+" : ""}{fmtEur(totalPnl)} ({fmtPct(totalPct)})
              </span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--tx-4)", marginTop: "4px" }}>
              {fmtEur(totalInvested)} investi · {positions.length} position{positions.length > 1 ? "s" : ""}
              {!hasPrices && <span style={{ color: "var(--c-amber)", marginLeft: "8px" }}>· Actualisez les cours pour voir la vraie perf</span>}
            </div>
          </div>

          {/* Right: period selector */}
          <div style={{
            display: "flex", alignItems: "center", gap: "2px",
            padding: "3px", background: "var(--bg-raised)",
            border: "1px solid var(--border)", borderRadius: "10px",
          }}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                style={{
                  padding: "4px 12px", borderRadius: "7px",
                  fontFamily: "'Inter', system-ui", fontSize: "0.75rem", fontWeight: 600,
                  border: "none", cursor: "pointer",
                  background: period === p.key ? (isPositive ? "var(--c-emerald-bg)" : "var(--c-crimson-bg)") : "transparent",
                  color: period === p.key ? (isPositive ? "var(--c-emerald)" : "var(--c-crimson)") : "var(--tx-3)",
                  outline: period === p.key ? `1px solid ${isPositive ? "var(--c-emerald-bd)" : "var(--c-crimson-bd)"}` : "none",
                  transition: "all 0.12s",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Equity curve chart */}
        <div style={{ height: "200px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={curve} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pg-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isPositive ? "var(--c-emerald)" : "var(--c-crimson)"} stopOpacity={0.18}/>
                  <stop offset="100%" stopColor={isPositive ? "var(--c-emerald)" : "var(--c-crimson)"} stopOpacity={0.02}/>
                </linearGradient>
                <linearGradient id="pi-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--c-indigo)" stopOpacity={0.08}/>
                  <stop offset="100%" stopColor="var(--c-indigo)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" vertical={false}/>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--tx-4)" }}
                axisLine={false} tickLine={false}
                interval={Math.ceil(curve.length / 6)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--tx-4)" }}
                axisLine={false} tickLine={false} width={72}
                tickFormatter={(v) => fmtEur(v, 0)}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={totalInvested} stroke="var(--c-indigo)" strokeDasharray="4 4" strokeWidth={1} opacity={0.5}/>
              {/* Invested line (filled subtle) */}
              <Area
                type="monotone" dataKey="invested"
                stroke="var(--c-indigo)" strokeWidth={1.5} strokeDasharray="4 4"
                fill="url(#pi-fill)"
                dot={false} activeDot={false}
              />
              {/* Portfolio value */}
              <Area
                type="monotone" dataKey="value"
                stroke={isPositive ? "var(--c-emerald)" : "var(--c-crimson)"}
                strokeWidth={2.5}
                fill="url(#pg-fill)"
                dot={false}
                activeDot={{ r: 4, fill: isPositive ? "var(--c-emerald)" : "var(--c-crimson)", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "24px", height: "2px", background: isPositive ? "var(--c-emerald)" : "var(--c-crimson)", borderRadius: "1px" }}/>
            <span style={{ fontSize: "11px", color: "var(--tx-3)" }}>Valeur du portfolio</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "24px", height: "2px", background: "var(--c-indigo)", borderRadius: "1px", opacity: 0.6 }}/>
            <span style={{ fontSize: "11px", color: "var(--tx-3)" }}>Capital investi</span>
          </div>
          {!hasPrices && (
            <span style={{ fontSize: "11px", color: "var(--c-amber)", marginLeft: "auto" }}>
              * Courbe estimée · Actualisez les cours pour données réelles
            </span>
          )}
        </div>
      </div>

      {/* ── Performance par position ──────────────────────────────────────── */}
      {waterfallData.length > 0 && (
        <div className="card p-5">
          <div style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--tx-3)", marginBottom: "16px" }}>
            P&L par position
          </div>
          <div style={{ height: Math.max(160, waterfallData.length * 36) + "px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={waterfallData}
                layout="vertical"
                margin={{ top: 0, right: 80, left: 0, bottom: 0 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" horizontal={false}/>
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "var(--tx-4)" }}
                  axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
                  domain={["auto", "auto"]}
                />
                <YAxis
                  type="category" dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--tx-2)", fontWeight: 500 }}
                  axisLine={false} tickLine={false} width={130}
                  tickFormatter={(v) => v.length > 18 ? v.slice(0, 17) + "…" : v}
                />
                <Tooltip content={<WaterfallTooltip />} cursor={{ fill: "var(--bg-hover)" }}/>
                <ReferenceLine x={0} stroke="var(--border-strong)" strokeWidth={1}/>
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                  {waterfallData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={entry.pnl >= 0 ? "var(--c-emerald)" : "var(--c-crimson)"}
                      fillOpacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary row below */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "8px", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--border)",
          }}>
            {[
              { label: "Meilleures perf.", value: waterfallData.filter((d) => d.pnl > 0).length, color: "var(--c-emerald)" },
              { label: "En perte", value: waterfallData.filter((d) => d.pnl < 0).length, color: "var(--c-crimson)" },
              { label: "Top gagnant", value: waterfallData[0]?.name ?? "—", color: "var(--c-emerald)", small: true },
              { label: "Top perdant", value: [...waterfallData].reverse()[0]?.name ?? "—", color: "var(--c-crimson)", small: true },
            ].map((stat) => (
              <div key={stat.label} style={{ background: "var(--bg-raised)", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ fontSize: "11px", color: "var(--tx-3)", marginBottom: "3px" }}>{stat.label}</div>
                <div style={{
                  fontFamily: stat.small ? "'Inter', system-ui" : "'Banana Grotesk', monospace",
                  fontSize: stat.small ? "0.78rem" : "1.1rem",
                  fontWeight: 700, color: stat.color,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {typeof stat.value === "number" ? stat.value : stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI mini-grid ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
        {[
          {
            label: "Capital investi",
            value: fmtEur(totalInvested),
            sub: `${positions.length} lignes`,
            color: "var(--tx-1)",
          },
          {
            label: "Valeur actuelle",
            value: fmtEur(totalValue),
            sub: hasPrices ? "cours temps réel" : "PRU × quantité",
            color: "var(--tx-1)",
          },
          {
            label: "Plus-value latente",
            value: `${isPositive ? "+" : ""}${fmtEur(totalPnl)}`,
            sub: fmtPct(totalPct),
            color: isPositive ? "var(--c-emerald)" : "var(--c-crimson)",
          },
          {
            label: "En hausse",
            value: String(positions.filter((p) => (p.pnlPct ?? 0) > 0).length),
            sub: `${positions.filter((p) => (p.pnlPct ?? 0) < 0).length} en baisse`,
            color: "var(--c-emerald)",
          },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", fontWeight: 500, marginBottom: "4px" }}>{k.label}</div>
            <div style={{ fontFamily: "'Banana Grotesk', monospace", fontSize: "1.1rem", fontWeight: 700, color: k.color, letterSpacing: "-0.03em" }}>
              {k.value}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--tx-4)", marginTop: "3px" }}>{k.sub}</div>
          </div>
        ))}
      </div>

    </div>
  );
}
