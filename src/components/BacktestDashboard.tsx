"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  Cell,
  ReferenceLine,
} from "recharts";

interface GroupStats {
  count: number;
  avgReturn30d: number | null;
  avgReturn60d: number | null;
  avgReturn90d: number | null;
  avgReturn180d: number | null;
  winRate90d: number | null;
  medianReturn90d: number | null;
  stddevReturn90d: number | null;
  best90d: number | null;
  worst90d: number | null;
}

interface StatsData {
  total: number;
  overall: GroupStats;
  byScoreBucket: Record<string, GroupStats>;
  byFunction: Record<string, GroupStats>;
  byYear: Record<string, GroupStats>;
  byCluster: Record<string, GroupStats>;
  byMcapBucket: Record<string, GroupStats>;
  scatter: Array<{ score: number; return90d: number; company: string }>;
  topTrades: Array<{
    company: { name: string; slug: string };
    insiderName: string | null;
    insiderFunction: string | null;
    totalAmount: number | null;
    signalScore: number | null;
    transactionDate: string | null;
    return30d: number | null;
    return60d: number | null;
    return90d: number | null;
    return180d: number | null;
  }>;
  insights: string[];
}

function fmt(n: number | null | undefined, decimals = 1, suffix = "%"): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}${suffix}`;
}

function fmtAmount(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M€`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k€`;
  return `${n.toFixed(0)}€`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

const SCORE_ORDER = ["0-30", "30-50", "50-70", "70-100"];
const MCAP_ORDER = ["<0.01%", "0.01-0.1%", "0.1-1%", ">1%"];

function returnColor(val: number | null): string {
  if (val == null) return "#6366f1";
  return val >= 0 ? "#10b981" : "#f43f5e";
}

function LoadingCard() {
  return (
    <div className="glass-card rounded-2xl p-6 animate-pulse">
      <div className="h-4 bg-white/10 rounded mb-4 w-1/3" />
      <div className="h-48 bg-white/5 rounded" />
    </div>
  );
}

export function BacktestDashboard() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/backtest/stats")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div>
        <div className="mb-10">
          <div className="h-8 bg-white/10 rounded w-64 animate-pulse mb-2" />
          <div className="h-4 bg-white/5 rounded w-96 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[1, 2, 3].map((i) => <div key={i} className="glass-card-static rounded-2xl p-5 animate-pulse h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => <LoadingCard key={i} />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-2xl p-12 text-center text-rose-400">
        Erreur lors du chargement : {error}
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div>
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Backtesting</h1>
          <p className="text-slate-400">Analyse de performance des achats d'initiés</p>
        </div>
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-slate-400 mb-4">Aucun résultat de backtesting disponible.</p>
          <p className="text-slate-500 text-sm">Les données seront disponibles après le calcul des performances historiques.</p>
        </div>
      </div>
    );
  }

  const { overall, byScoreBucket, byFunction, byYear, byCluster, byMcapBucket, scatter, topTrades, insights } = data;

  // Chart data: score buckets
  const scoreChartData = SCORE_ORDER.map((label) => ({
    label,
    avgReturn90d: byScoreBucket[label]?.avgReturn90d ?? null,
    winRate: byScoreBucket[label]?.winRate90d ?? null,
    count: byScoreBucket[label]?.count ?? 0,
  })).filter((d) => d.count > 0);

  // Chart data: by function
  const fnChartData = Object.entries(byFunction)
    .map(([label, stats]) => ({ label, avgReturn90d: stats.avgReturn90d, count: stats.count }))
    .filter((d) => d.count > 0)
    .sort((a, b) => (b.avgReturn90d ?? 0) - (a.avgReturn90d ?? 0));

  // Chart data: by year
  const yearChartData = Object.entries(byYear)
    .filter(([year]) => year !== "Unknown" && parseInt(year) >= 2021)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([year, stats]) => ({
      year,
      avgReturn90d: stats.avgReturn90d,
      count: stats.count,
      winRate: stats.winRate90d,
    }));

  return (
    <div>
      {/* Header */}
      <div className="mb-10 animate-fade-in">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-card-static text-violet-400 text-xs font-semibold mb-5 border-violet-500/15">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          Analyse de performance · {data.total} trades backtestés
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-3">
          Backtesting des
          <span className="text-gradient-indigo"> signaux d'initiés</span>
        </h1>
        <p className="text-slate-400 max-w-2xl">
          Performance historique des achats de dirigeants à T+30, T+60, T+90 et T+180 jours.
          Données issues de Yahoo Finance, calculées sur les déclarations AMF 2021-2026.
        </p>
      </div>

      {/* Header stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
        <StatTile label="Trades backtestés" value={data.total.toLocaleString("fr-FR")} icon="📊" accent="indigo" />
        <StatTile
          label="Rendement moyen T+90"
          value={fmt(overall.avgReturn90d)}
          icon="📈"
          accent={overall.avgReturn90d != null && overall.avgReturn90d >= 0 ? "emerald" : "rose"}
        />
        <StatTile
          label="Taux de réussite T+90"
          value={overall.winRate90d != null ? `${overall.winRate90d.toFixed(0)}%` : "—"}
          icon="🎯"
          accent="violet"
        />
        <StatTile
          label="Rendement médian T+90"
          value={fmt(overall.medianReturn90d)}
          icon="⚖️"
          accent="slate"
        />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        {/* Chart 1: avg return by score bucket */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-1">Rendement moyen T+90 par score</h2>
          <p className="text-xs text-slate-500 mb-5">Rendement % à 90 jours selon le niveau de signal</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={scoreChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ background: "#0a0a1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#f1f5f9" }}
                formatter={(value) => {
                  const v = Number(value);
                  return [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "Rendement T+90"];
                }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <Bar dataKey="avgReturn90d" radius={[6, 6, 0, 0]}>
                {scoreChartData.map((entry, i) => (
                  <Cell key={i} fill={returnColor(entry.avgReturn90d)} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2: win rate by score bucket */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-1">Taux de réussite T+90 par score</h2>
          <p className="text-xs text-slate-500 mb-5">% de trades avec rendement positif à 90 jours</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={scoreChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: "#0a0a1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#f1f5f9" }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, "Taux de réussite"]}
              />
              <ReferenceLine y={50} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" label={{ value: "50%", fill: "#94a3b8", fontSize: 10 }} />
              <Bar dataKey="winRate" radius={[6, 6, 0, 0]} fill="#6366f1" fillOpacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 3: by insider function */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-1">Rendement T+90 par fonction</h2>
          <p className="text-xs text-slate-500 mb-5">PDG/DG vs CFO vs Board vs Autre</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={fnChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ background: "#0a0a1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#f1f5f9" }}
                formatter={(value) => {
                  const v = Number(value);
                  return [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "Rendement T+90"];
                }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <Bar dataKey="avgReturn90d" radius={[6, 6, 0, 0]}>
                {fnChartData.map((entry, i) => (
                  <Cell key={i} fill={returnColor(entry.avgReturn90d)} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 4: by year */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-1">Rendement moyen T+90 par année</h2>
          <p className="text-xs text-slate-500 mb-5">Évolution de la performance historique (2021–2026)</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={yearChartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ background: "#0a0a1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#f1f5f9" }}
                formatter={(value) => {
                  const v = Number(value);
                  return [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "Rendement T+90"];
                }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
              <Line
                type="monotone"
                dataKey="avgReturn90d"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ fill: "#6366f1", strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Scatter plot: score vs return90d */}
      {scatter.length > 0 && (
        <div className="glass-card rounded-2xl p-6 mb-10">
          <h2 className="text-base font-semibold text-white mb-1">Score de signal vs rendement T+90</h2>
          <p className="text-xs text-slate-500 mb-5">Chaque point représente un trade · Vert = gain, rouge = perte</p>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                type="number"
                dataKey="score"
                name="Score"
                domain={[0, 100]}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                label={{ value: "Score signal", position: "insideBottom", offset: -10, fill: "#64748b", fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="return90d"
                name="Rendement T+90"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{ background: "#0a0a1f", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#f1f5f9" }}
                formatter={(value, name) => {
                  const v = Number(value);
                  return name === "return90d"
                    ? [`${v >= 0 ? "+" : ""}${v.toFixed(2)}%`, "Rendement T+90"]
                    : [v, "Score"];
                }}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
              <Scatter data={scatter} fill="#6366f1">
                {scatter.map((entry, i) => (
                  <Cell key={i} fill={returnColor(entry.return90d)} fillOpacity={0.6} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By cluster + mcap side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        {/* Cluster */}
        {Object.keys(byCluster).length > 0 && (
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-base font-semibold text-white mb-5">Cluster vs isolé</h2>
            <div className="space-y-4">
              {Object.entries(byCluster).map(([label, stats]) => (
                <div key={label} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-200">{label}</div>
                    <div className="text-xs text-slate-500">{stats.count} trades</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-bold tabular-nums ${stats.avgReturn90d != null && stats.avgReturn90d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmt(stats.avgReturn90d)} T+90
                    </div>
                    <div className="text-xs text-slate-500">
                      {stats.winRate90d != null ? `${stats.winRate90d.toFixed(0)}% succès` : "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mcap buckets */}
        {Object.keys(byMcapBucket).length > 0 && (
          <div className="glass-card rounded-2xl p-6">
            <h2 className="text-base font-semibold text-white mb-5">Par taille relative (% mcap)</h2>
            <div className="space-y-4">
              {MCAP_ORDER.filter((l) => byMcapBucket[l]).map((label) => {
                const stats = byMcapBucket[label];
                return (
                  <div key={label} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-slate-200">{label}</div>
                      <div className="text-xs text-slate-500">{stats.count} trades</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold tabular-nums ${stats.avgReturn90d != null && stats.avgReturn90d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {fmt(stats.avgReturn90d)} T+90
                      </div>
                      <div className="text-xs text-slate-500">
                        {stats.winRate90d != null ? `${stats.winRate90d.toFixed(0)}% succès` : "—"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Key Insights */}
      {insights.length > 0 && (
        <div className="glass-card-static rounded-2xl p-6 mb-10 border border-violet-500/15">
          <div className="flex items-center gap-2 mb-5">
            <span className="text-lg">💡</span>
            <h2 className="text-base font-semibold text-white">Insights clés</h2>
          </div>
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-slate-300">
                <span className="text-violet-400 mt-0.5 flex-shrink-0">→</span>
                {insight}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top 20 trades table */}
      {topTrades.length > 0 && (
        <div className="glass-card-static rounded-2xl p-6 mb-10">
          <h2 className="text-base font-semibold text-white mb-5">Top 20 meilleures performances T+90</h2>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-white/8">
                  <th className="pb-3 pl-2 font-medium">Société</th>
                  <th className="pb-3 font-medium">Dirigeant</th>
                  <th className="pb-3 font-medium">Montant</th>
                  <th className="pb-3 font-medium text-center">Score</th>
                  <th className="pb-3 font-medium text-right">T+30</th>
                  <th className="pb-3 font-medium text-right">T+60</th>
                  <th className="pb-3 font-medium text-right text-emerald-400">T+90</th>
                  <th className="pb-3 pr-2 font-medium text-right">T+180</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {topTrades.map((trade, i) => (
                  <tr key={i} className="hover:bg-white/3 transition-colors">
                    <td className="py-2.5 pl-2">
                      <Link href={`/company/${trade.company.slug}`} className="text-slate-200 hover:text-white font-medium transition-colors">
                        {trade.company.name}
                      </Link>
                      {trade.transactionDate && (
                        <div className="text-[11px] text-slate-600 mt-0.5">{fmtDate(trade.transactionDate)}</div>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-400 text-xs max-w-[140px]">
                      <div className="truncate">{trade.insiderName ?? "—"}</div>
                      <div className="text-slate-600 truncate">{trade.insiderFunction ?? ""}</div>
                    </td>
                    <td className="py-2.5 text-slate-300 tabular-nums">{fmtAmount(trade.totalAmount)}</td>
                    <td className="py-2.5 text-center">
                      {trade.signalScore != null ? (
                        <ScorePill score={trade.signalScore} />
                      ) : "—"}
                    </td>
                    <td className={`py-2.5 text-right tabular-nums text-xs ${trade.return30d != null && trade.return30d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmt(trade.return30d)}
                    </td>
                    <td className={`py-2.5 text-right tabular-nums text-xs ${trade.return60d != null && trade.return60d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmt(trade.return60d)}
                    </td>
                    <td className={`py-2.5 text-right tabular-nums font-semibold ${trade.return90d != null && trade.return90d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmt(trade.return90d)}
                    </td>
                    <td className={`py-2.5 pr-2 text-right tabular-nums text-xs ${trade.return180d != null && trade.return180d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {fmt(trade.return180d)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Score comparison table */}
      {Object.keys(byScoreBucket).length > 0 && (
        <div className="glass-card-static rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-5">Détail par score de signal</h2>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-white/8">
                  <th className="pb-3 pl-2 font-medium">Score</th>
                  <th className="pb-3 font-medium text-right">Trades</th>
                  <th className="pb-3 font-medium text-right">T+30</th>
                  <th className="pb-3 font-medium text-right">T+60</th>
                  <th className="pb-3 font-medium text-right">T+90</th>
                  <th className="pb-3 font-medium text-right">T+180</th>
                  <th className="pb-3 pr-2 font-medium text-right">Succès</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {SCORE_ORDER.filter((l) => byScoreBucket[l]).map((label) => {
                  const s = byScoreBucket[label];
                  return (
                    <tr key={label} className="hover:bg-white/3 transition-colors">
                      <td className="py-2.5 pl-2">
                        <span className="font-mono text-sm text-slate-200">{label}</span>
                      </td>
                      <td className="py-2.5 text-right text-slate-400">{s.count.toLocaleString("fr-FR")}</td>
                      <td className={`py-2.5 text-right tabular-nums text-xs ${s.avgReturn30d != null && s.avgReturn30d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmt(s.avgReturn30d)}</td>
                      <td className={`py-2.5 text-right tabular-nums text-xs ${s.avgReturn60d != null && s.avgReturn60d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmt(s.avgReturn60d)}</td>
                      <td className={`py-2.5 text-right tabular-nums font-semibold ${s.avgReturn90d != null && s.avgReturn90d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmt(s.avgReturn90d)}</td>
                      <td className={`py-2.5 text-right tabular-nums text-xs ${s.avgReturn180d != null && s.avgReturn180d >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmt(s.avgReturn180d)}</td>
                      <td className="py-2.5 pr-2 text-right text-slate-400 text-xs">{s.winRate90d != null ? `${s.winRate90d.toFixed(0)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  if (score >= 70) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/15 border border-emerald-400/25 text-emerald-300">
      ⚡ {Math.round(score)}
    </span>
  );
  if (score >= 45) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400/15 border border-amber-400/25 text-amber-300">
      ◆ {Math.round(score)}
    </span>
  );
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 border border-white/10 text-slate-400">
      {Math.round(score)}
    </span>
  );
}

function StatTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: string;
  accent: "indigo" | "violet" | "emerald" | "rose" | "slate";
}) {
  const accentMap = {
    indigo: "from-indigo-500/10 to-indigo-500/5 border-indigo-500/15",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/15",
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/15",
    rose: "from-rose-500/10 to-rose-500/5 border-rose-500/15",
    slate: "from-slate-500/10 to-slate-500/5 border-slate-500/15",
  };
  return (
    <div className={`glass-card-static rounded-2xl p-4 bg-gradient-to-br ${accentMap[accent]} flex flex-col gap-2`}>
      <span className="text-base">{icon}</span>
      <div className="text-xl font-bold text-white tracking-tight">{value}</div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
    </div>
  );
}
