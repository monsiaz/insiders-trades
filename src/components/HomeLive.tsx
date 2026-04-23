"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DeclarationCard } from "./DeclarationCard";
import { CompanyAvatar } from "./CompanyBadge";
import { FileText, Building2, User, TrendingUp, TrendingDown } from "lucide-react";

// ── Data freshness bar ─────────────────────────────────────────────────────

function DataFreshnessBar({
  lastAmfDate,
  todayCount,
  isFr,
}: {
  lastAmfDate: string | null;
  todayCount: number;
  isFr: boolean;
}) {
  const [now, setNow] = useState(() => new Date());

  // Tick every 30s to keep countdown live
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Next sync = next full hour (cron: 0 * * * *)
  const nextSync = new Date(now);
  nextSync.setHours(now.getHours() + 1, 0, 0, 0);
  const msUntilSync = nextSync.getTime() - now.getTime();
  const minUntilSync = Math.ceil(msUntilSync / 60_000);

  // Freshness status · gold-scale (not green) to reserve green for performance signals
  let freshnessColor = "var(--gold)";
  let freshnessLabel = isFr ? "À jour" : "Up to date";
  let freshnessAge = "";

  const timeLocale = isFr ? "fr-FR" : "en-US";

  if (lastAmfDate) {
    const ageMs = now.getTime() - new Date(lastAmfDate).getTime();
    const ageH = ageMs / 3_600_000;
    const ageD = ageMs / 86_400_000;

    if (ageH < 4) {
      freshnessColor = "var(--gold)";
      freshnessLabel = isFr ? "À jour" : "Up to date";
    } else if (ageD < 1.5) {
      freshnessColor = "var(--tx-3)";
      freshnessLabel = isFr ? "Récent" : "Recent";
    } else if (ageD < 3.5) {
      freshnessColor = "var(--tx-3)";
      freshnessLabel = isFr ? "Week-end" : "Weekend";
    } else {
      freshnessColor = "var(--c-crimson)";
      freshnessLabel = isFr ? "Ancien" : "Old";
    }

    const d = new Date(lastAmfDate);
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();
    const timeStr = d.toLocaleTimeString(timeLocale, { hour: "2-digit", minute: "2-digit" });

    if (isToday) {
      freshnessAge = isFr
        ? `aujourd'hui à ${timeStr}`
        : `today at ${timeStr}`;
    } else if (isYesterday) {
      freshnessAge = isFr
        ? `hier à ${timeStr}`
        : `yesterday at ${timeStr}`;
    } else {
      freshnessAge = isFr
        ? d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + ` à ${timeStr}`
        : d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" }) + ` at ${timeStr}`;
    }
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: "8px",
      padding: "12px 16px",
      borderRadius: "12px",
      background: "var(--bg-raised)",
      border: "1px solid var(--border)",
      marginBottom: "20px",
      fontSize: "0.78rem",
      fontFamily: "'Inter', system-ui",
    }}>
      {/* Left: data status */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        {/* Freshness dot + label */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: freshnessColor,
            boxShadow: `0 0 6px ${freshnessColor}`,
            flexShrink: 0,
            animation: "pulse-dot 2.5s ease-in-out infinite",
          }} />
          <span style={{ fontWeight: 700, color: freshnessColor }}>{freshnessLabel}</span>
        </div>

        {/* Separator */}
        <span style={{ color: "var(--border-strong)", fontSize: "0.7rem" }}>·</span>

        {/* Last data timestamp */}
        {lastAmfDate ? (
          <span style={{ color: "var(--tx-3)" }}>
            {isFr ? "Dernière donnée AMF" : "Latest AMF data"} :{" "}
            <span style={{ color: "var(--tx-2)", fontWeight: 500 }}>{freshnessAge}</span>
          </span>
        ) : (
          <span style={{ color: "var(--tx-4)" }}>{isFr ? "Aucune donnée" : "No data"}</span>
        )}

        {/* Today count */}
        {todayCount > 0 && (
          <>
            <span style={{ color: "var(--border-strong)", fontSize: "0.7rem" }}>·</span>
            <span style={{ color: "var(--tx-1)", fontWeight: 600 }}>
              {isFr ? `+${todayCount} aujourd'hui` : `+${todayCount} today`}
            </span>
          </>
        )}
      </div>

      {/* Right: next sync */}
      <span style={{ color: "var(--tx-4)", fontSize: "0.78rem" }}>
        {isFr ? "Prochain refresh" : "Next refresh"} :{" "}
        <span style={{ color: "var(--tx-3)", fontWeight: 500 }}>
          {isFr
            ? (minUntilSync <= 1 ? "moins d'1 min" : `dans ${minUntilSync} min`)
            : (minUntilSync <= 1 ? "less than 1 min" : `in ${minUntilSync} min`)}
        </span>
      </span>
    </div>
  );
}

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
  company: { name: string; slug: string; marketCap: number | null; logoUrl?: string | null } | null;
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
  lastAmfDate: string | null;
  todayCount: number;
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

function timeAgo(iso: string, isFr = true): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return isFr ? `il y a ${seconds}s` : `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return isFr ? `il y a ${minutes}min` : `${minutes}min ago`;
  const hours = Math.floor(minutes / 60);
  return isFr ? `il y a ${hours}h` : `${hours}h ago`;
}

const REFRESH_INTERVAL = 60_000; // 60 seconds

// ── Main component ─────────────────────────────────────────────────────────

export function HomeLive({ initial }: { initial: HomeData }) {
  const pathname = usePathname();
  const isFr = pathname.startsWith("/fr");
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
      // silent fail · keep existing data
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

  const { stats, lastAmfDate, todayCount, recentDeclarations, topCompanies, topInsiders } = data;

  return (
    <>
      {/* Data freshness bar */}
      <DataFreshnessBar
        lastAmfDate={lastAmfDate}
        todayCount={todayCount}
        isFr={isFr}
      />

      {/* Stats grid — 3 cols on mobile (show all 5 stats), 5 on large screens */}
      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-14 animate-fade-in-delay">
        <StatTile label={isFr ? "Déclarations" : "Declarations"} value={stats.totalDeclarations.toLocaleString(isFr ? "fr-FR" : "en-US")} icon={<FileText size={15} strokeWidth={1.8} />} accent="indigo" />
        <StatTile label={isFr ? "Sociétés" : "Companies"} value={stats.totalCompanies.toLocaleString(isFr ? "fr-FR" : "en-US")} icon={<Building2 size={15} strokeWidth={1.8} />} accent="violet" />
        <StatTile label={isFr ? "Dirigeants" : "Insiders"} value={stats.totalInsiders.toLocaleString(isFr ? "fr-FR" : "en-US")} icon={<User size={15} strokeWidth={1.8} />} accent="slate" />
        <StatTile label={isFr ? "Achats" : "Buys"} value={stats.totalBuys.toLocaleString(isFr ? "fr-FR" : "en-US")} icon={<TrendingUp size={15} strokeWidth={1.8} />} accent="emerald" />
        <StatTile label={isFr ? "Ventes" : "Sells"} value={stats.totalSells.toLocaleString(isFr ? "fr-FR" : "en-US")} icon={<TrendingDown size={15} strokeWidth={1.8} />} accent="rose" />
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-14">
        {/* Top 30 companies */}
        <section className="glass-card-static rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-[var(--tx-1)] tracking-tight">{isFr ? "Sociétés les + actives" : "Most active companies"}</h2>
              <p className="text-xs text-[var(--tx-3)] mt-0.5">{isFr ? "Volume déclaré, 90 derniers jours" : "Volume declared, last 90 days"}</p>
            </div>
            <Link href="/companies" className="text-xs tx-brand hover:tx-brand transition-colors font-medium">
              {isFr ? "Voir tout →" : "See all →"}
            </Link>
          </div>
          <ol className="space-y-0.5">
            {topCompanies.map((row, i) => (
              <li key={row.companyId}>
                <Link
                  href={row.company ? `/company/${row.company.slug}` : "#"}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                  style={{ minHeight: "44px" }}
                >
                  <span className="text-xs font-mono text-[var(--tx-3)] w-5 text-right shrink-0">{i + 1}</span>
                  {row.company && <CompanyAvatar name={row.company.name} logoUrl={row.company.logoUrl} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-[var(--tx-1)] truncate group-hover:text-[var(--c-indigo-2)] transition-colors">
                        {row.company?.name ?? "·"}
                      </span>
                      {row.company?.marketCap && (
                        <span className="text-[10px] text-[var(--tx-3)] shrink-0">{fmtMcap(row.company.marketCap)}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--tx-3)] mt-0.5">
                      {row.count} transaction{row.count > 1 ? "s" : ""}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: "var(--tx-1)" }}>
                    {fmtAmount(row.totalAmount)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {/* Top 30 insiders */}
        <section className="glass-card-static rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-[var(--tx-1)] tracking-tight">{isFr ? "Dirigeants les + actifs" : "Most active insiders"}</h2>
              <p className="text-xs text-[var(--tx-3)] mt-0.5">{isFr ? "Volume total déclaré, tous temps" : "Total volume declared, all time"}</p>
            </div>
            <Link href="/insiders" className="text-xs tx-brand hover:tx-brand transition-colors font-medium">
              {isFr ? "Voir tout →" : "See all →"}
            </Link>
          </div>
          <ol className="space-y-0.5">
            {topInsiders.map((row, i) => (
              <li key={row.insiderName}>
                <Link
                  href={row.insider ? `/insider/${row.insider.slug}` : "#"}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                  style={{ minHeight: "44px" }}
                >
                  <span className="text-xs font-mono text-[var(--tx-3)] w-5 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[var(--tx-1)] truncate group-hover:text-[var(--c-indigo-2)] transition-colors block">
                      {row.insiderName}
                    </span>
                    <div className="text-[11px] text-[var(--tx-3)] mt-0.5">
                      {row.count} transaction{row.count > 1 ? "s" : ""}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tx-brand tabular-nums shrink-0">
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
            <h2 className="text-xl font-semibold text-[var(--tx-1)] tracking-tight">
              {isFr ? "Dernières transactions" : "Latest transactions"}
            </h2>
            <Link
              href="/companies"
              className="text-sm tx-brand hover:tx-brand transition-colors font-medium"
            >
              {isFr ? "Toutes les sociétés →" : "All companies →"}
            </Link>
          </div>
          <div className="space-y-2">
            {recentDeclarations.map((decl: Declaration) => (
              <DeclarationCard key={decl.id} declaration={decl} locale={isFr ? "fr" : "en"} />
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
    indigo: "from-indigo-500/10 to-indigo-500/5 bd-brand",
    violet: "from-violet-500/10 to-violet-500/5 border-violet-500/15",
    emerald: "from-emerald-500/10 to-emerald-500/5 bd-pos",
    rose: "from-rose-500/10 to-rose-500/5 bd-neg",
    slate: "from-slate-500/10 to-slate-500/5 border-slate-500/15",
  };
  return (
    <div className={`glass-card-static rounded-2xl p-4 bg-gradient-to-br ${accentMap[accent]} flex flex-col gap-2 ${className}`}>
      <span className="opacity-60">{icon}</span>
      <div className="stat-number">{value}</div>
      <div className="text-xs text-[var(--tx-3)] font-medium">{label}</div>
    </div>
  );
}
