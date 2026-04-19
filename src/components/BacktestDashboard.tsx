"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, ReferenceLine,
} from "recharts";
import {
  TrendingUp, Users, Calendar, Target, Building2, Layers,
  User, BarChart2, Star, Clock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface GroupStats {
  count: number;
  avgReturn30d: number | null;
  avgReturn60d: number | null;
  avgReturn90d: number | null;
  avgReturn160d: number | null;
  avgReturn365d: number | null;
  avgReturn730d: number | null;
  winRate90d: number | null;
  winRate365d: number | null;
  medianReturn90d: number | null;
  medianReturn365d: number | null;
  sharpe90d: number | null;
  sharpe365d: number | null;
  best90d: number | null;
  worst90d: number | null;
}

interface SignalCombo extends GroupStats {
  name: string;
  category: string;
}

interface SellStats {
  count: number;
  avgReturn90d: number | null;
  avgReturn365d: number | null;
  avgReturn730d: number | null;
  accuracy90d: number | null;
  accuracy365d: number | null;
  bySellRole: Record<string, { count: number; avgReturn90d: number | null; avgReturn365d: number | null; accuracy90d: number | null; accuracy365d: number | null } | null>;
  topSellsTrades: Array<{ company: { name: string; slug: string }; insiderName: string | null; role: string; totalAmount: number | null; transactionDate: string; return30d: number | null; return90d: number | null; return365d: number | null }>;
}

interface GenderStats extends GroupStats {
  count: number;
  label: string;
}

interface StatsData {
  total: number;
  totalBuys: number;
  totalSells: number;
  overall: GroupStats;
  overallBuys: GroupStats;
  sellStats: SellStats;
  byGender: { M: GenderStats; F: GenderStats; unknown: GenderStats };
  byScore: Record<string, GroupStats>;
  byRole: Record<string, GroupStats>;
  bySize: Record<string, GroupStats>;
  byMcapPct: Record<string, GroupStats>;
  byAmount: Record<string, GroupStats>;
  bySeason: Record<string, GroupStats>;
  byYear: Record<string, GroupStats>;
  byClusterDepth: Record<string, GroupStats>;
  byBehavior: Record<string, GroupStats>;
  signalCombos: SignalCombo[];
  scatter: Array<{ score: number; return90d: number; company: string; role: string }>;
  topTrades: Array<{
    company: { name: string; slug: string };
    insiderName: string | null;
    insiderFunction: string | null;
    role: string;
    totalAmount: number | null;
    signalScore: number | null;
    transactionDate: string | null;
    return30d: number | null;
    return60d: number | null;
    return90d: number | null;
    return160d: number | null;
    return365d: number | null;
    return730d: number | null;
    isDca: boolean;
    isFirstBuy: boolean;
    isCluster: boolean;
    consecutiveBuys: number;
    pctOfMarketCap: number | null;
  }>;
  insights: Array<{ icon: string; title: string; text: string; highlight: string }>;
}

// ── Formatters ─────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
}
function fmtAmt(n: number | null | undefined): string {
  if (!n) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M€`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k€`;
  return `${n.toFixed(0)}€`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}
function retColor(n: number | null | undefined): string {
  if (n == null) return "var(--fg-muted)";
  if (n >= 20) return "var(--color-mint)";
  if (n >= 5)  return "var(--color-mint-soft, #5ddcb0)";
  if (n >= 0)  return "var(--fg-secondary)";
  return "var(--color-red)";
}
function retClass(n: number | null | undefined): string {
  if (n == null) return "text-muted";
  if (n >= 5)  return "text-mint";
  if (n >= 0)  return "text-secondary";
  return "text-red";
}
function sharpeColor(s: number | null): string {
  if (s == null) return "#555";
  if (s >= 1.5) return "var(--color-mint)";
  if (s >= 0.8) return "#f59e0b";
  if (s >= 0)   return "#94a3b8";
  return "var(--color-red)";
}

// ── Mini components ────────────────────────────────────────────────────────

function ReturnPill({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted text-sm">—</span>;
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-xs font-mono font-semibold"
      style={{
        background: v >= 5 ? "rgba(56,215,156,0.12)" : v >= 0 ? "rgba(148,163,184,0.1)" : "rgba(239,68,68,0.1)",
        color: retColor(v),
      }}
    >
      {fmt(v)}
    </span>
  );
}

function SharpeBadge({ s }: { s: number | null }) {
  if (s == null) return <span className="text-muted text-xs">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-mono font-bold px-2 py-0.5 rounded"
      style={{ background: "rgba(255,255,255,0.05)", color: sharpeColor(s) }}
    >
      {s.toFixed(2)}
    </span>
  );
}

function WinBadge({ w }: { w: number | null }) {
  if (w == null) return <span className="text-muted text-xs">—</span>;
  const color = w >= 60 ? "var(--color-mint)" : w >= 45 ? "#f59e0b" : "var(--color-red)";
  return (
    <span className="text-xs font-semibold" style={{ color }}>
      {w.toFixed(0)}%
    </span>
  );
}

// ── Icon helpers ───────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  "Rôle":       <User size={13} strokeWidth={1.8} />,
  "Cluster":    <Users size={13} strokeWidth={1.8} />,
  "Conviction": <Target size={13} strokeWidth={1.8} />,
  "Taille":     <Building2 size={13} strokeWidth={1.8} />,
  "Score":      <BarChart2 size={13} strokeWidth={1.8} />,
  "Timing":     <Calendar size={13} strokeWidth={1.8} />,
};

const INSIGHT_ICON: Record<string, React.ReactNode> = {
  "TrendingUp": <TrendingUp size={18} strokeWidth={1.8} />,
  "Users":      <Users size={18} strokeWidth={1.8} />,
  "Calendar":   <Calendar size={18} strokeWidth={1.8} />,
  "Target":     <Target size={18} strokeWidth={1.8} />,
  "Building2":  <Building2 size={18} strokeWidth={1.8} />,
  "Layers":     <Layers size={18} strokeWidth={1.8} />,
  "Star":       <Star size={18} strokeWidth={1.8} />,
};

// ── Horizon toggle ─────────────────────────────────────────────────────────

type Horizon = "30d" | "60d" | "90d" | "160d" | "365d" | "730d";
const HORIZONS: { key: Horizon; label: string }[] = [
  { key: "30d",  label: "T+30" },
  { key: "60d",  label: "T+60" },
  { key: "90d",  label: "T+90" },
  { key: "160d", label: "T+160" },
  { key: "365d", label: "T+365" },
  { key: "730d", label: "T+2ans" },
];

function getReturn(g: GroupStats, h: Horizon): number | null {
  const map: Record<Horizon, number | null> = {
    "30d":  g.avgReturn30d,
    "60d":  g.avgReturn60d,
    "90d":  g.avgReturn90d,
    "160d": g.avgReturn160d,
    "365d": g.avgReturn365d,
    "730d": g.avgReturn730d,
  };
  return map[h];
}

// ── Bar chart for group comparisons ───────────────────────────────────────

function GroupChart({
  data,
  horizon,
  height = 200,
}: {
  data: Record<string, GroupStats>;
  horizon: Horizon;
  height?: number;
}) {
  const items = Object.entries(data)
    .filter(([k]) => k !== "Unknown")
    .map(([key, g]) => ({
      key: key.length > 14 ? key.slice(0, 13) + "…" : key,
      value: getReturn(g, horizon),
      count: g.count,
      winRate: g.winRate90d,
    }))
    .filter((d) => d.value != null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  if (!items.length) return <div className="text-muted text-sm py-4 text-center">Aucune donnée</div>;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={items} layout="vertical" margin={{ left: 0, right: 32, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: "var(--fg-muted)" }} />
        <YAxis type="category" dataKey="key" width={110} tick={{ fontSize: 11, fill: "var(--fg-secondary)" }} />
        <Tooltip
          formatter={(v) => {
            const n = typeof v === "number" ? v : 0;
            return [`${n >= 0 ? "+" : ""}${n.toFixed(1)}%`, "Retour moy."];
          }}
          labelStyle={{ color: "var(--fg-primary)", fontSize: 12 }}
          contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-soft)", borderRadius: 8 }}
        />
        <ReferenceLine x={0} stroke="rgba(255,255,255,0.15)" />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} minPointSize={2}>
          {items.map((entry) => (
            <Cell
              key={entry.key}
              fill={(entry.value ?? 0) >= 0 ? "var(--color-mint)" : "var(--color-red)"}
              fillOpacity={0.75}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Signals table (main feature) ───────────────────────────────────────────

const SIGNAL_CATEGORIES = ["Tous", "Score", "Rôle", "Cluster", "Conviction", "Taille", "Timing"];

function SignalsTable({ combos }: { combos: SignalCombo[] }) {
  const [cat, setCat] = useState("Tous");
  const [sortKey, setSortKey] = useState<"sharpe90d" | "sharpe365d" | "avgReturn365d" | "winRate365d">("sharpe90d");
  const [horizon, setHorizon] = useState<Horizon>("90d");

  const filtered = (cat === "Tous" ? combos : combos.filter((c) => c.category === cat))
    .filter((c) => c.count >= 5)
    .sort((a, b) => ((b[sortKey] ?? -99) as number) - ((a[sortKey] ?? -99) as number));

  const horizonLabel = HORIZONS.find((h) => h.key === horizon)?.label ?? horizon;

  return (
    <div className="space-y-4">
      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        {SIGNAL_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              cat === c
                ? "bg-mint text-black"
                : "bg-surface border border-soft text-secondary hover:text-primary"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Sort + horizon controls */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted">Trier par :</span>
        {[
          { k: "sharpe90d", label: "Sharpe 90j" },
          { k: "sharpe365d", label: "Sharpe 1an" },
          { k: "avgReturn365d", label: "Retour 1an" },
          { k: "winRate365d", label: "Win rate 1an" },
        ].map((opt) => (
          <button
            key={opt.k}
            onClick={() => setSortKey(opt.k as typeof sortKey)}
            className={`px-2.5 py-1 rounded text-xs transition-all ${
              sortKey === opt.k
                ? "bg-indigo text-white"
                : "bg-surface border border-soft text-secondary hover:text-primary"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {HORIZONS.map((h) => (
            <button
              key={h.key}
              onClick={() => setHorizon(h.key)}
              className={`px-2 py-1 rounded text-xs font-mono transition-all ${
                horizon === h.key
                  ? "bg-indigo text-white"
                  : "bg-surface border border-soft text-muted hover:text-primary"
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-soft">
              <th className="text-left pb-2 text-xs text-muted font-medium w-8">#</th>
              <th className="text-left pb-2 text-xs text-muted font-medium">Signal</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">Trades</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">{horizonLabel}</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">T+365</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">T+2ans</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">Win%/90j</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">Win%/1an</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">Sharpe 90j</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">Sharpe 1an</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr key={c.name} className="border-b border-soft/50 hover:bg-surface/50 transition-colors">
                <td className="py-2 text-muted text-xs pr-2">{i + 1}</td>
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded"
                      style={{ background: "var(--bg-surface)", color: "var(--tx-2)" }}
                    >
                      {CATEGORY_ICON[c.category] ?? <BarChart2 size={13} />}
                    </span>
                    <div>
                      <div className="font-medium text-primary text-sm">{c.name}</div>
                      <div className="text-xs text-muted">{c.category}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2 text-center">
                  <span className="text-xs font-mono text-secondary">{c.count}</span>
                </td>
                <td className="py-2 text-center">
                  <ReturnPill v={getReturn(c, horizon)} />
                </td>
                <td className="py-2 text-center">
                  <ReturnPill v={c.avgReturn365d} />
                </td>
                <td className="py-2 text-center">
                  <ReturnPill v={c.avgReturn730d} />
                </td>
                <td className="py-2 text-center">
                  <WinBadge w={c.winRate90d} />
                </td>
                <td className="py-2 text-center">
                  <WinBadge w={c.winRate365d} />
                </td>
                <td className="py-2 text-center">
                  <SharpeBadge s={c.sharpe90d} />
                </td>
                <td className="py-2 text-center">
                  <SharpeBadge s={c.sharpe365d} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {filtered.length} signaux affichés · Sharpe = rendement moyen / écart-type (plus c&apos;est élevé, plus le signal est régulier) · Win% = % de trades positifs
      </p>
    </div>
  );
}

// ── Top trades table ───────────────────────────────────────────────────────

function TopTradesTable({ trades }: { trades: StatsData["topTrades"] }) {
  const [horizon, setHorizon] = useState<Horizon>("365d");

  const sorted = [...trades].sort((a, b) => {
    const aV = a[`return${horizon}` as keyof typeof a] as number | null ?? a.return90d ?? 0;
    const bV = b[`return${horizon}` as keyof typeof b] as number | null ?? b.return90d ?? 0;
    return bV - aV;
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Trier par horizon :</span>
        {HORIZONS.map((h) => (
          <button
            key={h.key}
            onClick={() => setHorizon(h.key)}
            className={`px-2 py-1 rounded text-xs font-mono transition-all ${
              horizon === h.key
                ? "bg-indigo text-white"
                : "bg-surface border border-soft text-muted hover:text-primary"
            }`}
          >
            {h.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-soft">
              <th className="text-left pb-2 text-xs text-muted font-medium">#</th>
              <th className="text-left pb-2 text-xs text-muted font-medium">Société</th>
              <th className="text-left pb-2 text-xs text-muted font-medium">Insider</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">Date</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">Montant</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">Score</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">T+30</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">T+90</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">T+365</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">T+2ans</th>
              <th className="text-left pb-2 text-xs text-muted font-medium">Tags</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={i} className="border-b border-soft/50 hover:bg-surface/50 transition-colors">
                <td className="py-2 text-muted text-xs pr-1">{i + 1}</td>
                <td className="py-2 pr-2">
                  <Link
                    href={`/companies/${t.company.slug}`}
                    className="font-medium text-primary hover:text-mint transition-colors text-sm"
                  >
                    {t.company.name.length > 18 ? t.company.name.slice(0, 17) + "…" : t.company.name}
                  </Link>
                </td>
                <td className="py-2 pr-2">
                  <div className="text-xs text-secondary leading-tight">
                    {t.insiderName?.split(" ").slice(0, 2).join(" ") ?? "—"}
                  </div>
                  <div className="text-xs text-muted">{t.role}</div>
                </td>
                <td className="py-2 text-center text-xs font-mono text-muted">{fmtDate(t.transactionDate)}</td>
                <td className="py-2 text-center text-xs font-mono text-secondary">{fmtAmt(t.totalAmount)}</td>
                <td className="py-2 text-center">
                  {t.signalScore != null ? (
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-xs font-bold font-mono"
                      style={{
                        background: t.signalScore >= 65 ? "rgba(56,215,156,0.12)" : "rgba(148,163,184,0.08)",
                        color: t.signalScore >= 65 ? "var(--color-mint)" : "var(--fg-secondary)",
                      }}
                    >
                      {t.signalScore}
                    </span>
                  ) : <span className="text-muted">—</span>}
                </td>
                <td className="py-2 text-center"><ReturnPill v={t.return30d} /></td>
                <td className="py-2 text-center"><ReturnPill v={t.return90d} /></td>
                <td className="py-2 text-center"><ReturnPill v={t.return365d} /></td>
                <td className="py-2 text-center"><ReturnPill v={t.return730d} /></td>
                <td className="py-2">
                  <div className="flex flex-wrap gap-1">
                    {t.isCluster && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-indigo/10 text-indigo border border-indigo/20">
                        {t.consecutiveBuys}×
                      </span>
                    )}
                    {t.isDca && <span className="text-xs px-1.5 py-0.5 rounded bg-mint/10 text-mint border border-mint/20">DCA</span>}
                    {t.isFirstBuy && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">1er</span>}
                    {(t.pctOfMarketCap ?? 0) >= 1 && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red/10 text-red border border-red/20">
                        {t.pctOfMarketCap?.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card p-4 flex flex-col gap-1">
      <div className="text-xs text-muted font-medium uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold font-mono ${accent ? "text-mint" : "text-primary"}`}>{value}</div>
      {sub && <div className="text-xs text-secondary">{sub}</div>}
    </div>
  );
}

// ── Scatter plot ───────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  "PDG/DG": "#6366f1",
  "CFO/DAF": "#38d79c",
  "Directeur": "#f59e0b",
  "CA/Board": "#94a3b8",
  "Autre": "#64748b",
};

// ── Main component ─────────────────────────────────────────────────────────

type Tab = "overview" | "signals" | "behaviors" | "trades" | "sells" | "evolution";

export default function BacktestDashboard() {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [groupHorizon, setGroupHorizon] = useState<Horizon>("90d");

  useEffect(() => {
    fetch("/api/backtest/stats")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-mint border-t-transparent animate-spin" />
        <p className="text-secondary text-sm">Calcul des statistiques de backtest…</p>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="text-center py-24 text-muted">
        <p className="text-lg font-medium">Aucune donnée de backtest disponible.</p>
        <p className="text-sm mt-2">Lancez le pipeline de calcul en local pour initialiser les données.</p>
      </div>
    );
  }

  const g = data.overallBuys ?? data.overall; // KPIs show buy-only stats
  const tabs: { key: Tab; label: string }[] = [
    { key: "overview",  label: "Vue d'ensemble" },
    { key: "signals",   label: "Signaux" },
    { key: "behaviors", label: "Comportements" },
    { key: "trades",    label: "Top trades" },
    { key: "sells",     label: `Ventes (${data.totalSells ?? 0})` },
    { key: "evolution", label: "Par année" },
  ];

  const HORIZON_LABEL = HORIZONS.find((h) => h.key === groupHorizon)?.label ?? groupHorizon;

  return (
    <div className="space-y-6">

      {/* ─ KPI strip ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard label="Achats backtestés" value={(data.totalBuys ?? data.total).toLocaleString("fr")} />
        <KpiCard label="Ventes backtestées" value={(data.totalSells ?? 0).toLocaleString("fr")} sub="signal baissier" />
        <KpiCard label="Retour achat T+90" value={fmt(g.avgReturn90d)} accent={(g.avgReturn90d ?? 0) > 0} />
        <KpiCard label="Retour achat T+365" value={fmt(g.avgReturn365d)} accent={(g.avgReturn365d ?? 0) > 0} />
        <KpiCard label="Win rate T+90" value={g.winRate90d != null ? `${g.winRate90d.toFixed(0)}%` : "—"} />
        <KpiCard label="Win rate T+1an" value={g.winRate365d != null ? `${g.winRate365d.toFixed(0)}%` : "—"} />
      </div>

      {/* ─ Insights ───────────────────────────────────────────────────── */}
      {data.insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.insights.map((ins, i) => (
            <div key={i} className="card p-4 flex gap-3 items-start">
              <div
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg mt-0.5"
                style={{ background: "var(--c-indigo-bg)", color: "var(--c-indigo-2)" }}
              >
                {INSIGHT_ICON[ins.icon] ?? <TrendingUp size={18} strokeWidth={1.8} />}
              </div>
              <div>
                <div className="font-semibold text-primary text-sm mb-1">{ins.title}</div>
                <div className="text-xs text-secondary leading-relaxed">{ins.text}</div>
                <div className="mt-2">
                  <span
                    className="inline-block text-xs font-bold font-mono px-2 py-0.5 rounded"
                    style={{ background: "var(--c-mint-bg)", color: "var(--c-mint)" }}
                  >
                    {ins.highlight}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─ Tabs ───────────────────────────────────────────────────────── */}
      <div className="border-b border-soft">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab === t.key
                  ? "border-mint text-primary"
                  : "border-transparent text-muted hover:text-secondary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Vue d'ensemble                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Horizon picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Horizon affiché :</span>
            {HORIZONS.map((h) => (
              <button
                key={h.key}
                onClick={() => setGroupHorizon(h.key)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                  groupHorizon === h.key
                    ? "bg-indigo text-white"
                    : "bg-surface border border-soft text-muted hover:text-primary"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4">Par rôle de l&apos;insider — {HORIZON_LABEL}</h3>
              <GroupChart data={data.byRole} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4">Par taille de société — {HORIZON_LABEL}</h3>
              <GroupChart data={data.bySize} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4">Par score de signal — {HORIZON_LABEL}</h3>
              <GroupChart data={data.byScore} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4">Par montant de la transaction — {HORIZON_LABEL}</h3>
              <GroupChart data={data.byAmount} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4">Saisonnalité — {HORIZON_LABEL}</h3>
              <GroupChart data={data.bySeason} horizon={groupHorizon} height={180} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4">% de la capitalisation — {HORIZON_LABEL}</h3>
              <GroupChart data={data.byMcapPct} horizon={groupHorizon} height={180} />
            </div>
          </div>

          {/* Scatter: score vs return */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-primary mb-4">Score de signal vs retour T+90 (par insider)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="score" name="Score" tick={{ fontSize: 11, fill: "var(--fg-muted)" }} label={{ value: "Score", position: "insideBottom", offset: -4, fill: "var(--fg-muted)", fontSize: 11 }} />
                <YAxis dataKey="return90d" name="T+90" tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: "var(--fg-muted)" }} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-elevated border border-soft rounded-lg p-2 text-xs shadow-lg">
                        <div className="font-semibold text-primary">{d.company}</div>
                        <div className="text-secondary">Score {d.score} · {d.role}</div>
                        <div className={retClass(d.return90d)}>T+90 : {fmt(d.return90d)}</div>
                      </div>
                    );
                  }}
                />
                <Scatter data={data.scatter} name="Trades">
                  {data.scatter.map((s, i) => (
                    <Cell key={i} fill={ROLE_COLORS[s.role] ?? "#64748b"} fillOpacity={0.6} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2">
              {Object.entries(ROLE_COLORS).map(([r, c]) => (
                <div key={r} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                  <span className="text-xs text-muted">{r}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Signaux                                                   */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "signals" && (
        <div className="card p-4 md:p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-base font-semibold text-primary">Classement des signaux</h3>
              <p className="text-xs text-muted mt-1">
                {data.signalCombos.length} combinaisons analysées sur {data.total} transactions historiques · triées par Sharpe (régularité du signal)
              </p>
            </div>
          </div>
          <SignalsTable combos={data.signalCombos} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Comportements                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "behaviors" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Horizon :</span>
            {HORIZONS.map((h) => (
              <button
                key={h.key}
                onClick={() => setGroupHorizon(h.key)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                  groupHorizon === h.key
                    ? "bg-indigo text-white"
                    : "bg-surface border border-soft text-muted hover:text-primary"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4">Patterns comportementaux — {HORIZON_LABEL}</h3>
              <GroupChart data={data.byBehavior} horizon={groupHorizon} height={240} />
            </div>

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4">Profondeur du cluster — {HORIZON_LABEL}</h3>
              <GroupChart data={data.byClusterDepth} horizon={groupHorizon} height={200} />
            </div>
          </div>

          {/* Behavior detail table */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-primary mb-4">Détail par comportement — tous horizons</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-soft">
                    <th className="text-left pb-2 text-xs text-muted font-medium">Comportement</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">N</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+30</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+60</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+90</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+160</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+365</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+2ans</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">Win/90j</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">Win/1an</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">Sharpe</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Overall first */}
                  <tr className="border-b border-mint/20 bg-mint/5">
                    <td className="py-2 font-semibold text-primary text-sm">Ensemble (baseline)</td>
                    <td className="py-2 text-center text-xs font-mono text-secondary">{g.count}</td>
                    <td className="py-2 text-center"><ReturnPill v={g.avgReturn30d} /></td>
                    <td className="py-2 text-center"><ReturnPill v={g.avgReturn60d} /></td>
                    <td className="py-2 text-center"><ReturnPill v={g.avgReturn90d} /></td>
                    <td className="py-2 text-center"><ReturnPill v={g.avgReturn160d} /></td>
                    <td className="py-2 text-center"><ReturnPill v={g.avgReturn365d} /></td>
                    <td className="py-2 text-center"><ReturnPill v={g.avgReturn730d} /></td>
                    <td className="py-2 text-center"><WinBadge w={g.winRate90d} /></td>
                    <td className="py-2 text-center"><WinBadge w={g.winRate365d} /></td>
                    <td className="py-2 text-center"><SharpeBadge s={g.sharpe90d} /></td>
                  </tr>
                  {Object.entries(data.byBehavior).map(([name, stats]) => (
                    <tr key={name} className="border-b border-soft/50 hover:bg-surface/50 transition-colors">
                      <td className="py-2 text-sm text-primary font-medium">{name}</td>
                      <td className="py-2 text-center text-xs font-mono text-secondary">{stats.count}</td>
                      <td className="py-2 text-center"><ReturnPill v={stats.avgReturn30d} /></td>
                      <td className="py-2 text-center"><ReturnPill v={stats.avgReturn60d} /></td>
                      <td className="py-2 text-center"><ReturnPill v={stats.avgReturn90d} /></td>
                      <td className="py-2 text-center"><ReturnPill v={stats.avgReturn160d} /></td>
                      <td className="py-2 text-center"><ReturnPill v={stats.avgReturn365d} /></td>
                      <td className="py-2 text-center"><ReturnPill v={stats.avgReturn730d} /></td>
                      <td className="py-2 text-center"><WinBadge w={stats.winRate90d} /></td>
                      <td className="py-2 text-center"><WinBadge w={stats.winRate365d} /></td>
                      <td className="py-2 text-center"><SharpeBadge s={stats.sharpe90d} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Gender comparison ───────────────────────────────────────── */}
          {data.byGender && (
            <div className="card p-4 md:p-6">
              <h3 className="text-sm font-semibold text-primary mb-1">Analyse Hommes vs Femmes</h3>
              <p className="text-xs text-muted mb-4">Performance des achats d&apos;initiés selon le genre du dirigeant</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-soft">
                      <th className="text-left pb-2 text-xs text-muted font-medium">Genre</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">Achats</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">T+30</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">T+90</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">T+365</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">Win% (90j)</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">Win% (1an)</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">Sharpe (90j)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["M", "F", "unknown"] as const).map((key) => {
                      const g = data.byGender[key];
                      if (!g || g.count < 3) return null;
                      const label = key === "M" ? "Hommes" : key === "F" ? "Femmes" : "Non déterminé";
                      const color = key === "F" ? "text-violet-400" : key === "M" ? "text-sky-400" : "text-muted";
                      return (
                        <tr key={key} className="border-b border-soft/50 hover:bg-surface/50">
                          <td className={`py-3 font-semibold ${color}`}>{label}</td>
                          <td className="py-3 text-center text-xs font-mono text-secondary">{g.count.toLocaleString("fr")}</td>
                          <td className="py-3 text-center"><ReturnPill v={g.avgReturn30d} /></td>
                          <td className="py-3 text-center"><ReturnPill v={g.avgReturn90d} /></td>
                          <td className="py-3 text-center"><ReturnPill v={g.avgReturn365d} /></td>
                          <td className="py-3 text-center"><WinBadge w={g.winRate90d} /></td>
                          <td className="py-3 text-center"><WinBadge w={g.winRate365d} /></td>
                          <td className="py-3 text-center"><SharpeBadge s={g.sharpe90d} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted mt-3">
                Genre inféré depuis la fonction (formes féminines) et les prénom/civilité des déclarations.
                {" "}{data.byGender.F.count} femmes · {data.byGender.M.count} hommes identifiés.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Top trades                                                 */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "trades" && (
        <div className="card p-4 md:p-6">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-primary">Top 30 trades historiques</h3>
            <p className="text-xs text-muted mt-1">
              Les meilleures transactions d&apos;initiés classées par retour sur investissement
            </p>
          </div>
          <TopTradesTable trades={data.topTrades} />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Ventes / Signal baissier                                  */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "sells" && data.sellStats && (
        <div className="space-y-6">

          {/* Sell KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Ventes analysées" value={data.sellStats.count.toLocaleString("fr")} />
            <KpiCard
              label="Précision signal T+90"
              value={data.sellStats.accuracy90d != null ? `${data.sellStats.accuracy90d.toFixed(0)}%` : "—"}
              sub="% des ventes suivies d'une baisse"
              accent={(data.sellStats.accuracy90d ?? 0) > 50}
            />
            <KpiCard
              label="Précision signal T+365"
              value={data.sellStats.accuracy365d != null ? `${data.sellStats.accuracy365d.toFixed(0)}%` : "—"}
              sub="% des ventes suivies d'une baisse"
              accent={(data.sellStats.accuracy365d ?? 0) > 50}
            />
            <KpiCard
              label="Retour moyen T+90 (marché)"
              value={data.sellStats.avgReturn90d != null ? `${data.sellStats.avgReturn90d > 0 ? "+" : ""}${data.sellStats.avgReturn90d.toFixed(1)}%` : "—"}
              sub={data.sellStats.avgReturn90d != null && data.sellStats.avgReturn90d < 0 ? "baisse confirmée" : "pas de signal clair"}
            />
          </div>

          {/* Interpretation note */}
          <div className="card p-4 border border-amber-500/20 bg-amber-50/5">
            <p className="text-sm text-secondary">
              <strong className="text-primary">Lecture du signal vente :</strong> Quand un dirigeant cède ses actions,
              on attend une baisse du cours. La &ldquo;précision&rdquo; mesure le % de cas où le cours a effectivement baissé
              dans les jours suivants. Un retour moyen négatif confirme que le signal est baissier.
            </p>
          </div>

          {/* By role */}
          {Object.keys(data.sellStats.bySellRole).length > 0 && (
            <div className="card p-4 md:p-6">
              <h3 className="text-sm font-semibold text-primary mb-4">Précision du signal vente par rôle</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-soft">
                      <th className="text-left pb-2 text-xs text-muted font-medium">Rôle</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">Nb ventes</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">Précision T+90</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">Précision T+365</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">Retour moy. T+90</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">Retour moy. T+365</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.sellStats.bySellRole)
                      .filter(([, v]) => v !== null)
                      .sort(([, a], [, b]) => (b?.accuracy365d ?? 0) - (a?.accuracy365d ?? 0))
                      .map(([role, stats]) => stats && (
                        <tr key={role} className="border-b border-soft/50 hover:bg-surface/50">
                          <td className="py-2 font-medium text-primary">{role}</td>
                          <td className="py-2 text-center text-xs font-mono text-secondary">{stats.count}</td>
                          <td className="py-2 text-center">
                            <span className={`text-xs font-mono font-semibold ${(stats.accuracy90d ?? 0) > 55 ? "text-rose-400" : "text-muted"}`}>
                              {stats.accuracy90d != null ? `${stats.accuracy90d.toFixed(0)}%` : "—"}
                            </span>
                          </td>
                          <td className="py-2 text-center">
                            <span className={`text-xs font-mono font-semibold ${(stats.accuracy365d ?? 0) > 55 ? "text-rose-400" : "text-muted"}`}>
                              {stats.accuracy365d != null ? `${stats.accuracy365d.toFixed(0)}%` : "—"}
                            </span>
                          </td>
                          <td className="py-2 text-center"><ReturnPill v={stats.avgReturn90d} /></td>
                          <td className="py-2 text-center"><ReturnPill v={stats.avgReturn365d} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top confirmed sells (largest drops) */}
          <div className="card p-4 md:p-6">
            <h3 className="text-sm font-semibold text-primary mb-1">Ventes les mieux anticipées</h3>
            <p className="text-xs text-muted mb-4">Les ventes d&apos;initiés suivies des plus fortes baisses de cours</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-soft">
                    <th className="text-left pb-2 text-xs text-muted font-medium">Société</th>
                    <th className="text-left pb-2 text-xs text-muted font-medium">Initié</th>
                    <th className="text-left pb-2 text-xs text-muted font-medium">Rôle</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">Date</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">Montant</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+30</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+90</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+365</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sellStats.topSellsTrades.map((t, i) => (
                    <tr key={i} className="border-b border-soft/50 hover:bg-surface/50">
                      <td className="py-2 font-medium text-primary max-w-[160px] truncate">
                        <a href={`/companies/${t.company.slug}`} className="hover:text-mint">{t.company.name}</a>
                      </td>
                      <td className="py-2 text-xs text-secondary max-w-[140px] truncate">{t.insiderName ?? "—"}</td>
                      <td className="py-2 text-xs text-secondary">{t.role}</td>
                      <td className="py-2 text-center text-xs font-mono text-muted">
                        {new Date(t.transactionDate).toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"2-digit" })}
                      </td>
                      <td className="py-2 text-center text-xs font-mono text-muted">
                        {t.totalAmount ? `${(t.totalAmount / 1000).toFixed(0)} k€` : "—"}
                      </td>
                      <td className="py-2 text-center"><ReturnPill v={t.return30d} /></td>
                      <td className="py-2 text-center"><ReturnPill v={t.return90d} /></td>
                      <td className="py-2 text-center"><ReturnPill v={t.return365d} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Évolution par année                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "evolution" && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">Horizon :</span>
            {HORIZONS.map((h) => (
              <button
                key={h.key}
                onClick={() => setGroupHorizon(h.key)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                  groupHorizon === h.key
                    ? "bg-indigo text-white"
                    : "bg-surface border border-soft text-muted hover:text-primary"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-semibold text-primary mb-4">Retour moyen par année de transaction — {HORIZON_LABEL}</h3>
            <GroupChart data={data.byYear} horizon={groupHorizon} height={260} />
          </div>

          {/* Year detail table */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-primary mb-4">Détail année par année — tous horizons</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-soft">
                    <th className="text-left pb-2 text-xs text-muted font-medium">Année</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">Trades</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+30</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+60</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+90</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+160</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+365</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+2ans</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">Win%</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">Sharpe</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.byYear)
                    .sort(([a], [b]) => Number(b) - Number(a))
                    .map(([year, stats]) => (
                      <tr key={year} className="border-b border-soft/50 hover:bg-surface/50 transition-colors">
                        <td className="py-2 font-bold font-mono text-primary">{year}</td>
                        <td className="py-2 text-center text-xs font-mono text-secondary">{stats.count}</td>
                        <td className="py-2 text-center"><ReturnPill v={stats.avgReturn30d} /></td>
                        <td className="py-2 text-center"><ReturnPill v={stats.avgReturn60d} /></td>
                        <td className="py-2 text-center"><ReturnPill v={stats.avgReturn90d} /></td>
                        <td className="py-2 text-center"><ReturnPill v={stats.avgReturn160d} /></td>
                        <td className="py-2 text-center"><ReturnPill v={stats.avgReturn365d} /></td>
                        <td className="py-2 text-center"><ReturnPill v={stats.avgReturn730d} /></td>
                        <td className="py-2 text-center"><WinBadge w={stats.winRate90d} /></td>
                        <td className="py-2 text-center"><SharpeBadge s={stats.sharpe90d} /></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
