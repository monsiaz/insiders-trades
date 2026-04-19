"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface BacktestPoint {
  date: string;
  return90d: number;
  company: string;
  insiderName: string | null;
}

interface CompanyBacktestData {
  count: number;
  avg90d: number | null;
  winRate90d: number | null;
  points: BacktestPoint[];
}

function fmt(n: number | null, decimals = 1): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

export function CompanyBacktestWidget({ companyId }: { companyId: string }) {
  const [data, setData] = useState<CompanyBacktestData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/backtest/company?companyId=${companyId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [companyId]);

  if (loading) {
    return (
      <div className="glass-card-static rounded-2xl p-5 animate-pulse">
        <div className="h-4 bg-white/10 rounded w-48 mb-3" />
        <div className="h-16 bg-white/5 rounded" />
      </div>
    );
  }

  if (!data || data.count === 0) return null;

  const chartData = data.points
    .filter((p) => p.return90d != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      date: new Date(p.date).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }),
      return90d: p.return90d,
    }));

  return (
    <div className="glass-card-static rounded-2xl p-5 border border-indigo-500/10 bg-gradient-to-br from-indigo-500/5 to-transparent">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">📊 Historique de performance</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {data.count} achat{data.count > 1 ? "s" : ""} tracé{data.count > 1 ? "s" : ""} sur {new Set(data.points.map((p) => p.date.slice(0, 4))).size} an{new Set(data.points.map((p) => p.date.slice(0, 4))).size > 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/backtest" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
          Backtesting →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className={`text-lg font-bold tabular-nums ${data.avg90d != null && data.avg90d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {fmt(data.avg90d)}
          </div>
          <div className="text-xs text-slate-500">Rendement moyen T+90</div>
        </div>
        <div>
          <div className="text-lg font-bold text-violet-400 tabular-nums">
            {data.winRate90d != null ? `${data.winRate90d.toFixed(0)}%` : "—"}
          </div>
          <div className="text-xs text-slate-500">Taux de réussite</div>
        </div>
      </div>

      {chartData.length >= 3 && (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
            <Tooltip
              contentStyle={{ background: "#0a0a1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#f1f5f9", fontSize: 11 }}
              formatter={(v) => { const n = Number(v); return [`${n >= 0 ? "+" : ""}${n.toFixed(1)}%`, "T+90"]; }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
            <Line
              type="monotone"
              dataKey="return90d"
              stroke="#6366f1"
              strokeWidth={1.5}
              dot={{ fill: "#6366f1", r: 3, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
