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

/** Aggregated bubble · one per (day, buy|sell). Holds all trades that contributed. */
interface TradeBubble {
  date: string;
  type: "buy" | "sell";
  totalAmount: number;
  count: number;
  trades: TradeEvent[];
}

interface StockChartProps {
  isin?: string | null;
  companyName: string;
  trades?: TradeEvent[];
  locale?: string;
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

function getRangeOptions(isFr: boolean): { label: string; value: RangeOption }[] {
  return [
    { label: "1M",  value: "1mo" },
    { label: "3M",  value: "3mo" },
    { label: "6M",  value: "6mo" },
    { label: isFr ? "1A" : "1Y", value: "1y"  },
    { label: isFr ? "2A" : "2Y", value: "2y"  },
  ];
}

/** Normalize trade ISO date string to chart date format (YYYY-MM-DD, UTC) */
function normalizeDate(isoDate: string): string {
  const d = new Date(isoDate);
  const utcH = d.getUTCHours();
  const base = utcH >= 20
    ? new Date(d.getTime() + 86400000)
    : d;
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}`;
}

function makeFormatXAxis(numLocale: string) {
  return (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(numLocale, { day: "numeric", month: "short" });
  };
}

function scaleDotRadius(amount: number, min: number, max: number): number {
  if (max <= min) return 7;
  const log = (v: number) => Math.log(Math.max(v, 1));
  const t = (log(amount) - log(min)) / (log(max) - log(min));
  return Math.round(4 + t * 12);
}

function makeFmtAmount(numLocale: string) {
  return (v: number, currency = "EUR") =>
    new Intl.NumberFormat(numLocale, {
      style: "currency", currency,
      maximumFractionDigits: 0,
      notation: v >= 1_000_000 ? "compact" : "standard",
    }).format(v);
}

function makeFmtDate(numLocale: string) {
  return (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(numLocale, { day: "numeric", month: "short", year: "2-digit" });
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomChartTooltip = ({ active, payload, label, tradeMap, currency, isFr, fmtAmount, formatXAxis, numLocale }: any) => {
  if (!active || !payload?.length) return null;
  const price = payload[0]?.value as number;
  const bubbles = (tradeMap?.get(label) as TradeBubble[] | undefined) ?? [];

  return (
    <div style={{
      padding: "10px 14px", borderRadius: "12px",
      border: "1px solid var(--border-med)",
      background: "var(--bg-surface)",
      boxShadow: "var(--shadow-md)",
      fontSize: "11px", minWidth: "180px", maxWidth: "280px",
    }}>
      <p style={{ color: "var(--tx-3)", marginBottom: "4px" }}>{formatXAxis(label)}</p>
      <p style={{ color: "var(--tx-1)", fontWeight: 700, fontSize: "13px", fontFamily: "monospace" }}>
        {new Intl.NumberFormat(numLocale, { style: "currency", currency: currency || "EUR", minimumFractionDigits: 2 }).format(price)}
      </p>
      {bubbles.map((bubble: TradeBubble, i: number) => {
        const isBuy = bubble.type === "buy";
        const persons = Array.from(new Set(bubble.trades.map((t) => t.person).filter(Boolean))) as string[];
        return (
          <div key={i} style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid var(--border)", color: isBuy ? "var(--signal-pos)" : "var(--signal-neg)" }}>
            <div style={{ fontWeight: 700, fontSize: "10px", marginBottom: "3px", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>{isBuy ? (isFr ? "▲ Achat" : "▲ Buy") : (isFr ? "▼ Vente" : "▼ Sale")}</span>
              {bubble.count > 1 && (
                <span style={{ background: isBuy ? "var(--signal-pos-bg)" : "var(--signal-neg-bg)", border: `1px solid ${isBuy ? "var(--signal-pos-bd)" : "var(--signal-neg-bd)"}`, padding: "0px 5px", borderRadius: "3px", fontSize: "9px", fontWeight: 700 }}>
                  × {bubble.count}
                </span>
              )}
            </div>
            {persons.length > 0 && (
              <p style={{ color: "var(--tx-2)", fontWeight: 500, fontSize: "10.5px", marginBottom: "2px" }}>
                {persons.slice(0, 3).join(" · ")}{persons.length > 3 && ` · +${persons.length - 3}`}
              </p>
            )}
            <p style={{ fontWeight: 700, fontFamily: "monospace" }}>
              {fmtAmount(bubble.totalAmount, currency)}
              {bubble.count > 1 && <span style={{ fontWeight: 400, color: "var(--tx-3)", fontSize: "10px", marginLeft: "4px" }}>(total)</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export function StockChart({ isin, companyName, trades = [], locale = "en" }: StockChartProps) {
  const isFr = locale === "fr";
  const numLocale = isFr ? "fr-FR" : "en-GB";
  const formatXAxis = makeFormatXAxis(numLocale);
  const fmtAmount = makeFmtAmount(numLocale);
  const fmtDate = makeFmtDate(numLocale);
  const RANGE_OPTIONS = getRangeOptions(isFr);

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

  // Aggregate trades into bubbles: one per (date, buy|sell).
  //   → Un achat et une vente le même jour = 2 bulles distinctes.
  //   → 4 achats le même jour = 1 bulle avec count=4 et totalAmount = somme.
  // Ainsi toutes les transactions sont visibles (plus de perte d'info à cause
  // d'une dedup par date seule qui gardait arbitrairement la plus grosse).
  const tradeBubbles = useMemo((): TradeBubble[] => {
    if (!data?.points.length) return [];
    const rangeStart = data.points[0].date;
    const rangeEnd = data.points[data.points.length - 1].date;

    const byKey = new Map<string, TradeBubble>();
    for (const t of trades) {
      if (t.type !== "buy" && t.type !== "sell") continue;
      const norm = normalizeDate(t.date.length === 10 ? t.date + "T12:00:00Z" : t.date);
      if (norm < rangeStart || norm > rangeEnd) continue;

      const key = `${norm}::${t.type}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.totalAmount += t.amount ?? 0;
        existing.count += 1;
        existing.trades.push(t);
      } else {
        byKey.set(key, {
          date: norm,
          type: t.type,
          totalAmount: t.amount ?? 0,
          count: 1,
          trades: [t],
        });
      }
    }
    return Array.from(byKey.values());
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

  // Tooltip map · keyed by date, returns ALL bubbles (buy + sell) for that date.
  const tradeMap = useMemo(() => {
    const m = new Map<string, TradeBubble[]>();
    tradeBubbles.forEach((b) => {
      const arr = m.get(b.date) ?? [];
      arr.push(b);
      m.set(b.date, arr);
    });
    return m;
  }, [tradeBubbles]);

  // Stats
  const buyTrades = allTrades.filter((t) => t.type === "buy");
  const sellTrades = allTrades.filter((t) => t.type === "sell");
  const totalBuy = buyTrades.reduce((s, t) => s + (t.amount ?? 0), 0);
  const totalSell = sellTrades.reduce((s, t) => s + (t.amount ?? 0), 0);

  // Dot sizes · based on aggregated bubble totals (not individual trades)
  const amounts = tradeBubbles.map((b) => b.totalAmount).filter((a) => a > 0);
  const minAmt = amounts.length ? Math.min(...amounts) : 1;
  const maxAmt = amounts.length ? Math.max(...amounts) : 1;

  if (loading) {
    return (
      <div className="card p-5" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div className="skeleton" style={{ height: 14, width: 120 }} />
        <div className="skeleton" style={{ height: 220, borderRadius: 12 }} />
      </div>
    );
  }

  if (error || !data) return null;

  const isPositive = data.change >= 0;
  // DA v3: signal-pos / signal-neg · direct hex for Recharts (it can't parse CSS vars)
  const lineColor = isPositive ? "#009E62" : "#C82038";
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
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: "1.5rem", fontWeight: 700, fontFamily: "'Banana Grotesk', monospace", color: "var(--tx-1)", letterSpacing: "-0.04em" }}>
                  {new Intl.NumberFormat(numLocale, { style: "currency", currency, minimumFractionDigits: 2 }).format(data.latest)}
                </span>
                <span style={{
                  fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: "20px",
                  border: `1px solid ${isPositive ? "var(--signal-pos-bd)" : "var(--signal-neg-bd)"}`,
                  background: isPositive ? "var(--signal-pos-bg)" : "var(--signal-neg-bg)",
                  color: isPositive ? "var(--signal-pos)" : "var(--signal-neg)",
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
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-pos-soft border bd-pos tx-pos">
                    ▲ {fmtAmount(totalBuy, currency)}
                  </span>
                )}
                {totalSell > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neg-soft border bd-neg tx-neg">
                    ▼ {fmtAmount(totalSell, currency)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Range selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "3px", background: "var(--bg-raised)", border: "1px solid var(--border)", borderRadius: "10px", flexWrap: "wrap" }}>
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
                  new Intl.NumberFormat(numLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v) + " €"
                }
              />
              <Tooltip
                content={<CustomChartTooltip tradeMap={tradeMap} currency={currency} isFr={isFr} fmtAmount={fmtAmount} formatXAxis={formatXAxis} numLocale={numLocale} />}
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
              {/* Trade bubbles · 1 per (date, buy|sell), sized by total amount */}
              {tradeBubbles.map((bubble) => {
                const price = priceMap.get(bubble.date);
                if (!price) return null;
                const r = scaleDotRadius(bubble.totalAmount || 1, minAmt, maxAmt);
                const isBuy = bubble.type === "buy";
                // DA v3: signal-pos/signal-neg
                const fillColor = isBuy ? "#009E62" : "#C82038";
                const strokeColor = isBuy ? "#00704A" : "#8E162A";
                // Offset buy bubbles slightly above and sell below so both are
                // visible when they exist on the same day (never overlap).
                const yOffset = isBuy ? price * 1.005 : price * 0.995;
                return (
                  <ReferenceDot
                    key={`${bubble.date}-${bubble.type}`}
                    x={bubble.date}
                    y={yOffset}
                    r={r}
                    fill={fillColor}
                    fillOpacity={0.92}
                    stroke={strokeColor}
                    strokeWidth={1.5}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        {tradeBubbles.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginTop: "8px", paddingTop: "10px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: "var(--tx-4)" }}>
              {isFr ? "Transactions insiders sur la période" : "Insider transactions"}{" "}
              <strong style={{ color: "var(--tx-2)" }}>({allTrades.length})</strong> :
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--signal-pos)" }} />
              <span style={{ fontSize: "11px", color: "var(--tx-3)" }}>{isFr ? "Achat" : "Buy"} ({buyTrades.length})</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--signal-neg)" }} />
              <span style={{ fontSize: "11px", color: "var(--tx-3)" }}>{isFr ? "Vente" : "Sale"} ({sellTrades.length})</span>
            </div>
            <span style={{ fontSize: "11px", color: "var(--tx-4)" }}>
              {isFr ? "· taille = montant cumulé · 1 bulle / jour / côté" : "· size = cumulative amount · 1 bubble / day / side"}
            </span>
          </div>
        )}
      </div>

      {/* Trades detail section */}
      {allTrades.length > 0 && (
        <div className="card" style={{ overflow: "hidden", overflowX: "auto" }}>
          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
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
                  {f === "all"
                    ? `${isFr ? "Tous" : "All"} (${allTrades.length})`
                    : f === "buy"
                    ? `▲ ${isFr ? "Achats" : "Buys"} (${buyTrades.length})`
                    : `▼ ${isFr ? "Ventes" : "Sales"} (${sellTrades.length})`}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "11px", color: "var(--tx-4)", marginRight: "4px" }}>{isFr ? "Trier :" : "Sort:"}</span>
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
                  {s === "date" ? "Date" : (isFr ? "Montant" : "Amount")}
                </button>
              ))}
            </div>
          </div>

          {/* Trades list */}
          <div style={{ maxHeight: "288px", overflowY: "auto", minWidth: "360px" }}>
            {filteredTrades.slice(0, 100).map((trade, i) => {
              const isBuy = trade.type !== "sell";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
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
                    {trade.person ?? "·"}
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
                {isFr ? "Aucune transaction sur la période" : "No transactions in this period"}
              </div>
            )}
          </div>

          {/* Summary footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", padding: "10px 16px", borderTop: "1px solid var(--border)", background: "var(--bg-raised)" }}>
            <span style={{ fontSize: "11px", color: "var(--tx-4)" }}>
              {filteredTrades.length} transaction{filteredTrades.length > 1 ? "s" : ""}
              {isFr ? " sur la période" : " in this period"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {totalBuy > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10px", color: "var(--tx-4)" }}>{isFr ? "Achats" : "Buys"}</span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--c-emerald)", fontFamily: "monospace" }}>{fmtAmount(totalBuy, currency)}</span>
                </div>
              )}
              {totalSell > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "10px", color: "var(--tx-4)" }}>{isFr ? "Ventes" : "Sales"}</span>
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
