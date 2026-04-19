"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { DeclarationCard } from "./DeclarationCard";
import { FileText, Building2, User, TrendingUp, TrendingDown } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Stats {
  totalDeclarations: number;
  totalCompanies: number;
  totalInsiders: number;
  totalBuys: number;
  totalSells: number;
}

interface TopCompany {
  companyId: string;
  count: number;
  totalAmount: number | null;
  company: { name: string; slug: string; marketCap: number | null } | null;
}

interface TopInsider {
  insiderName: string | null;
  count: number;
  totalAmount: number | null;
  insider: { name: string; slug: string } | null;
}

// Loosely typed to match DeclarationCard's props
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Declaration = any;

interface HomeData {
  stats: Stats;
  recentDeclarations: Declaration[];
  topCompanies: TopCompany[];
  topInsiders: TopInsider[];
  updatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtAmount(n: number | null | undefined): string {
  if (!n) return "–";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M€`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k€`;
  return `${n.toFixed(0)}€`;
}

function fmtMcap(n: number | null | undefined): string {
  if (!n) return "";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M€`;
  return "";
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `il y a ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  return `il y a ${hours}h`;
}

const REFRESH_INTERVAL = 60_000; // 60 seconds

// ── Main component ─────────────────────────────────────────────────────────

export function HomeLive({ initial }: { initial: HomeData }) {
  const [data, setData] = useState<HomeData>(initial);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(initial.updatedAt);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/home-data", { cache: "no-store" });
      if (res.ok) {
        const next = await res.json();
        setData(next);
        setLastRefresh(next.updatedAt);
      }
    } catch {
      // silent fail — keep existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(refresh, REFRESH_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  const { stats, recentDeclarations, topCompanies, topInsiders } = data;

  return (
    <>
      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-14 animate-fade-in-delay">
        <StatTile label="Déclarations" value={stats.totalDeclarations.toLocaleString("fr-FR")} icon={<FileText size={15} strokeWidth={1.8} />} accent="indigo" />
        <StatTile label="Sociétés" value={stats.totalCompanies.toLocaleString("fr-FR")} icon={<Building2 size={15} strokeWidth={1.8} />} accent="violet" />
        <StatTile label="Dirigeants" value={stats.totalInsiders.toLocaleString("fr-FR")} icon={<User size={15} strokeWidth={1.8} />} accent="slate" className="hidden sm:flex" />
        <StatTile label="Achats" value={stats.totalBuys.toLocaleString("fr-FR")} icon={<TrendingUp size={15} strokeWidth={1.8} />} accent="emerald" />
        <StatTile label="Ventes" value={stats.totalSells.toLocaleString("fr-FR")} icon={<TrendingDown size={15} strokeWidth={1.8} />} accent="rose" />
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-14">
        {/* Top 30 companies */}
        <section className="glass-card-static rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">Sociétés les + actives</h2>
              <p className="text-xs text-slate-500 mt-0.5">Volume déclaré, 90 derniers jours</p>
            </div>
            <Link href="/companies" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
              Voir tout →
            </Link>
          </div>
          <ol className="space-y-0.5">
            {topCompanies.map((row, i) => (
              <li key={row.companyId}>
                <Link
                  href={row.company ? `/company/${row.company.slug}` : "#"}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <span className="text-xs font-mono text-slate-600 w-5 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                        {row.company?.name ?? "—"}
                      </span>
                      {row.company?.marketCap && (
                        <span className="text-[10px] text-slate-600 shrink-0">{fmtMcap(row.company.marketCap)}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      {row.count} transaction{row.count > 1 ? "s" : ""}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-emerald-400 tabular-nums shrink-0">
                    {fmtAmount(row.totalAmount)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {/* Top 30 insiders */}
        <section className="glass-card-static rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">Dirigeants les + actifs</h2>
              <p className="text-xs text-slate-500 mt-0.5">Volume total déclaré, tous temps</p>
            </div>
            <Link href="/insiders" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
              Voir tout →
            </Link>
          </div>
          <ol className="space-y-0.5">
            {topInsiders.map((row, i) => (
              <li key={row.insiderName}>
                <Link
                  href={row.insider ? `/insider/${row.insider.slug}` : "#"}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <span className="text-xs font-mono text-slate-600 w-5 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors block">
                      {row.insiderName}
                    </span>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      {row.count} transaction{row.count > 1 ? "s" : ""}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-indigo-400 tabular-nums shrink-0">
                    {fmtAmount(row.totalAmount)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Recent declarations */}
      {recentDeclarations.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white tracking-tight">
              Dernières transactions
            </h2>
            <div className="flex items-center gap-3">
              {/* Live indicator */}
              <button
                onClick={refresh}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50"
                title="Rafraîchir"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${loading ? "bg-amber-400 animate-pulse" : "bg-emerald-500 animate-pulse"}`}
                />
                {loading ? "Actualisation…" : `Actualisé ${timeAgo(lastRefresh)}`}
              </button>
              <Link
                href="/companies"
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
              >
                Toutes les sociétés →
              </Link>
            </div>
          </div>
          <div className="space-y-2">
            {recentDeclarations.map((decl: Declaration) => (
              <DeclarationCard key={decl.id} declaration={decl} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── StatTile ───────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  icon,
  accent,
  className = "",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "indigo" | "violet" | "emerald" | "rose" | "slate";
  className?: string;
}) {
  const accentMap = {
    indigo: "from-indigo-500/10 to-indigo-500/5 border-indigo-500/15",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/15",
    emerald: "from-emerald-500/10 to-emerald-500/5 border-emerald-500/15",
    rose: "from-rose-500/10 to-rose-500/5 border-rose-500/15",
    slate: "from-slate-500/10 to-slate-500/5 border-slate-500/15",
  };
  return (
    <div className={`glass-card-static rounded-2xl p-4 bg-gradient-to-br ${accentMap[accent]} flex flex-col gap-2 ${className}`}>
      <span className="opacity-60">{icon}</span>
      <div className="stat-number">{value}</div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
    </div>
  );
}
