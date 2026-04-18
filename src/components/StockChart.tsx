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
} from "recharts";
import { useEffect, useState } from "react";

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
  points: StockPoint[];
}

type RangeOption = "1mo" | "3mo" | "6mo" | "1y";

const RANGE_OPTIONS: { label: string; value: RangeOption }[] = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1A", value: "1y" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0]?.value;
    return (
      <div className="glass-tooltip px-3 py-2 rounded-lg border border-white/10 bg-black/60 backdrop-blur-xl text-xs">
        <p className="text-gray-400 mb-1">{label}</p>
        <p className="text-white font-semibold">
          {new Intl.NumberFormat("fr-FR", {
            style: "currency",
            currency: "EUR",
            minimumFractionDigits: 2,
          }).format(value)}
        </p>
      </div>
    );
  }
  return null;
};

function formatXAxis(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
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
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [isin, companyName, range]);

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6 h-72 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
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
      <div className="glass-card rounded-2xl p-6 h-40 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Données de cours non disponibles</p>
      </div>
    );
  }

  const isPositive = data.change >= 0;
  const color = isPositive ? "#10b981" : "#f43f5e";
  const gradientId = `stockGradient-${data.symbol.replace(/[^a-zA-Z0-9]/g, "")}`;

  // Filter trades within current data range
  const dateSet = new Set(data.points.map((p) => p.date));
  const visibleTrades = trades.filter((t) => dateSet.has(t.date) || t.date > data.points[0]?.date);

  const minClose = Math.min(...data.points.map((p) => p.close));
  const maxClose = Math.max(...data.points.map((p) => p.close));
  const padding = (maxClose - minClose) * 0.08;

  return (
    <div className="glass-card rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white">
                {new Intl.NumberFormat("fr-FR", {
                  style: "currency",
                  currency: "EUR",
                  minimumFractionDigits: 2,
                }).format(data.latest)}
              </span>
              <span
                className={`text-sm font-semibold px-2 py-0.5 rounded-full border ${
                  isPositive
                    ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                    : "text-rose-400 bg-rose-400/10 border-rose-400/20"
                }`}
              >
                {isPositive ? "+" : ""}
                {data.change}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{data.symbol} · Euronext Paris</p>
          </div>
        </div>

        {/* Range selector */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRange(opt.value)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                range === opt.value
                  ? "bg-white/15 text-white shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxis}
              tick={{ fontSize: 10, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              domain={[minClose - padding, maxClose + padding]}
              tick={{ fontSize: 10, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              width={55}
              tickFormatter={(v) =>
                new Intl.NumberFormat("fr-FR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                }).format(v) + " €"
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="close"
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
            />
            {/* Trade reference lines */}
            {visibleTrades.map((trade, i) => (
              <ReferenceLine
                key={i}
                x={trade.date}
                stroke={trade.type === "sell" ? "#f43f5e" : "#10b981"}
                strokeWidth={1.5}
                strokeDasharray="3 3"
                opacity={0.7}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Trade legend */}
      {visibleTrades.length > 0 && (
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
          <span className="text-xs text-gray-500">Transactions insiders :</span>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-emerald-400 rounded" />
            <span className="text-xs text-gray-400">Achat</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-rose-400 rounded" />
            <span className="text-xs text-gray-400">Vente</span>
          </div>
        </div>
      )}
    </div>
  );
}
