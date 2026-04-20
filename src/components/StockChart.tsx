"use client";

import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
} from "recharts";
import { useEffect, useState, useMemo } from "react";

interface StockPoint {
  date: string;
  close: number;
}

interface TradeEvent {
  date: string;
  type: "buy" | "sell" | "other";
  amount?: number;
  person?: string;
}

interface StockChartProps {
  isin?: string | null;
  companyName: string;
  trades?: TradeEvent[];
}

interface StockData {
  symbol: string;
  latest: number;
  change: number;
  currency?: string;
  points: StockPoint[];
}

type RangeOption = "1mo" | "3mo" | "6mo" | "1y" | "2y";
type TradeFilter = "all" | "buy" | "sell";

const RANGE_OPTIONS: { label: string; value: RangeOption }[] = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1A", value: "1y" },
  { label: "2A", value: "2y" },
];

/** Normalize trade ISO date string to chart date format (YYYY-MM-DD, UTC) */
function normalizeDate(isoDate: string): string {
  const d = new Date(isoDate);
  const utcH = d.getUTCHours();
  const base = utcH >= 20
    ? new Date(d.getTime() + 86400000)
    : d;
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}

function formatXAxis(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function scaleDotRadius(amount: number, min: number, max: number): number {
  if (max <= min) return 7;
  const log = (v: number) => Math.log(Math.max(v, 1));
  const t = (log(amount) - log(min)) / (log(max) - log(min));
  return Math.round(4 + t * 12); // 4px to 16px
}

function fmtAmount(v: number, currency = "EUR"): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency", currency,
    maximumFractionDigits: 0,
    notation: v >= 1_000_000 ? "compact" : "standard",
  }).format(v);
}

function fmtDate(d: string): string {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomChartTooltip = ({ active, payload, label, tradeMap, currency }: any) => {
  if (!active || !payload?.length) return null;
  const price = payload[0]?.value as number;
  const trade = tradeMap?.get(label) as TradeEvent | undefined;

  return (
    <div style={{
      padding: "10px 14px", borderRadius: "12px",
      border: "1px solid var(--border-med)",
      background: "var(--bg-surface)",
      boxShadow: "var(--shadow-md)",
      fontSize: "11px", minWidth: "160px",
    }}>
      <p style={{ color: "var(--tx-3)", marginBottom: "4px" }}>{formatXAxis(label)}</p>
      <p style={{ color: "var(--tx-1)", fontWeight: 700, fontSize: "13px", fontFamily: "monospace" }}>
        {new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "EUR", minimumFractionDigits: 2 }).format(price)}
      </p>
      {trade && (
        <div style={{
          marginTop: "8px", paddingTop: "8px",
          borderTop: "1px solid var(--border)",
          color: trade.type === "sell" ? "var(--c-crimson)" : "var(--c-emerald)",
        }}>
          <div style={{ fontWeight: 700, fontSize: "10px", marginBottom: "2px" }}>
            {trade.type === "sell" ? "▼ Vente" : "▲ Achat"}
          </div>
          {trade.person && <p style={{ color: "var(--tx-2)", fontWeight: 500 }}>{trade.person}</p>}
          {trade.amount && <p style={{ fontWeight: 700 }}>{fmtAmount(trade.amount, currency)}</p>}
        </div>
      )}
    </div>
  );
};

export function StockChart({ isin, companyName, trades = [] }: StockChartProps) {
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<RangeOption>("6mo");
  const [filter, setFilter] = useState<TradeFilter>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");

  useEffect(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ range });
    if (isin) params.set("isin", isin);
    params.set("name", companyName);
    fetch(`/api/stock?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [isin, companyName, range]);

  // Build price lookup map
  const priceMap = useMemo(() => {
    const m = new Map<string, number>();
    data?.points.forEach((p) => m.set(p.date, p.close));
    return m;
  }, [data]);

  // Normalize + filter trades in current range
  const normalizedTrades = useMemo(() => {
    if (!data?.points.length) return [];
    const rangeStart = data.points[0].date;
    const rangeEnd = data.points[data.points.length - 1].date;

    // Deduplicate by date: keep highest amount
    const byDate = new Map<string, TradeEvent>();
    for (const t of trades) {
      const norm = normalizeDate(t.date.length === 10 ? t.date + "T12:00:00Z" : t.date);
      if (norm < rangeStart || norm > rangeEnd) continue;
      const existing = byDate.get(norm);
      if (!existing || (t.amount ?? 0) > (existing.amount ?? 0)) {
        byDate.set(norm, { ...t, date: norm });
      }
    }
    return Array.from(byDate.values());
  }, [trades, data]);

  // Trade list (all trades, not deduplicated)
  const allTrades = useMemo(() => {
    if (!data?.points.length) return [];
    const rangeStart = data.points[0].date;
    const rangeEnd = data.points[data.points.length - 1].date;

    return trades
      .map((t) => ({ ...t, date: normalizeDate(t.date.length === 10 ? t.date + "T12:00:00Z" : t.date) }))
      .filter((t) => t.date >= rangeStart && t.date <= rangeEnd);
  }, [trades, data]);

  const filteredTrades = useMemo(() => {
    let list = allTrades;
    if (filter === "buy") list = list.filter((t) => t.type === "buy");
    if (filter === "sell") list = list.filter((t) => t.type === "sell");
    if (sortBy === "amount") list = [...list].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
    else list = [...list].sort((a, b) => b.date.localeCompare(a.date));
    return list;
  }, [allTrades, filter, sortBy]);

  const tradeMap = useMemo(() => {
    const m = new Map<string, TradeEvent>();
    normalizedTrades.forEach((t) => m.set(t.date, t));
    return m;
  }, [normalizedTrades]);

  // Stats
  const buyTrades = allTrades.filter((t) => t.type === "buy");
  const sellTrades = allTrades.filter((t) => t.type === "sell");
  const totalBuy = buyTrades.reduce((s, t) => s + (t.amount ?? 0), 0);
  const totalSell = sellTrades.reduce((s, t) => s + (t.amount ?? 0), 0);

  // Dot sizes
  const amounts = normalizedTrades.filter((t) => t.amount).map((t) => t.amount!);
  const minAmt = Math.min(...amounts);
  const maxAmt = Math.max(...amounts);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 h-64 flex items-center justify-center">
        <div className="flex items-center gap-3 text-[var(--tx-3)]">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Chargement du cours...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-card rounded-2xl p-5 h-20 flex items-center justify-center">
        <p className="text-[var(--tx-3)] text-sm">Cours non disponible pour cette société</p>
      </div>
    );
  }

  const isPositive = data.change >= 0;
  const lineColor = isPositive ? "#10b981" : "#f43f5e";
  const currency = data.currency || "EUR";
  const gradientId = `sg-${data.symbol.replace(/[^a-zA-Z0-9]/g, "")}`;

  const prices = data.points.map((p) => p.close);
  const minClose = Math.min(...prices);
  const maxClose = Math.max(...prices);
  const pad = Math.max((maxClose - minClose) * 0.15, maxClose * 0.02);

  return (
    <div className="space-y-3">
      {/* Chart card */}
      <div className="glass-card rounded-2xl p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "'Banana Grotesk', monospace", color: "var(--tx-1)", letterSpacing: "-0.04em" }}>
                  {new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: 2 }).format(data.latest)}
                </span>
                <span style={{
                  fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: "20px",
                  border: `1px solid ${isPositive ? "var(--c-emerald-bd)" : "var(--c-crimson-bd)"}`,
                  background: isPositive ? "var(--c-emerald-bg)" : "var(--c-crimson-bg)",
                  color: isPositive ? "var(--c-emerald)" : "var(--c-crimson)",
                }}>
                  {isPositive ? "+" : ""}{data.change.toFixed(2)}%
                </span>
              </div>
              <p style={{ fontSize: "11px", color: "var(--tx-4)", marginTop: "2px" }}>{data.symbol} · Euronext Paris</p>
            </div>
            {/* Mini stats pills */}
            {buyTrades.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 ml-2">
                {totalBuy > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 text-emerald-400">
                    ▲ {fmtAmount(totalBuy, currency)}
                  </span>
                )}
                {totalSell > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/15 text-rose-400">
                    ▼ {fmtAmount(totalSell, currency)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Range selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "3px", background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "10px" }}>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                style={{
                  padding: "3px 10px", borderRadius: "7px",
                  fontSize: "11px", fontWeight: 600,
                  border: "none", cursor: "pointer",
                  background: range === opt.value ? "var(--bg-active)" : "transparent",
                  color: range === opt.value ? "var(--tx-1)" : "var(--tx-3)",
                  transition: "all 0.12s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data.points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 5" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatXAxis}
                tick={{ fontSize: 10, fill: "var(--tx-4)" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                domain={[minClose - pad, maxClose + pad]}
                tick={{ fontSize: 10, fill: "#475569" }}
                axisLine={false}
                tickLine={false}
                width={58}
                tickFormatter={(v) =>
                  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + " €"
                }
              />
              <Tooltip
                content={<CustomChartTooltip tradeMap={tradeMap} currency={currency} />}
                cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={lineColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
              />
              {/* Trade dots — sized by amount */}
              {normalizedTrades.map((trade) => {
                const price = priceMap.get(trade.date);
                if (!price) return null;
                const r = scaleDotRadius(trade.amount ?? 1, minAmt, maxAmt);
                const isBuy = trade.type !== "sell";
                const fillColor = isBuy ? "#10b981" : "#f43f5e";
                const strokeColor = isBuy ? "#064e3b" : "#881337";
                return (
                  <ReferenceDot
                    key={trade.date}
                    x={trade.date}
                    y={price}
                    r={r}
                    fill={fillColor}
                    fillOpacity={0.9}
                    stroke={strokeColor}
                    strokeWidth={1.5}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        {normalizedTrades.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "8px", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
            <span style={{ fontSize: "11px", color: "var(--tx-4)" }}>Transactions insiders sur la période :</span>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--c-emerald)" }} />
              <span style={{ fontSize: "11px", color: "var(--tx-3)" }}>Achat</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--c-crimson)" }} />
              <span style={{ fontSize: "11px", color: "var(--tx-3)" }}>Vente</span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--tx-4)" }}>· taille = montant</span>
          </div>
        )}
      </div>

      {/* Trades detail section */}
      {allTrades.length > 0 && (
        <div className="card" style={{ overflow: "hidden" }}>
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "3px", background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "9px" }}>
              {(["all", "buy", "sell"] as TradeFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "3px 10px", borderRadius: "6px",
                    fontSize: "11px", fontWeight: 600,
                    border: filter === f && f === "buy" ? "1px solid var(--c-emerald-bd)"
                          : filter === f && f === "sell" ? "1px solid var(--c-crimson-bd)"
                          : "1px solid transparent",
                    background: filter === f && f === "buy" ? "var(--c-emerald-bg)"
                              : filter === f && f === "sell" ? "var(--c-crimson-bg)"
                              : filter === f ? "var(--bg-active)" : "transparent",
                    color: filter === f && f === "buy" ? "var(--c-emerald)"
                         : filter === f && f === "sell" ? "var(--c-crimson)"
                         : filter === f ? "var(--tx-1)" : "var(--tx-3)",
                    cursor: "pointer", transition: "all 0.12s",
                  }}
                >
                  {f === "all" ? `Tous (${allTrades.length})` : f === "buy" ? `▲ Achats (${buyTrades.length})` : `▼ Ventes (${sellTrades.length})`}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "11px", color: "var(--tx-4)", marginRight: "4px" }}>Trier :</span>
              {(["date", "amount"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  style={{
                    padding: "3px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: 500,
                    background: sortBy === s ? "var(--bg-hover)" : "transparent",
                    color: sortBy === s ? "var(--tx-1)" : "var(--tx-3)",
                    border: "none", cursor: "pointer",
                  }}
                >
                  {s === "date" ? "Date" : "Montant"}
                </button>
              ))}
            </div>
          </div>

          {/* Trades list */}
          <div style={{ maxHeight: "288px", overflowY: "auto" }}>
            {filteredTrades.slice(0, 100).map((trade, i) => {
              const isBuy = trade.type !== "sell";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 20px", borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  {/* Type indicator */}
                  <div style={{
                    width: "22px", height: "22px", borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, fontSize: "9px", fontWeight: 700,
                    background: isBuy ? "var(--c-emerald-bg)" : "var(--c-crimson-bg)",
                    color: isBuy ? "var(--c-emerald)" : "var(--c-crimson)",
                    border: `1px solid ${isBuy ? "var(--c-emerald-bd)" : "var(--c-crimson-bd)"}`,
                  }}>
                    {isBuy ? "▲" : "▼"}
                  </div>
                  {/* Date */}
                  <span style={{ fontSize: "11px", color: "var(--tx-3)", width: "72px", flexShrink: 0, fontFamily: "monospace" }}>
                    {fmtDate(trade.date)}
                  </span>
                  {/* Person */}
                  <span style={{ fontSize: "0.78rem", color: "var(--tx-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>
                    {trade.person ?? "—"}
                  </span>
                  {/* Amount */}
                  {trade.amount && (
                    <span style={{ fontSize: "0.84rem", fontWeight: 700, flexShrink: 0, fontFamily: "monospace", color: isBuy ? "var(--c-emerald)" : "var(--c-crimson)" }}>
                      {fmtAmount(trade.amount, currency)}
                    </span>
                  )}
                </div>
              );
            })}
            {filteredTrades.length === 0 && (
              <div style={{ padding: "24px", textAlign: "center", color: "var(--tx-3)", fontSize: "0.84rem" }}>
                Aucune transaction sur la période
              </div>
            )}
          </div>

          {/* Summary footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderTop: "1px solid var(--border)", background: "var(--bg-raised)" }}>
            <span style={{ fontSize: "11px", color: "var(--tx-4)" }}>
              {filteredTrades.length} transaction{filteredTrades.length > 1 ? "s" : ""} sur la période
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {totalBuy > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10px", color: "var(--tx-4)" }}>Achats</span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--c-emerald)", fontFamily: "monospace" }}>{fmtAmount(totalBuy, currency)}</span>
                </div>
              )}
              {totalSell > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10px", color: "var(--tx-4)" }}>Ventes</span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--c-crimson)", fontFamily: "monospace" }}>{fmtAmount(totalSell, currency)}</span>
                </div>
              )}
              {totalBuy > 0 && totalSell > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10px", color: "var(--tx-4)" }}>Net</span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, fontFamily: "monospace", color: totalBuy - totalSell >= 0 ? "var(--c-emerald)" : "var(--c-crimson)" }}>
                    {totalBuy - totalSell >= 0 ? "+" : ""}{fmtAmount(Math.abs(totalBuy - totalSell), currency)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
