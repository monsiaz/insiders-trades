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
  if (n == null) return "·";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}%`;
}

export function CompanyBacktestWidget({ companyId, locale = "en" }: { companyId: string; locale?: string }) {
  const isFr = locale === "fr";
  const numLocale = isFr ? "fr-FR" : "en-GB";
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
      <div className="card p-5" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div className="skeleton" style={{ height: 16, width: 180 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div className="skeleton" style={{ height: 52 }} />
          <div className="skeleton" style={{ height: 52 }} />
        </div>
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    );
  }

  if (!data || data.count === 0) return null;

  const chartData = data.points
    .filter((p) => p.return90d != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({
      date: new Date(p.date).toLocaleDateString(numLocale, { month: "short", year: "2-digit" }),
      return90d: p.return90d,
    }));

  const yearsCount = new Set(data.points.map((p) => p.date.slice(0, 4))).size;

  return (
    <div className="card p-5">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--tx-1)", margin: 0 }}>
            {isFr ? "Historique de performance" : "Performance history"}
          </h3>
          <p style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "3px" }}>
            {isFr
              ? `${data.count} achat${data.count > 1 ? "s" : ""} tracé${data.count > 1 ? "s" : ""} · ${yearsCount} ans de données`
              : `${data.count} purchase${data.count > 1 ? "s" : ""} tracked · ${yearsCount} yr${yearsCount > 1 ? "s" : ""} of data`}
          </p>
        </div>
        <Link href="/backtest" style={{ fontSize: "0.75rem", color: "var(--c-indigo-2)", textDecoration: "none" }}>
          {isFr ? "Backtesting →" : "Backtesting →"}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <div style={{
            fontFamily: "'Banana Grotesk', monospace",
            fontSize: "1.2rem", fontWeight: 700, letterSpacing: "-0.03em",
            color: data.avg90d != null && data.avg90d >= 0 ? "var(--c-emerald)" : "var(--c-crimson)",
          }}>
            {fmt(data.avg90d)}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "2px" }}>
            {isFr ? "Rendement moyen T+90" : "Avg. return T+90"}
          </div>
        </div>
        <div>
          <div style={{
            fontFamily: "'Banana Grotesk', monospace",
            fontSize: "1.2rem", fontWeight: 700, letterSpacing: "-0.03em",
            color: "var(--c-indigo-2)",
          }}>
            {data.winRate90d != null ? `${data.winRate90d.toFixed(0)}%` : "·"}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "2px" }}>
            {isFr ? "Taux de réussite" : "Win rate"}
          </div>
        </div>
      </div>

      {chartData.length >= 3 && (
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fill: "var(--tx-4)", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "var(--tx-4)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
            <Tooltip
              contentStyle={{ background: "var(--bg-surface)", border: "1px solid var(--border-med)", borderRadius: 10, color: "var(--tx-1)", fontSize: 11 }}
              formatter={(v) => { const n = Number(v); return [`${n >= 0 ? "+" : ""}${n.toFixed(1)}%`, "T+90"]; }}
            />
            <ReferenceLine y={0} stroke="var(--border-strong)" />
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
