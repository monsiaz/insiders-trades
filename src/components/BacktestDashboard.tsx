"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, ReferenceLine, LabelList,
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
  medianReturn730d: number | null;
  countReturn90d: number;
  countReturn365d: number;
  countReturn730d: number;
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

interface CoverageHorizon { count: number; }

interface StatsData {
  total: number;
  totalBuys: number;
  totalSells: number;
  isAuthenticated: boolean;
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
  coverageByHorizon: {
    totalEligible: number;
    totalWithPrice: number;
    "30d": CoverageHorizon;
    "60d": CoverageHorizon;
    "90d": CoverageHorizon;
    "160d": CoverageHorizon;
    "365d": CoverageHorizon;
    "730d": CoverageHorizon;
  };
  lastComputedAt: string | null;
}

// ── Formatters ─────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, d = 1): string {
  if (n == null) return "·";
  return `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;
}
function fmtAmt(n: number | null | undefined): string {
  if (!n) return "·";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M€`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k€`;
  return `${n.toFixed(0)}€`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "·";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" });
}
function retColor(n: number | null | undefined): string {
  if (n == null) return "var(--tx-3)";
  if (n >= 20) return "var(--signal-pos)";
  if (n >= 5)  return "var(--signal-pos)";
  if (n >= 0)  return "var(--tx-2)";
  return "var(--signal-neg)";
}
function retClass(n: number | null | undefined): string {
  if (n == null) return "text-muted";
  if (n >= 5)  return "text-secondary";
  if (n >= 0)  return "text-secondary";
  return "text-muted";
}
function sharpeColor(s: number | null): string {
  // DA v3: green (excellent) → gold (average) → grey → red
  if (s == null) return "var(--tx-3)";
  if (s >= 1.5) return "var(--signal-pos)";
  if (s >= 0.8) return "var(--gold)";
  if (s >= 0)   return "var(--tx-3)";
  return "var(--signal-neg)";
}

// ── Mini components ────────────────────────────────────────────────────────

function ReturnPill({ v }: { v: number | null }) {
  if (v == null) return <span className="text-muted text-sm">·</span>;
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-xs font-mono font-semibold"
      style={{
        background: v >= 5 ? "var(--signal-pos-bg)" : v >= 0 ? "rgba(148,163,184,0.08)" : "var(--signal-neg-bg)",
        color: retColor(v),
      }}
    >
      {fmt(v)}
    </span>
  );
}

function SharpeBadge({ s }: { s: number | null }) {
  if (s == null) return <span className="text-muted text-xs">·</span>;
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
  if (w == null) return <span className="text-muted text-xs">·</span>;
  const color = w >= 60 ? "var(--signal-pos)" : w >= 45 ? "var(--gold)" : "var(--signal-neg)";
  return (
    <span className="text-xs font-semibold" style={{ color }}>
      {w.toFixed(0)}%
    </span>
  );
}

// ── InfoTip · portal tooltip (escapes overflow:hidden containers) ──────────

function InfoTip({ text, wide }: { text: string; wide?: boolean }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const tipW = wide ? 240 : 190;

  function handleEnter() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    // Centre the tooltip on the icon, positioned above it
    let x = r.left + r.width / 2 - tipW / 2;
    // Keep inside viewport horizontally
    x = Math.max(8, Math.min(x, window.innerWidth - tipW - 8));
    const y = r.top - 8; // anchor to top of icon; tooltip goes above
    setPos({ x, y });
  }

  const tipNode = pos ? (
    <div
      className="pointer-events-none"
      style={{
        position: "fixed",
        zIndex: 9999,
        left: pos.x,
        top: pos.y,
        transform: "translateY(-100%)",
        width: tipW,
        padding: "10px 12px",
        borderRadius: 12,
        fontSize: "0.72rem",
        lineHeight: 1.55,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-med)",
        color: "var(--tx-2)",
        boxShadow: "0 8px 28px rgba(0,0,0,0.32)",
      }}
    >
      {text}
      {/* Arrow */}
      <div
        style={{
          position: "absolute",
          bottom: -8,
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent",
          borderTop: "8px solid var(--border-med)",
        }}
      />
    </div>
  ) : null;

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center cursor-help"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setPos(null)}
    >
      <span
        className="inline-flex items-center justify-center rounded-full text-[9px] font-bold leading-none ml-1"
        style={{
          width: 14, height: 14,
          background: "var(--bg-raised)",
          border: "1px solid var(--border-med)",
          color: "var(--tx-4)",
        }}
      >
        ?
      </span>
      {typeof document !== "undefined" && tipNode
        ? createPortal(tipNode, document.body)
        : null}
    </span>
  );
}

// ── Coverage mini-bar ─────────────────────────────────────────────────────

function CoverageBar({
  coverage,
  horizon,
  totalBuys,
}: {
  coverage: StatsData["coverageByHorizon"] | undefined;
  horizon: Horizon;
  totalBuys: number;
}) {
  if (!coverage) return null;
  const hData = coverage[horizon] as CoverageHorizon | undefined;
  if (!hData) return null;

  const withPricePct = coverage.totalWithPrice > 0
    ? Math.round((coverage.totalWithPrice / coverage.totalEligible) * 100)
    : 0;
  const horizonPct = totalBuys > 0
    ? Math.round((hData.count / totalBuys) * 100)
    : 0;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium" style={{ color: "var(--tx-4)" }}>
          Couverture prix :
        </span>
        <span className="text-[11px] font-bold" style={{ color: withPricePct >= 90 ? "var(--gold)" : withPricePct >= 70 ? "var(--tx-2)" : "var(--c-red)" }}>
          {withPricePct}%
        </span>
        <span className="text-[10px]" style={{ color: "var(--tx-4)" }}>
          ({coverage.totalWithPrice.toLocaleString("fr")}/{coverage.totalEligible.toLocaleString("fr")} déclarations)
        </span>
        <InfoTip
          text="% de déclarations AMF pour lesquelles Yahoo Finance a fourni un cours historique. Les 3% manquants sont des sociétés délistées, obligataires (ISIN) ou trop récentes."
          wide
        />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 80, background: "var(--bg-raised)" }}>
          <div
            className="h-full rounded-full"
            style={{
              width: `${horizonPct}%`,
              background: horizonPct >= 80 ? "var(--gold)" : horizonPct >= 60 ? "var(--tx-2)" : "var(--c-red)",
              opacity: 0.85,
            }}
          />
        </div>
        <span className="text-[11px] font-bold" style={{ color: "var(--tx-3)" }}>
          {horizonPct}%
        </span>
        <span className="text-[10px]" style={{ color: "var(--tx-4)" }}>
          ont atteint l'horizon {horizon === "730d" ? "T+2ans" : `T+${horizon}`}
        </span>
        <InfoTip
          text={`Pour l'horizon ${horizon === "730d" ? "T+2ans" : `T+${horizon}`}, seuls les trades suffisamment anciens ont des données de cours. Les transactions récentes réduisent ce chiffre, c'est normal.`}
          wide
        />
      </div>
    </div>
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

  const maxAbs = Math.max(...items.map((d) => Math.abs(d.value ?? 0)), 1);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={items} layout="vertical" margin={{ left: 0, right: 56, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" horizontal={false} />
        <XAxis
          type="number"
          domain={[-maxAbs * 1.05, maxAbs * 1.05]}
          tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`}
          tick={{ fontSize: 10, fill: "var(--tx-3)" }}
          axisLine={{ stroke: "var(--border-med)" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="key"
          width={100}
          tick={{ fontSize: 11, fill: "var(--tx-2)" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(v) => {
            const n = typeof v === "number" ? v : 0;
            return [`${n >= 0 ? "+" : ""}${n.toFixed(1)}%`, "Retour moy."];
          }}
          labelFormatter={(label, payload) => {
            const p = payload?.[0]?.payload;
            return `${label}${p?.count ? ` · n=${p.count}` : ""}`;
          }}
          labelStyle={{ color: "var(--tx-1)", fontSize: 12, fontWeight: 600, marginBottom: 4 }}
          contentStyle={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-med)",
            borderRadius: 10,
            boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
            padding: "8px 12px",
          }}
          itemStyle={{ color: "var(--tx-2)", fontSize: 12 }}
        />
        <ReferenceLine x={0} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} minPointSize={2}>
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: unknown) => {
              const n = typeof v === "number" ? v : 0;
              return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
            }}
            style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fill: "var(--tx-2)", fontWeight: 600 }}
          />
          {items.map((entry, idx) => {
            const isPos = (entry.value ?? 0) >= 0;
            const opacity = 1 - (idx / items.length) * 0.3;
            return (
              <Cell
                key={entry.key}
                fill={isPos ? "var(--signal-pos)" : "var(--signal-neg)"}
                fillOpacity={opacity}
              />
            );
          })}
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
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
        <div className="flex flex-wrap gap-1 sm:ml-auto">
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
        <table className="w-full text-sm table-zebra min-w-[720px]">
          <thead>
            <tr className="border-b border-soft">
              <th className="text-left pb-2 text-xs text-muted font-medium w-8">#</th>
              <th className="text-left pb-2 text-xs text-muted font-medium">Signal</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                Trades
                <InfoTip text="Nombre de trades historiques dans ce groupe. Minimum 5 requis pour afficher le signal." />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                {horizonLabel}
                {horizon === "90d" && <span className="block text-[10px] font-normal opacity-60">moy · médiane</span>}
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">T+365</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                T+2ans
                <InfoTip text="Affiché uniquement si au moins 5 trades ont un recul de 2 ans. En dessous, la moyenne est trop sensible aux outliers." />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                Win%/90j
                <InfoTip text="% de trades avec un cours en hausse à T+90. >60% = fort signal. Un hasard pur donnerait ~50%." />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                Win%/1an
                <InfoTip text="% de trades avec un cours en hausse à T+365." />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                Sharpe 90j
                <InfoTip text="Rendement moyen T+90 divisé par l'écart-type. Mesure la régularité du signal. >0.5 = bon, >1 = excellent. Un Sharpe élevé avec peu de trades peut être du bruit." wide />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                Sharpe 1an
                <InfoTip text="Rendement moyen T+365 divisé par l'écart-type sur 1 an." />
              </th>
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
                  {horizon === "90d" ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <ReturnPill v={c.avgReturn90d} />
                      {c.medianReturn90d != null && (
                        <span className="text-[10px] text-muted font-mono opacity-70">
                          {c.medianReturn90d >= 0 ? "+" : ""}{c.medianReturn90d.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  ) : (
                    <ReturnPill v={getReturn(c, horizon)} />
                  )}
                </td>
                <td className="py-2 text-center">
                  <ReturnPill v={c.avgReturn365d} />
                </td>
                <td className="py-2 text-center">
                  {(c.countReturn730d ?? 0) >= 5 ? (
                    <ReturnPill v={c.avgReturn730d} />
                  ) : (
                    <span className="text-[10px] font-mono text-muted/40 italic">
                      n={(c.countReturn730d ?? 0)}
                    </span>
                  )}
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
      <div className="flex flex-wrap items-center gap-2">
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
        <table className="w-full text-sm table-zebra min-w-[720px]">
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
                    {t.insiderName?.split(" ").slice(0, 2).join(" ") ?? "·"}
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
                        color: t.signalScore >= 65 ? "var(--gold)" : "var(--tx-2)",
                      }}
                    >
                      {t.signalScore}
                    </span>
                  ) : <span className="text-muted">·</span>}
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

function KpiCard({
  label, value, sub, accent, border, tooltip,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  border?: "indigo" | "red" | "mint" | "amber";
  tooltip?: string;
}) {
  return (
    <div className={`card p-4 flex flex-col gap-1${border ? ` kpi-card-${border}` : ""}`}>
      <div className="flex items-center text-xs text-muted font-medium uppercase tracking-wide gap-0.5">
        {label}
        {tooltip && <InfoTip text={tooltip} wide />}
      </div>
      <div className={`text-2xl font-bold font-mono ${accent ? "text-mint" : "text-primary"}`}>{value}</div>
      {sub && <div className="text-xs text-secondary">{sub}</div>}
    </div>
  );
}

// ── Scatter plot ───────────────────────────────────────────────────────────

// DA v3: monochrome gold (by seniority) · no rainbow
const ROLE_COLORS: Record<string, string> = {
  "PDG/DG":    "#B8955A", // primary gold · highest seniority
  "CFO/DAF":   "#A07F47", // gold darker
  "Directeur": "#D4AF76", // gold lighter
  "CA/Board":  "#3A5687", // navy 2
  "Autre":     "#6B5D4E", // warm grey
};

// ── Freemium lock overlay ──────────────────────────────────────────────────

function FreemiumLock({ feature = "cet onglet", children }: { feature?: string; children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", minHeight: "280px" }}>
      {/* Blurred background preview */}
      <div style={{ filter: "blur(6px)", pointerEvents: "none", userSelect: "none", WebkitUserSelect: "none", opacity: 0.7, maxHeight: "320px", overflow: "hidden" }}>
        {children}
      </div>
      {/* Lock CTA */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(to bottom, transparent 0%, var(--bg-base) 55%)",
        zIndex: 10,
      }}>
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-med)", borderRadius: "16px",
          padding: "24px 32px", maxWidth: "360px", textAlign: "center", boxShadow: "var(--shadow-lg)",
        }}>
          <div style={{
            width: "40px", height: "40px", borderRadius: "10px", margin: "0 auto 12px",
            background: "linear-gradient(135deg, var(--c-indigo), var(--c-violet))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" stroke="white" strokeWidth="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h3 style={{ fontFamily: "'Banana Grotesk', 'Inter', system-ui", fontSize: "1rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "6px", letterSpacing: "-0.02em" }}>
            Accès membres uniquement
          </h3>
          <p style={{ fontSize: "0.82rem", color: "var(--tx-3)", lineHeight: 1.5, marginBottom: "16px" }}>
            Créez un compte gratuit pour accéder à {feature} : historique complet, noms des entreprises et performances détaillées.
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
            <a href="/auth/register" style={{
              padding: "8px 18px", borderRadius: "9px", fontWeight: 700, fontSize: "0.84rem",
              background: "linear-gradient(135deg, var(--c-indigo), var(--c-violet))",
              color: "white", textDecoration: "none", boxShadow: "0 4px 14px rgba(91,92,246,0.4)",
            }}>
              Compte gratuit
            </a>
            <a href="/auth/login" style={{
              padding: "8px 14px", borderRadius: "9px", fontWeight: 600, fontSize: "0.84rem",
              background: "var(--bg-sub)", border: "1px solid var(--border-med)",
              color: "var(--tx-2)", textDecoration: "none",
            }}>
              Connexion
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

type Tab = "overview" | "signals" | "behaviors" | "trades" | "sells" | "evolution";

export default function BacktestDashboard({ initialData }: { initialData?: StatsData }) {
  const [data, setData] = useState<StatsData | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [tab, setTab] = useState<Tab>("overview");
  const [groupHorizon, setGroupHorizon] = useState<Horizon>("90d");

  useEffect(() => {
    // If initialData was provided by SSR, skip the client-side fetch
    if (initialData) return;
    fetch("/api/backtest/stats")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Dynamic KPI values: respond to the groupHorizon picker
  const kpiReturn = getReturn(g, groupHorizon);
  const kpiWinRate = groupHorizon === "30d"  ? g.winRate90d   // no dedicated 30d win rate · fallback
    : groupHorizon === "60d"  ? g.winRate90d
    : groupHorizon === "90d"  ? g.winRate90d
    : groupHorizon === "160d" ? g.winRate90d
    : groupHorizon === "365d" ? g.winRate365d
    : g.winRate365d; // 730d
  const kpiMedianReturn = groupHorizon === "90d" ? g.medianReturn90d : groupHorizon === "365d" ? g.medianReturn365d : null;
  const kpiHorizonLabel = HORIZONS.find((h) => h.key === groupHorizon)?.label ?? groupHorizon;

  const isAuth = data.isAuthenticated;

  const tabs: { key: Tab; label: string; locked?: boolean }[] = [
    { key: "overview",  label: "Vue d'ensemble" },
    { key: "signals",   label: "Signaux",     locked: !isAuth },
    { key: "behaviors", label: "Comportements" },
    { key: "trades",    label: "Top trades",  locked: !isAuth },
    { key: "sells",     label: `Ventes (${data.totalSells ?? 0})`, locked: !isAuth },
    { key: "evolution", label: "Par année" },
  ];

  const HORIZON_LABEL = HORIZONS.find((h) => h.key === groupHorizon)?.label ?? groupHorizon;

  return (
    <div className="space-y-6">

      {/* ─ Header with freshness indicator ────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--gold)" }} />
          <span className="text-xs font-semibold" style={{ color: "var(--tx-3)" }}>
            Backtest sur données réelles AMF
          </span>
          <InfoTip text="Les résultats sont calculés à partir des cours historiques Yahoo Finance sur 20 ans. Le calcul incrémental tourne quotidiennement en production." wide />
        </div>
        {data.lastComputedAt && (
          <span className="text-[11px] px-2.5 py-1 rounded-lg" style={{ background: "var(--bg-raised)", color: "var(--tx-4)", border: "1px solid var(--border)" }}>
            Dernière mise à jour : {new Date(data.lastComputedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* ─ KPI strip · values update with the horizon picker ─────────── */}
      <div className="space-y-3">
        {/* Horizon picker + coverage */}
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--tx-4)" }}>Horizon :</span>
            {HORIZONS.map((h) => {
              const hCov = data.coverageByHorizon?.[h.key] as CoverageHorizon | undefined;
              const hPct = hCov && (data.totalBuys ?? data.total) > 0
                ? Math.round((hCov.count / (data.totalBuys ?? data.total)) * 100)
                : null;
              return (
                <button key={h.key}
                  onClick={() => setGroupHorizon(h.key)}
                  className="flex flex-col items-center px-2.5 py-1 rounded-lg text-xs font-semibold transition-all gap-0.5"
                  style={groupHorizon === h.key
                    ? { background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)", color: "var(--c-indigo-2)" }
                    : { background: "transparent", border: "1px solid var(--border)", color: "var(--tx-3)" }}>
                  <span>{h.label}</span>
                  {hPct != null && (
                    <span style={{ fontSize: "0.58rem", fontWeight: 700, opacity: 0.75, color: hPct >= 80 ? "var(--gold)" : hPct >= 60 ? "var(--tx-3)" : "var(--c-red)" }}>
                      {hPct}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <CoverageBar coverage={data.coverageByHorizon} horizon={groupHorizon} totalBuys={data.totalBuys ?? data.total} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="Achats backtestés"
            value={(data.totalBuys ?? data.total).toLocaleString("fr")}
            border="indigo"
            sub="déclarations AMF"
            tooltip="Nombre total d'achats d'initiés ayant un cours de référence Yahoo Finance valide. Seuls les achats (acquisitions) sont inclus dans l'analyse de signal."
          />
          <KpiCard
            label="Ventes backtestées"
            value={(data.totalSells ?? 0).toLocaleString("fr")}
            border="red"
            sub="signal baissier"
            tooltip="Nombre de cessions d'initiés backtestées. Une vente est un signal baissier : l'insider anticipe une baisse. L'onglet 'Ventes' analyse leur précision."
          />
          <KpiCard
            label={`Retour moyen ${kpiHorizonLabel}`}
            value={fmt(kpiReturn)}
            accent={(kpiReturn ?? 0) > 0}
            border="mint"
            sub="achats dirigeants"
            tooltip={`Rendement moyen des achats d'initiés mesuré ${kpiHorizonLabel} après la date de transaction. Base : tous les achats avec données de cours disponibles pour cet horizon.`}
          />
          <KpiCard
            label={`Médiane ${kpiHorizonLabel}`}
            value={fmt(kpiMedianReturn)}
            accent={(kpiMedianReturn ?? 0) > 0}
            border="mint"
            sub="50% des trades"
            tooltip="La médiane est plus robuste que la moyenne : 50% des trades ont eu un retour inférieur à cette valeur. Un écart important entre moyenne et médiane indique des outliers."
          />
          <KpiCard
            label={`Win rate ${kpiHorizonLabel}`}
            value={kpiWinRate != null ? `${kpiWinRate.toFixed(0)}%` : "·"}
            border="mint"
            sub="trades positifs"
            tooltip="Pourcentage de trades où le cours était en hausse à l'horizon choisi. Un win rate >55% est significatif (le marché fait environ 50% sur longue période)."
          />
          <KpiCard
            label="Sharpe T+90"
            value={g.sharpe90d != null ? g.sharpe90d.toFixed(2) : "·"}
            border="amber"
            sub="ratio risque/retour"
            tooltip="Ratio de Sharpe = rendement moyen / écart-type des retours. Mesure la régularité du signal. >0.5 = bon, >1.0 = excellent, <0 = signal erratique."
          />
        </div>
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
              {t.locked ? (
                <span className="flex items-center gap-1.5">
                  {t.label}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </span>
              ) : t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Vue d'ensemble                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Horizon picker is now above the KPI strip · hidden here */}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                Par rôle de l&apos;insider · {HORIZON_LABEL}
                <InfoTip text="PDG/DG = Président-Directeur Général. CFO/DAF = Directeur Financier. CA/Board = membre du Conseil d'Administration. Les CFO ont historiquement les signaux les plus forts." wide />
              </h3>
              <GroupChart data={data.byRole} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                Par taille de société · {HORIZON_LABEL}
                <InfoTip text="Micro <50M€ · Small <300M€ · Mid <2Md€ · Large <10Md€ · Mega >10Md€. Les small/mid-cap offrent plus d'alpha car moins suivies par les analystes." wide />
              </h3>
              <GroupChart data={data.bySize} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                Par score de signal · {HORIZON_LABEL}
                <InfoTip text="Score composite 0-100 intégrant : rôle insider, montant, % market cap, cluster, DCA, fonction. Un score ≥65 est considéré comme un signal fort." wide />
              </h3>
              <GroupChart data={data.byScore} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                Par montant de la transaction · {HORIZON_LABEL}
                <InfoTip text="Montant total de l'acquisition. Les gros montants (>200k€) révèlent une conviction forte de l'insider, particulièrement significatifs en small/micro-cap." wide />
              </h3>
              <GroupChart data={data.byAmount} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                Saisonnalité · {HORIZON_LABEL}
                <InfoTip text="Répartition des retours par saison. Avr-Mai coïncide avec la publication des résultats annuels : les insiders achètent après avoir confirmé les chiffres en interne." wide />
              </h3>
              <GroupChart data={data.bySeason} horizon={groupHorizon} height={180} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                % de la capitalisation · {HORIZON_LABEL}
                <InfoTip text="Montant / market cap de la société. Un achat >0.5% de la capitalisation par un dirigeant est un signal de conviction forte. >2% est exceptionnel." wide />
              </h3>
              <GroupChart data={data.byMcapPct} horizon={groupHorizon} height={180} />
            </div>
          </div>

          {/* Scatter: score vs return */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
              Score de signal vs retour T+90 (par insider)
              <InfoTip text="Chaque point = un trade historique. L'axe Y = retour 90j après l'achat. Un nuage orienté vers le haut-droite confirme la corrélation score → performance." wide />
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 4, right: 20, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="score" name="Score" tick={{ fontSize: 11, fill: "var(--tx-3)" }} axisLine={{ stroke: "var(--border-med)" }} tickLine={false} label={{ value: "Score", position: "insideBottom", offset: -4, fill: "var(--tx-3)", fontSize: 11 }} />
                <YAxis dataKey="return90d" name="T+90" tickFormatter={(v) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`} tick={{ fontSize: 11, fill: "var(--tx-3)" }} axisLine={{ stroke: "var(--border-med)" }} tickLine={false} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div style={{ background: "var(--bg-raised)", border: "1px solid var(--border-med)", borderRadius: 10, padding: "8px 12px", fontSize: "0.75rem", boxShadow: "0 8px 28px rgba(0,0,0,0.35)" }}>
                        <div style={{ fontWeight: 600, color: "var(--tx-1)", marginBottom: 2 }}>{d.company}</div>
                        <div style={{ color: "var(--tx-2)" }}>Score {d.score} · {d.role}</div>
                        <div style={{ color: retColor(d.return90d), fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>T+90 : {fmt(d.return90d)}</div>
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
        !isAuth ? (
          <FreemiumLock feature="le classement complet des signaux (23 combinaisons)">
            <div className="card p-4 md:p-6">
              <h3 className="text-base font-semibold text-primary mb-4">Classement des signaux</h3>
              <SignalsTable combos={data.signalCombos.slice(0, 8)} />
            </div>
          </FreemiumLock>
        ) : (
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
        )
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Comportements                                              */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "behaviors" && (
        <div className="space-y-6">
          {/* Horizon picker synced with global */}
          <div className="flex flex-wrap items-center gap-2">
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
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                Patterns comportementaux · {HORIZON_LABEL}
                <InfoTip text="DCA = achat répété (≥2 fois en 12 mois). Cluster = 2+ insiders distincts achètent dans les 30 jours. Cascade = 4+ insiders. Premier achat = jamais acheté auparavant." wide />
              </h3>
              <GroupChart data={data.byBehavior} horizon={groupHorizon} height={240} />
            </div>

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                Profondeur du cluster · {HORIZON_LABEL}
                <InfoTip text="Nombre d'insiders distincts ayant acheté la même société dans les 30 jours. Plus il y en a, plus le signal de conviction collective est fort." wide />
              </h3>
              <GroupChart data={data.byClusterDepth} horizon={groupHorizon} height={200} />
            </div>
          </div>

          {/* Behavior detail table */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-primary mb-4">Détail par comportement · tous horizons</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-soft">
                    <th className="text-left pb-2 text-xs text-muted font-medium">Comportement</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">
                      N <InfoTip text="Nombre de trades dans ce groupe." />
                    </th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+30</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+60</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+90</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+160</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+365</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+2ans</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">
                      Win/90j <InfoTip text="% trades positifs à T+90." />
                    </th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">Win/1an</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">
                      Sharpe <InfoTip text="Rendement moyen T+90 / écart-type. Mesure la constance du signal." wide />
                    </th>
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
                <table className="w-full text-sm min-w-[560px]">
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
                      const color = key === "F" ? "tx-violet" : key === "M" ? "tx-brand" : "text-muted";
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
        !isAuth ? (
          <FreemiumLock feature="les 30 meilleures transactions avec noms des entreprises">
            <div className="card p-4 md:p-6">
              <h3 className="text-base font-semibold text-primary mb-2">Top 30 trades historiques</h3>
              <TopTradesTable trades={data.topTrades} />
            </div>
          </FreemiumLock>
        ) : (
          <div className="card p-4 md:p-6">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-primary">Top 30 trades historiques</h3>
              <p className="text-xs text-muted mt-1">
                Les meilleures transactions d&apos;initiés classées par retour sur investissement
              </p>
            </div>
            <TopTradesTable trades={data.topTrades} />
          </div>
        )
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Ventes / Signal baissier                                  */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "sells" && data.sellStats && (
        !isAuth ? (
          <FreemiumLock feature="l'analyse détaillée des signaux de vente par rôle et entreprise">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-2">
              <KpiCard label="Ventes analysées" value={data.sellStats.count.toLocaleString("fr")} />
              <KpiCard label="Précision T+90" value={data.sellStats.accuracy90d != null ? `${data.sellStats.accuracy90d.toFixed(0)}%` : "·"} accent={(data.sellStats.accuracy90d ?? 0) > 50} />
              <KpiCard label="Précision T+365" value={data.sellStats.accuracy365d != null ? `${data.sellStats.accuracy365d.toFixed(0)}%` : "·"} accent={(data.sellStats.accuracy365d ?? 0) > 50} />
              <KpiCard label="Retour T+90" value={data.sellStats.avgReturn90d != null ? `${data.sellStats.avgReturn90d > 0 ? "+" : ""}${data.sellStats.avgReturn90d.toFixed(1)}%` : "·"} />
            </div>
          </FreemiumLock>
        ) : (
        <div className="space-y-6">

          {/* Sell KPI strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Ventes analysées" value={data.sellStats.count.toLocaleString("fr")} />
            <KpiCard
              label="Précision signal T+90"
              value={data.sellStats.accuracy90d != null ? `${data.sellStats.accuracy90d.toFixed(0)}%` : "·"}
              sub="% des ventes suivies d'une baisse"
              accent={(data.sellStats.accuracy90d ?? 0) > 50}
            />
            <KpiCard
              label="Précision signal T+365"
              value={data.sellStats.accuracy365d != null ? `${data.sellStats.accuracy365d.toFixed(0)}%` : "·"}
              sub="% des ventes suivies d'une baisse"
              accent={(data.sellStats.accuracy365d ?? 0) > 50}
            />
            <KpiCard
              label="Retour moyen T+90 (marché)"
              value={data.sellStats.avgReturn90d != null ? `${data.sellStats.avgReturn90d > 0 ? "+" : ""}${data.sellStats.avgReturn90d.toFixed(1)}%` : "·"}
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
                <table className="w-full text-sm min-w-[520px]">
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
                            <span className={`text-xs font-mono font-semibold ${(stats.accuracy90d ?? 0) > 55 ? "tx-neg" : "text-muted"}`}>
                              {stats.accuracy90d != null ? `${stats.accuracy90d.toFixed(0)}%` : "·"}
                            </span>
                          </td>
                          <td className="py-2 text-center">
                            <span className={`text-xs font-mono font-semibold ${(stats.accuracy365d ?? 0) > 55 ? "tx-neg" : "text-muted"}`}>
                              {stats.accuracy365d != null ? `${stats.accuracy365d.toFixed(0)}%` : "·"}
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
              <table className="w-full text-sm min-w-[560px]">
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
                      <td className="py-2 text-xs text-secondary max-w-[140px] truncate">{t.insiderName ?? "·"}</td>
                      <td className="py-2 text-xs text-secondary">{t.role}</td>
                      <td className="py-2 text-center text-xs font-mono text-muted">
                        {new Date(t.transactionDate).toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"2-digit" })}
                      </td>
                      <td className="py-2 text-center text-xs font-mono text-muted">
                        {t.totalAmount ? `${(t.totalAmount / 1000).toFixed(0)} k€` : "·"}
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
        )
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB: Évolution par année                                        */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {tab === "evolution" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
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
            <InfoTip
              text="Les années affichées correspondent à la date de transaction effective (corrigée des erreurs PDF). Seules les années 2006–aujourd'hui avec au moins 2 trades sont affichées."
              wide
            />
          </div>

          {/* Filter to plausible AMF years: 2006 → current year */}
          {(() => {
            const currentYear = new Date().getFullYear();
            const validYears = Object.entries(data.byYear).filter(([y, s]) => {
              const yr = Number(y);
              return yr >= 2006 && yr <= currentYear && s.count >= 2;
            });
            const anomalousCnt = Object.entries(data.byYear).filter(([y]) => {
              const yr = Number(y);
              return yr < 2006 || yr > currentYear;
            }).reduce((acc, [, s]) => acc + s.count, 0);

            return (
              <>
                {anomalousCnt > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
                    style={{ background: "var(--c-amber-bg)", border: "1px solid var(--c-amber-bd)", color: "var(--c-amber)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>
                      <strong>{anomalousCnt} trades</strong> avec une date de transaction aberrante (erreurs de parsing PDF) ont été exclus de cet onglet.
                      Ils sont correctement inclus dans les calculs de performance, seul l'affichage "par année" les masque.
                    </span>
                  </div>
                )}

                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-primary mb-4">
                    Retour moyen par année de transaction · {HORIZON_LABEL}
                  </h3>
                  <GroupChart
                    data={Object.fromEntries(validYears)}
                    horizon={groupHorizon}
                    height={260}
                  />
                </div>

                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-primary mb-4">Détail année par année · tous horizons</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-zebra min-w-[640px]">
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
                          <th className="text-center pb-2 text-xs text-muted font-medium">
                            Win% <InfoTip text="% trades positifs à T+90." />
                          </th>
                          <th className="text-center pb-2 text-xs text-muted font-medium">
                            Sharpe <InfoTip text="Rendement T+90 / écart-type." />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {validYears
                          .sort(([a], [b]) => Number(b) - Number(a))
                          .map(([year, stats]) => {
                            const isCurrentYear = Number(year) === currentYear;
                            return (
                              <tr key={year} className={`border-b border-soft/50 hover:bg-surface/50 transition-colors ${isCurrentYear ? "font-semibold" : ""}`}>
                                <td className="py-2 font-bold font-mono text-primary flex items-center gap-1.5">
                                  {year}
                                  {isCurrentYear && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                                      style={{ background: "var(--c-mint-bg)", color: "var(--c-mint)", border: "1px solid var(--c-mint-bd)" }}>
                                      en cours
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 text-center text-xs font-mono text-secondary">{stats.count.toLocaleString("fr")}</td>
                                <td className="py-2 text-center"><ReturnPill v={stats.avgReturn30d} /></td>
                                <td className="py-2 text-center"><ReturnPill v={stats.avgReturn60d} /></td>
                                <td className="py-2 text-center"><ReturnPill v={stats.avgReturn90d} /></td>
                                <td className="py-2 text-center"><ReturnPill v={stats.avgReturn160d} /></td>
                                <td className="py-2 text-center"><ReturnPill v={stats.avgReturn365d} /></td>
                                <td className="py-2 text-center"><ReturnPill v={stats.avgReturn730d} /></td>
                                <td className="py-2 text-center"><WinBadge w={stats.winRate90d} /></td>
                                <td className="py-2 text-center"><SharpeBadge s={stats.sharpe90d} /></td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted mt-3">
                    Années 2006–{currentYear} · {validYears.length} années avec ≥2 trades affichées.
                    {anomalousCnt > 0 && ` · ${anomalousCnt} trades exclus (dates aberrantes).`}
                  </p>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
