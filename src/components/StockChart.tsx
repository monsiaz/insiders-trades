"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from "recharts";
import { useEffect, useState } from "react";

interface StockPoint {
  date: string;
  close: number;
}

interface TradeEvent {
  date: string;   // UTC ISO date string: "2026-04-14"
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

const RANGE_OPTIONS: { label: string; value: RangeOption }[] = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1A", value: "1y" },
  { label: "2A", value: "2y" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label, trades, currency }: any) => {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  const trade = trades?.find((t: TradeEvent) => t.date === label);
  return (
    <div className="px-3 py-2.5 rounded-xl border border-white/10 bg-black/80 backdrop-blur-xl text-xs shadow-2xl min-w-[140px]">
      <p className="text-slate-400 mb-1.5">{label}</p>
      <p className="text-white font-bold text-sm">
        {new Intl.NumberFormat("fr-FR", {
          style: "currency",
          currency: currency || "EUR",
          minimumFractionDigits: 2,
        }).format(value)}
      </p>
      {trade && (
        <div className={`mt-1.5 flex items-center gap-1 font-semibold ${trade.type === "sell" ? "text-rose-400" : "text-emerald-400"}`}>
          <span>{trade.type === "sell" ? "▼" : "▲"}</span>
          <span>{trade.person}</span>
          {trade.amount && (
            <span className="text-slate-400 font-normal">
              · {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: trade.amount >= 1e6 ? "compact" : "standard" }).format(trade.amount)}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

function formatXAxis(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Normalize trade dates: account for UTC offset shift from Paris time */
function normalizeTradeDate(isoDate: string): string {
  // isoDate like "2026-04-14T22:00:00.000Z" → we want "2026-04-15" (Paris = UTC+2 in summer)
  // Just take the date part and add 1 day if time is >= 22:00 UTC (winter close) or >= 21:00 (summer close)
  const d = new Date(isoDate);
  const utcHour = d.getUTCHours();
  if (utcHour >= 20) {
    // Evening UTC = next calendar day in Paris
    const next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  }
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function StockChart({ isin, companyName, trades = [] }: StockChartProps) {
  const [data, setData] = useState<StockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<RangeOption>("6mo");

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

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 h-72 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
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
      <div className="glass-card rounded-2xl p-5 h-28 flex items-center justify-center">
        <p className="text-slate-600 text-sm">Cours non disponible pour cette société</p>
      </div>
    );
  }

  const isPositive = data.change >= 0;
  const lineColor = isPositive ? "#10b981" : "#f43f5e";
  const gradientId = `sg-${data.symbol.replace(/[^a-zA-Z0-9]/g, "")}`;
  const currency = data.currency || "EUR";

  // Normalize trade dates to match chart dates (fix UTC/Paris timezone offset)
  const normalizedTrades: TradeEvent[] = trades.map((t) => ({
    ...t,
    date: normalizeTradeDate(t.date + (t.date.length === 10 ? "T12:00:00.000Z" : "")),
  }));

  // Keep only trades within the chart date range
  const rangeStart = data.points[0]?.date ?? "";
  const rangeEnd = data.points[data.points.length - 1]?.date ?? "";
  const visibleTrades = normalizedTrades.filter(
    (t) => t.date >= rangeStart && t.date <= rangeEnd
  );

  // Merge trades with same date (show largest)
  const tradeMap = new Map<string, TradeEvent>();
  for (const t of visibleTrades) {
    const existing = tradeMap.get(t.date);
    if (!existing || (t.amount ?? 0) > (existing.amount ?? 0)) {
      tradeMap.set(t.date, t);
    }
  }
  const dedupedTrades = Array.from(tradeMap.values());

  const prices = data.points.map((p) => p.close);
  const minClose = Math.min(...prices);
  const maxClose = Math.max(...prices);
  const padding = Math.max((maxClose - minClose) * 0.12, maxClose * 0.01);

  const fmtPrice = (v: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: 2 }).format(v);

  return (
    <div className="glass-card rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl font-bold text-white tabular-nums">
              {fmtPrice(data.latest)}
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border tabular-nums ${
              isPositive
                ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                : "text-rose-400 bg-rose-400/10 border-rose-400/20"
            }`}>
              {isPositive ? "+" : ""}{data.change.toFixed(2)}%
            </span>
            {visibleTrades.length > 0 && (
              <span className="text-xs text-slate-600 bg-white/5 border border-white/5 px-2 py-0.5 rounded-full">
                {visibleTrades.length} trade{visibleTrades.length > 1 ? "s" : ""} insider
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 mt-0.5">{data.symbol} · Euronext Paris</p>
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-0.5 p-1 rounded-xl bg-white/4 border border-white/8">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                range === opt.value
                  ? "bg-white/12 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
                <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.03)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxis}
              tick={{ fontSize: 10, fill: "#475569" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              domain={[minClose - padding, maxClose + padding]}
              tick={{ fontSize: 10, fill: "#475569" }}
              axisLine={false}
              tickLine={false}
              width={58}
              tickFormatter={(v) =>
                new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v) + " €"
              }
            />
            <Tooltip
              content={<CustomTooltip trades={dedupedTrades} currency={currency} />}
              cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="close"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: lineColor, strokeWidth: 2, stroke: "rgba(0,0,0,0.3)" }}
            />

            {/* Trade marker lines */}
            {dedupedTrades.map((trade) => (
              <ReferenceLine
                key={trade.date}
                x={trade.date}
                stroke={trade.type === "sell" ? "#f43f5e" : "#10b981"}
                strokeWidth={2}
                strokeDasharray="0"
                opacity={0.6}
                ifOverflow="extendDomain"
              >
                <Label
                  value={trade.type === "sell" ? "▼" : "▲"}
                  position="insideTopLeft"
                  fill={trade.type === "sell" ? "#f43f5e" : "#10b981"}
                  fontSize={9}
                  offset={2}
                />
              </ReferenceLine>
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Trades summary below chart */}
      {dedupedTrades.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex flex-wrap gap-2">
            {dedupedTrades.map((trade) => (
              <div
                key={trade.date}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  trade.type === "sell"
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                }`}
              >
                <span>{trade.type === "sell" ? "▼" : "▲"}</span>
                <span>{trade.date}</span>
                {trade.person && <span className="text-slate-400 font-normal">· {trade.person.split(" ").slice(-1)[0]}</span>}
                {trade.amount && (
                  <span className="font-bold">
                    {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: trade.amount >= 1e6 ? "compact" : "standard" }).format(trade.amount)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
