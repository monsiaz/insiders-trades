"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { lp } from "@/lib/locale-path";
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
  insights: Array<{ icon: string; title: string; text: string; highlight: string; titleEn?: string; textEn?: string; highlightEn?: string }>;
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
  isFr = false,
}: {
  coverage: StatsData["coverageByHorizon"] | undefined;
  horizon: Horizon;
  totalBuys: number;
  isFr?: boolean;
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
          {isFr ? "Couverture prix :" : "Price coverage:"}
        </span>
        <span className="text-[11px] font-bold" style={{ color: withPricePct >= 90 ? "var(--gold)" : withPricePct >= 70 ? "var(--tx-2)" : "var(--c-red)" }}>
          {withPricePct}%
        </span>
        <span className="text-[10px]" style={{ color: "var(--tx-4)" }}>
          ({coverage.totalWithPrice.toLocaleString()}/{coverage.totalEligible.toLocaleString()} decl.)
        </span>
        <InfoTip
          text="% of AMF declarations for which Yahoo Finance provided a historical price. Missing ~3% are delisted, bond (ISIN) or recently-listed companies."
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
          {isFr
            ? `ont atteint l'horizon ${horizon === "730d" ? "T+2ans" : `T+${horizon}`}`
            : `reached horizon ${horizon === "730d" ? "T+2y" : `T+${horizon}`}`}
        </span>
        <InfoTip
          text={isFr ? `Pour l'horizon ${horizon === "730d" ? "T+2ans" : `T+${horizon}`}, seuls les trades suffisamment anciens ont des données de cours.` : `For horizon ${horizon === "730d" ? "T+2y" : `T+${horizon}`}, only trades old enough have price data. Recent transactions reduce this figure — that's normal.`}
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

const SIGNAL_CATEGORIES_FR = ["Tous", "Score", "Rôle", "Cluster", "Conviction", "Taille", "Timing"];
const SIGNAL_CATEGORIES_EN = ["All",  "Score", "Role", "Cluster", "Conviction", "Size",   "Timing"];

function SignalsTable({ combos, isFr = false }: { combos: SignalCombo[]; isFr?: boolean }) {
  const SIGNAL_CATEGORIES = isFr ? SIGNAL_CATEGORIES_FR : SIGNAL_CATEGORIES_EN;
  const ALL_LABEL = isFr ? "Tous" : "All";
  const [cat, setCat] = useState(ALL_LABEL);
  const [sortKey, setSortKey] = useState<"sharpe90d" | "sharpe365d" | "avgReturn365d" | "winRate365d">("sharpe90d");
  const [horizon, setHorizon] = useState<Horizon>("90d");

  const filtered = (cat === ALL_LABEL ? combos : combos.filter((c) => {
    // Map EN category back to FR for data filtering (data stored in FR)
    const catIdx = SIGNAL_CATEGORIES.indexOf(cat);
    const frCat = catIdx >= 0 ? SIGNAL_CATEGORIES_FR[catIdx] : cat;
    return c.category === frCat;
  }))
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
          <span className="text-xs text-muted">{isFr ? "Trier par :" : "Sort by:"}</span>
          {[
            { k: "sharpe90d",    label: isFr ? "Sharpe 90j" : "Sharpe 90d" },
            { k: "sharpe365d",   label: isFr ? "Sharpe 1an" : "Sharpe 1y" },
            { k: "avgReturn365d",label: isFr ? "Retour 1an" : "Return 1y" },
            { k: "winRate365d",  label: isFr ? "Win rate 1an" : "Win rate 1y" },
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
                <InfoTip wide text={isFr
                  ? `Rendement ${horizonLabel} d'un trade moyen du groupe. Entrée : cours au lendemain de la publication AMF (pubDate+1). Sortie : cours ${horizonLabel === "T+30" ? "30" : horizonLabel === "T+60" ? "60" : horizonLabel === "T+90" ? "90" : horizonLabel === "T+160" ? "160" : horizonLabel === "T+365" ? "365" : "730"} jours calendaires plus tard. Valeur = moyenne arithmétique des rendements individuels. Exemple : +6% = un trade moyen du groupe a progressé de 6% sur la fenêtre.`
                  : `Average ${horizonLabel} return per trade in this group. Entry: close the day after the AMF filing (pubDate+1). Exit: close ${horizonLabel === "T+30" ? "30" : horizonLabel === "T+60" ? "60" : horizonLabel === "T+90" ? "90" : horizonLabel === "T+160" ? "160" : horizonLabel === "T+365" ? "365" : "730"} calendar days later. Value = arithmetic mean of individual returns. Example: +6% = the average trade in this group gained 6% over the window.`} />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                T+365
                <InfoTip wide text={isFr
                  ? "Rendement moyen à 1 an d'un trade du groupe (entrée pubDate+1, sortie 365j après). C'est un rendement absolu par trade — il ne mesure pas un portefeuille annualisé. Pour le CAGR d'un portefeuille simulé, voir la section combinaisons."
                  : "Average 1-year return per trade in this group (entry pubDate+1, exit 365d later). Absolute per-trade return — NOT an annualised portfolio yield. For simulated portfolio CAGR, see the combinations section."} />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                T+2ans
                <InfoTip wide text={isFr
                  ? "Rendement moyen à 2 ans. Affiché uniquement si ≥ 5 trades ont 2 ans de recul, sinon la moyenne est trop sensible aux outliers."
                  : "Average 2-year return. Only shown if ≥ 5 trades have 2 years of history, otherwise the mean is too outlier-sensitive."} />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                Win%/90j
                <InfoTip wide text={isFr
                  ? "% de trades du groupe avec un rendement strictement positif à T+90 (entrée pubDate+1). Référence marché : le CAC 40 clôture en hausse ~55-60% des fenêtres glissantes de 90j historiquement (biais haussier). Un Win% > 65% est donc significatif pour ce signal."
                  : "% of trades in this group with a strictly positive return at T+90 (entry pubDate+1). Market baseline: the CAC 40 closes up in ~55-60% of rolling 90d windows historically (bullish bias). A Win% > 65% is therefore meaningful for this signal."} />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                Win%/1an
                <InfoTip wide text={isFr
                  ? "% de trades du groupe avec un rendement strictement positif à T+365 (sortie 1 an après la publication AMF)."
                  : "% of trades in this group with a strictly positive return at T+365 (exit 1 year after the AMF filing)."} />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                {isFr ? "Ratio R/σ 90j" : "Return/Risk 90d"}
                <InfoTip text={isFr
                  ? "Retour moyen T+90 / écart-type (ratio cross-sectionnel sur l'ensemble des trades, non annualisé, sans taux sans risque). Ce n'est pas un Sharpe de série temporelle au sens académique. Valeur > 0.5 = signal régulier, > 1.0 = excellent, < 0 = signal erratique."
                  : "Mean T+90 return / std dev (cross-sectional ratio across all trades, not annualised, no risk-free rate). This is not a time-series Sharpe in the academic sense. Value > 0.5 = consistent signal, > 1.0 = excellent, < 0 = erratic."} wide />
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
        {isFr
          ? `${filtered.length} signaux affichés · Sharpe = rendement moyen / écart-type · Win% = % de trades positifs`
          : `${filtered.length} signals shown · Sharpe = avg return / std dev · Win% = % positive trades`}
      </p>
    </div>
  );
}

// ── Top trades table ───────────────────────────────────────────────────────

function TopTradesTable({ trades, isFr = false }: { trades: StatsData["topTrades"]; isFr?: boolean }) {
  const [horizon, setHorizon] = useState<Horizon>("365d");

  const sorted = [...trades].sort((a, b) => {
    const aV = a[`return${horizon}` as keyof typeof a] as number | null ?? a.return90d ?? 0;
    const bV = b[`return${horizon}` as keyof typeof b] as number | null ?? b.return90d ?? 0;
    return bV - aV;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{isFr ? "Trier par horizon :" : "Sort by horizon:"}</span>
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
              <th className="text-left pb-2 text-xs text-muted font-medium">{isFr ? "Société" : "Company"}</th>
              <th className="text-left pb-2 text-xs text-muted font-medium">Insider</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">Date</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">{isFr ? "Montant" : "Amount"}</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">Score</th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                T+30
                <InfoTip wide text={isFr
                  ? "Rendement de ce trade 30 jours après la publication AMF (entrée pubDate+1)."
                  : "Return of this trade 30 days after the AMF filing (entry pubDate+1)."} />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                T+90
                <InfoTip wide text={isFr
                  ? "Rendement à 3 mois · entrée lendemain publication AMF, sortie 90j calendaires après. C'est l'horizon de hold recommandé par la stratégie Sigma."
                  : "3-month return · entry day after AMF filing, exit 90 calendar days later. This is the hold horizon recommended by the Sigma strategy."} />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                T+365
                <InfoTip wide text={isFr
                  ? "Rendement à 1 an de ce trade (entrée pubDate+1, sortie 365j après). Rendement absolu par trade, pas une annualisation."
                  : "1-year return of this trade (entry pubDate+1, exit 365d later). Absolute per-trade return, not an annualisation."} />
              </th>
              <th className="text-center pb-2 text-xs text-muted font-medium">
                {isFr ? "T+2ans" : "T+2y"}
                <InfoTip wide text={isFr
                  ? "Rendement à 2 ans. Disponible uniquement pour les déclarations assez anciennes (pubDate < il y a 2 ans)."
                  : "2-year return. Only available for filings old enough (pubDate < 2 years ago)."} />
              </th>
              <th className="text-left pb-2 text-xs text-muted font-medium">Tags</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={i} className="border-b border-soft/50 hover:bg-surface/50 transition-colors">
                <td className="py-2 text-muted text-xs pr-1">{i + 1}</td>
                <td className="py-2 pr-2">
                  <Link
                    href={lp(isFr, `/company/${t.company.slug}`)}
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

export default function BacktestDashboard({ initialData, locale }: { initialData?: StatsData; locale?: string }) {
  const pathname = usePathname();
  const isFr = (locale ?? (pathname.startsWith("/fr") ? "fr" : "en")) === "fr";
  const numLocale = isFr ? "fr-FR" : "en-GB";

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
        <p className="text-secondary text-sm">{isFr ? "Calcul des statistiques de backtest…" : "Computing backtest statistics…"}</p>
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="text-center py-24 text-muted">
        <p className="text-lg font-medium">{isFr ? "Aucune donnée de backtest disponible." : "No backtest data available."}</p>
        <p className="text-sm mt-2">{isFr ? "Lancez le pipeline de calcul en local pour initialiser les données." : "Run the compute pipeline locally to initialize data."}</p>
      </div>
    );
  }

  const g = data.overallBuys ?? data.overall; // KPIs show buy-only stats

  // Dynamic KPI values: respond to the groupHorizon picker
  const kpiReturn = getReturn(g, groupHorizon);
  // Win rate only available at T+90 and T+365 — for other horizons, show the nearest available
  const kpiWinRate = (groupHorizon === "365d" || groupHorizon === "730d") ? g.winRate365d : g.winRate90d;
  // The actual horizon used for the win rate label (to avoid misleading "Win rate T+30" when T+90 data is shown)
  const kpiWinRateHorizonLabel = (groupHorizon === "365d" || groupHorizon === "730d") ? (isFr ? "T+365" : "T+365") : "T+90";
  const kpiMedianReturn = groupHorizon === "90d" ? g.medianReturn90d : groupHorizon === "365d" ? g.medianReturn365d : null;
  const kpiHorizonLabel = HORIZONS.find((h) => h.key === groupHorizon)?.label ?? groupHorizon;

  const isAuth = data.isAuthenticated;

  const tabs: { key: Tab; label: string; locked?: boolean }[] = [
    { key: "overview",  label: isFr ? "Vue d'ensemble" : "Overview" },
    { key: "signals",   label: isFr ? "Signaux" : "Signals",          locked: !isAuth },
    { key: "behaviors", label: isFr ? "Comportements" : "Behaviours" },
    { key: "trades",    label: "Top trades",                           locked: !isAuth },
    { key: "sells",     label: isFr ? `Ventes (${data.totalSells ?? 0})` : `Sales (${data.totalSells ?? 0})`, locked: !isAuth },
    { key: "evolution", label: isFr ? "Par année" : "By year" },
  ];

  const HORIZON_LABEL = HORIZONS.find((h) => h.key === groupHorizon)?.label ?? groupHorizon;

  return (
    <div className="space-y-6">

      {/* ─ Header with freshness indicator ────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--gold)" }} />
          <span className="text-xs font-semibold" style={{ color: "var(--tx-3)" }}>
            {isFr ? "Backtest sur données réelles AMF" : "Backtest on real AMF data"}
          </span>
          <InfoTip text={isFr ? "Les résultats sont calculés à partir des cours historiques Yahoo Finance sur 20 ans. Le calcul incrémental tourne quotidiennement en production." : "Results are computed from Yahoo Finance 20-year historical prices. Incremental calculation runs daily in production."} wide />
        </div>
        {data.lastComputedAt && (
          <span className="text-[11px] px-2.5 py-1 rounded-lg" style={{ background: "var(--bg-raised)", color: "var(--tx-4)", border: "1px solid var(--border)" }}>
            {isFr ? "Dernière mise à jour : " : "Last updated: "}{new Date(data.lastComputedAt).toLocaleDateString(numLocale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* ─ KPI strip · values update with the horizon picker ─────────── */}
      <div className="space-y-3">
        {/* Horizon picker + coverage */}
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--tx-4)" }}>{isFr ? "Horizon :" : "Horizon:"}</span>
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
          <CoverageBar coverage={data.coverageByHorizon} horizon={groupHorizon} totalBuys={data.totalBuys ?? data.total} isFr={isFr} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label={isFr ? "Achats backtestés" : "Backtested buys"}
            value={(data.totalBuys ?? data.total).toLocaleString(numLocale)}
            border="indigo"
            sub={isFr ? "déclarations AMF" : "AMF declarations"}
            tooltip={isFr ? "Nombre total d'achats d'initiés ayant un cours de référence Yahoo Finance valide." : "Total insider buys with a valid Yahoo Finance price reference."}
          />
          <KpiCard
            label={isFr ? "Ventes backtestées" : "Backtested sales"}
            value={(data.totalSells ?? 0).toLocaleString(numLocale)}
            border="red"
            sub={isFr ? "signal baissier" : "bearish signal"}
            tooltip={isFr ? "Nombre de cessions d'initiés backtestées. Une vente est un signal baissier." : "Number of backtested insider sales. A sale is a bearish signal."}
          />
          <KpiCard
            label={isFr ? `Retour moyen ${kpiHorizonLabel}` : `Avg. return ${kpiHorizonLabel}`}
            value={fmt(kpiReturn)}
            accent={(kpiReturn ?? 0) > 0}
            border="mint"
            sub={isFr ? "achats dirigeants" : "insider buys"}
            tooltip={isFr ? `Rendement moyen des achats d'initiés mesuré ${kpiHorizonLabel} après la date de transaction.` : `Avg. return of insider buys measured ${kpiHorizonLabel} after the transaction date.`}
          />
          <KpiCard
            label={isFr ? `Médiane ${kpiHorizonLabel}` : `Median ${kpiHorizonLabel}`}
            value={fmt(kpiMedianReturn)}
            accent={(kpiMedianReturn ?? 0) > 0}
            border="mint"
            sub={isFr ? "50% des trades" : "50% of trades"}
            tooltip={isFr ? "La médiane est plus robuste que la moyenne : 50% des trades ont eu un retour inférieur à cette valeur." : "The median is more robust than the mean: 50% of trades returned less than this value."}
          />
          <KpiCard
            label={`Win rate ${kpiWinRateHorizonLabel}`}
            value={kpiWinRate != null ? `${kpiWinRate.toFixed(0)}%` : "·"}
            border="mint"
            sub={isFr ? "trades positifs" : "positive trades"}
            tooltip={isFr
              ? `% de trades avec un cours en hausse à ${kpiWinRateHorizonLabel} après la transaction. Disponible uniquement à T+90 et T+365. Référence marché : le CAC 40 clôture en hausse ~55-60% des fois sur ces horizons sur longue période — un taux >65% est donc significatif.`
              : `% of trades where the price was up at ${kpiWinRateHorizonLabel} after the transaction. Available only at T+90 and T+365. Market reference: the CAC 40 closes higher ~55-60% of the time on these horizons over the long run — so a rate >65% is genuinely significant.`}
          />
          <KpiCard
            label="Sharpe T+90"
            value={g.sharpe90d != null ? g.sharpe90d.toFixed(2) : "·"}
            border="amber"
            sub={isFr ? "retour / σ (90j)" : "return / σ (90d)"}
            tooltip={isFr
              ? "Retour moyen T+90 divisé par l'écart-type — ratio cross-sectionnel sur les trades (non annualisé, sans taux sans risque). Mesure la régularité du signal. >0.5 = bon, >1.0 = excellent. Ne pas confondre avec le ratio de Sharpe de portefeuille."
              : "Mean T+90 return divided by std dev — cross-sectional ratio across trades (not annualised, no risk-free rate). Measures signal consistency. >0.5 = good, >1.0 = excellent. Not to be confused with a portfolio Sharpe ratio."}
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
                <div className="font-semibold text-primary text-sm mb-1">
                  {isFr ? ins.title : (ins.titleEn ?? ins.title)}
                </div>
                <div className="text-xs text-secondary leading-relaxed">
                  {isFr ? ins.text : (ins.textEn ?? ins.text)}
                </div>
                <div className="mt-2">
                  <span
                    className="inline-block text-xs font-bold font-mono px-2 py-0.5 rounded"
                    style={{ background: "var(--c-mint-bg)", color: "var(--c-mint)" }}
                  >
                    {isFr ? ins.highlight : (ins.highlightEn ?? ins.highlight)}
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
                {isFr ? "Par rôle de l'insider" : "By insider role"} · {HORIZON_LABEL}
                <InfoTip text={isFr ? "PDG/DG = Président-Directeur Général. CFO/DAF = Directeur Financier. CA/Board = membre du Conseil d'Administration." : "PDG/DG = Chairman & CEO. CFO/DAF = Chief Financial Officer. CA/Board = Board Member."} wide />
              </h3>
              <GroupChart data={data.byRole} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                {isFr ? "Par taille de société" : "By company size"} · {HORIZON_LABEL}
                <InfoTip text={isFr ? "Micro <50M€ · Small 50-300M€ · Sweet 300M-1Md€ · Mid 1-3Md€ · Large 3-15Md€ · Mega >15Md€ (taxonomie v3, 6 buckets)." : "Micro <€50M · Small €50-300M · Sweet €300M-1Bn · Mid €1-3Bn · Large €3-15Bn · Mega >€15Bn (v3 taxonomy, 6 buckets)."} wide />
              </h3>
              <GroupChart data={data.bySize} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                {isFr ? "Par score de signal" : "By signal score"} · {HORIZON_LABEL}
                <InfoTip text={isFr ? "Score composite v3 · 0-100, 10 composantes : cluster directionnel ±30j, % market cap, track record dirigeant (shrinkage), rôle, composite Yahoo gated, % flux, DCA, analyst-contrarian, conviction cumulée, fondamentaux. Un score ≥65 reste considéré comme un signal fort en v3." : "v3 composite score · 0-100, 10 components: directional cluster ±30d, % market cap, insider track record (shrinkage), role, gated Yahoo composite, % flow, DCA, analyst-contrarian, cumulative conviction, fundamentals. A score ≥65 is still considered a strong signal in v3."} wide />
              </h3>
              <GroupChart data={data.byScore} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                {isFr ? "Par montant de la transaction" : "By transaction amount"} · {HORIZON_LABEL}
                <InfoTip text={isFr ? "Montant total de l'acquisition. Les gros montants (>200k€) révèlent une conviction forte de l'insider." : "Total acquisition amount. Large amounts (>€200k) reveal strong insider conviction, particularly significant for small/micro-cap."} wide />
              </h3>
              <GroupChart data={data.byAmount} horizon={groupHorizon} height={200} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                {isFr ? "Saisonnalité" : "Seasonality"} · {HORIZON_LABEL}
                <InfoTip text={isFr ? "Répartition des retours par saison." : "Return distribution by season. Apr–May coincides with annual results publication: insiders buy after internally confirming the figures."} wide />
              </h3>
              <GroupChart data={data.bySeason} horizon={groupHorizon} height={180} />
            </div>
            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                {isFr ? "% de la capitalisation" : "% of market cap"} · {HORIZON_LABEL}
                <InfoTip text={isFr ? "Montant / market cap. Un achat >0.5% de la capitalisation par un dirigeant est un signal de conviction forte." : "Amount / market cap. A buy >0.5% of market cap by an insider is a strong conviction signal. >2% is exceptional."} wide />
              </h3>
              <GroupChart data={data.byMcapPct} horizon={groupHorizon} height={180} />
            </div>
          </div>

          {/* Scatter: score vs return */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
              {isFr ? "Score de signal vs retour T+90 (par insider)" : "Signal score vs T+90 return (per insider)"}
              <InfoTip text={isFr ? "Chaque point = un trade historique. L'axe Y = retour 90j après l'achat." : "Each point = one historical trade. Y-axis = 90d return after purchase. A cloud trending up-right confirms the score → performance correlation."} wide />
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 4, right: 20, bottom: 4, left: 8 }}>
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
          <FreemiumLock feature={isFr ? "le classement complet des signaux (23 combinaisons)" : "the full signal ranking (23 combinations)"}>
            <div className="card p-4 md:p-6">
              <h3 className="text-base font-semibold text-primary mb-4">{isFr ? "Classement des signaux" : "Signal ranking"}</h3>
              <SignalsTable combos={data.signalCombos.slice(0, 8)} isFr={isFr} />
            </div>
          </FreemiumLock>
        ) : (
          <div className="card p-4 md:p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-primary">{isFr ? "Classement des signaux" : "Signal ranking"}</h3>
                <p className="text-xs text-muted mt-1">
                  {data.signalCombos.length} {isFr ? "combinaisons analysées sur" : "combinations across"} {data.total} {isFr ? "transactions historiques · triées par Sharpe (régularité du signal)" : "historical transactions · sorted by Sharpe (signal consistency)"}
                </p>
              </div>
            </div>
            <div
              className="mb-4 rounded border border-soft bg-surface p-3 text-xs leading-relaxed text-secondary"
              style={{ borderLeft: "2px solid var(--gold)" }}
            >
              <strong className="text-primary">
                {isFr ? "Comment lire le tableau" : "How to read the table"}
              </strong>{" "}
              ·{" "}
              {isFr ? (
                <>Chaque ligne agrège <em>n</em> trades historiques qui matchent le filtre (ex : &laquo; Cluster 2+ insiders &raquo;).{" "}
                <strong>T+90</strong> = rendement moyen 3 mois après la publication AMF (entrée au cours du lendemain, sortie 90 jours calendaires plus tard).{" "}
                <strong>T+365</strong> = même principe sur 1 an. Ce sont des rendements <strong>absolus par trade</strong>, pas annualisés.{" "}
                <strong>Win%</strong> = proportion de trades avec un rendement positif (rappel : le marché clôt en hausse ~55-60% des fenêtres 90j, tout ce qui est au-dessus est un vrai signal).{" "}
                <strong>Ratio R/σ</strong> = rendement moyen ÷ écart-type · plus le ratio est haut, plus le signal est régulier.{" "}
                Survolez l&apos;icône <span className="font-mono">?</span> sur chaque en-tête pour le détail.</>
              ) : (
                <>Each row aggregates <em>n</em> historical trades matching the filter (e.g. &quot;Cluster 2+ insiders&quot;).{" "}
                <strong>T+90</strong> = average return 3 months after the AMF filing (entry at the next day&apos;s close, exit 90 calendar days later).{" "}
                <strong>T+365</strong> = same principle over 1 year. These are <strong>absolute per-trade returns</strong>, not annualised.{" "}
                <strong>Win%</strong> = share of trades with a positive return (reminder: the market closes up in ~55-60% of 90d windows historically, anything above that is a real signal).{" "}
                <strong>R/σ ratio</strong> = mean return ÷ std dev · the higher, the steadier the signal.{" "}
                Hover the <span className="font-mono">?</span> icon on each header for details.</>
              )}
            </div>
            <SignalsTable combos={data.signalCombos} isFr={isFr} />
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
            <span className="text-xs text-muted">{isFr ? "Horizon :" : "Horizon:"}</span>
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
                {isFr ? "Patterns comportementaux" : "Behavioural patterns"} · {HORIZON_LABEL}
                <InfoTip text={isFr ? "DCA = achat répété (≥2 fois en 12 mois). Cluster = 2+ insiders distincts achètent dans les 30 jours." : "DCA = repeated buy (≥2 times in 12 months). Cluster = 2+ distinct insiders buy within 30 days. Cascade = 4+ insiders."} wide />
              </h3>
              <GroupChart data={data.byBehavior} horizon={groupHorizon} height={240} />
            </div>

            <div className="card p-4">
              <h3 className="text-sm font-semibold text-primary mb-4 flex items-center gap-1">
                {isFr ? "Profondeur du cluster" : "Cluster depth"} · {HORIZON_LABEL}
                <InfoTip text={isFr ? "Nombre d'insiders distincts ayant acheté la même société dans les 30 jours." : "Number of distinct insiders who bought the same company within 30 days. More insiders = stronger collective conviction signal."} wide />
              </h3>
              <GroupChart data={data.byClusterDepth} horizon={groupHorizon} height={200} />
            </div>
          </div>

          {/* Behavior detail table */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-primary mb-4">{isFr ? "Détail par comportement · tous horizons" : "Detail by behaviour · all horizons"}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-soft">
                    <th className="text-left pb-2 text-xs text-muted font-medium">{isFr ? "Comportement" : "Behaviour"}</th>
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
                      {isFr ? "Retour/σ" : "Return/σ"} <InfoTip text={isFr ? "Retour moyen T+90 / écart-type (ratio cross-sectionnel, non annualisé). >0.5 = signal régulier." : "Mean T+90 / std dev (cross-sectional ratio, not annualised). >0.5 = consistent signal."} wide />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Overall first */}
                  <tr className="border-b border-mint/20 bg-mint/5">
                    <td className="py-2 font-semibold text-primary text-sm">{isFr ? "Ensemble (baseline)" : "Overall (baseline)"}</td>
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
              <h3 className="text-sm font-semibold text-primary mb-1">{isFr ? "Analyse Hommes vs Femmes" : "Men vs Women analysis"}</h3>
              <p className="text-xs text-muted mb-4">{isFr ? "Performance des achats d'initiés selon le genre du dirigeant" : "Insider buy performance by executive gender"}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-soft">
                      <th className="text-left pb-2 text-xs text-muted font-medium">{isFr ? "Genre" : "Gender"}</th>
                      <th className="text-center pb-2 text-xs text-muted font-medium">{isFr ? "Achats" : "Buys"}</th>
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
                      const label = key === "M" ? (isFr ? "Hommes" : "Men") : key === "F" ? (isFr ? "Femmes" : "Women") : (isFr ? "Non déterminé" : "Unknown");
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
                {isFr ? "Genre inféré depuis la fonction (formes féminines) et les prénom/civilité des déclarations." : "Gender inferred from role wording (feminine forms) and first name / title in AMF declarations."}
                {" "}{data.byGender.F.count} {isFr ? "femmes · " : "women · "}{data.byGender.M.count} {isFr ? "hommes identifiés." : "men identified."}
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
              <h3 className="text-base font-semibold text-primary mb-2">{isFr ? "Top 30 trades historiques" : "Top 30 historical trades"}</h3>
              <TopTradesTable trades={data.topTrades} isFr={isFr} />
            </div>
          </FreemiumLock>
        ) : (
          <div className="card p-4 md:p-6">
            <div className="mb-4">
              <h3 className="text-base font-semibold text-primary">{isFr ? "Top 30 trades historiques" : "Top 30 historical trades"}</h3>
              <p className="text-xs text-muted mt-1">
                {isFr ? "Les meilleures transactions d'initiés classées par retour sur investissement" : "Best insider transactions ranked by return on investment"}
              </p>
            </div>
            <TopTradesTable trades={data.topTrades} isFr={isFr} />
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
              <KpiCard label={isFr ? "Ventes analysées" : "Analysed sales"} value={data.sellStats.count.toLocaleString(numLocale)} />
              <KpiCard label={isFr ? "Précision T+90" : "Accuracy T+90"} value={data.sellStats.accuracy90d != null ? `${data.sellStats.accuracy90d.toFixed(0)}%` : "·"} accent={(data.sellStats.accuracy90d ?? 0) > 50} />
              <KpiCard label={isFr ? "Précision T+365" : "Accuracy T+365"} value={data.sellStats.accuracy365d != null ? `${data.sellStats.accuracy365d.toFixed(0)}%` : "·"} accent={(data.sellStats.accuracy365d ?? 0) > 50} />
              <KpiCard label={isFr ? "Retour T+90" : "Return T+90"} value={data.sellStats.avgReturn90d != null ? `${data.sellStats.avgReturn90d > 0 ? "+" : ""}${data.sellStats.avgReturn90d.toFixed(1)}%` : "·"} />
            </div>
          </FreemiumLock>
        ) : (
        <div className="space-y-6">

          {/* Sell KPI strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label={isFr ? "Ventes analysées" : "Analysed sales"} value={data.sellStats.count.toLocaleString(numLocale)} />
            <KpiCard
              label={isFr ? "Précision signal T+90" : "Signal accuracy T+90"}
              value={data.sellStats.accuracy90d != null ? `${data.sellStats.accuracy90d.toFixed(0)}%` : "·"}
              sub="% des ventes suivies d'une baisse"
              accent={(data.sellStats.accuracy90d ?? 0) > 50}
            />
            <KpiCard
              label={isFr ? "Précision signal T+365" : "Signal accuracy T+365"}
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
                    <th className="text-left pb-2 text-xs text-muted font-medium">{isFr ? "Société" : "Company"}</th>
                    <th className="text-left pb-2 text-xs text-muted font-medium">{isFr ? "Initié" : "Insider"}</th>
                    <th className="text-left pb-2 text-xs text-muted font-medium">{isFr ? "Rôle" : "Role"}</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">Date</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">{isFr ? "Montant" : "Amount"}</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+30</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+90</th>
                    <th className="text-center pb-2 text-xs text-muted font-medium">T+365</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sellStats.topSellsTrades.map((t, i) => (
                    <tr key={i} className="border-b border-soft/50 hover:bg-surface/50">
                      <td className="py-2 font-medium text-primary max-w-[160px] truncate">
                        <a href={lp(isFr, `/company/${t.company.slug}`)} className="hover:text-mint">{t.company.name}</a>
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
            <span className="text-xs text-muted">{isFr ? "Horizon :" : "Horizon:"}</span>
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
                  <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-xs"
                    style={{ background: "var(--c-amber-bg)", border: "1px solid var(--c-amber-bd)", color: "var(--c-amber)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: "1px" }}>
                      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span style={{ minWidth: 0, overflowWrap: "break-word" }}>
                      <strong>{anomalousCnt} trades</strong> avec une date de transaction aberrante (erreurs de parsing PDF) ont été exclus de cet onglet.
                      Ils sont correctement inclus dans les calculs de performance, seul l&apos;affichage &quot;par année&quot; les masque.
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
                            {isFr ? "Retour/σ" : "Return/σ"} <InfoTip text={isFr ? "Retour moyen T+90 / écart-type (cross-sectionnel, non annualisé)." : "Mean T+90 / std dev (cross-sectional, not annualised)."} />
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
                                      {isFr ? "en cours" : "ongoing"}
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

      {/* ── Disclaimer réglementaire ─────────────────────────────────────────── */}
      <div style={{
        marginTop: "32px", padding: "14px 18px", borderRadius: "8px",
        background: "var(--bg-raised)", border: "1px solid var(--border)",
        fontSize: "0.72rem", color: "var(--tx-4)", lineHeight: 1.6,
      }}>
        <strong style={{ color: "var(--tx-3)" }}>
          {isFr ? "⚠ Avertissement méthodologique" : "⚠ Methodological disclaimer"}
        </strong>
        {" · "}{isFr ? (
          <>Les rendements affichés sont des <strong>moyennes arithmétiques</strong> calculées sur des trades individuels depuis la <strong>date de transaction de l&apos;initié</strong> (non la date de publication AMF). Le ratio Retour/σ n&apos;est pas un ratio de Sharpe annualisé au sens académique (pas de taux sans risque, pas de dimension temporelle). Les performances passées ne préjugent pas des performances futures. Cet outil est à usage analytique uniquement — il ne constitue pas un conseil en investissement.</>
        ) : (
          <>Returns shown are <strong>arithmetic averages</strong> across individual trades measured from the <strong>insider&apos;s transaction date</strong> (not the AMF publication date). The Return/σ ratio is not an annualised Sharpe ratio in the academic sense (no risk-free rate, no time dimension). Past performance does not predict future results. This tool is for analytical use only — it does not constitute investment advice.</>
        )}
      </div>
    </div>
  );
}
