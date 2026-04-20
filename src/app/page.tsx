import { prisma } from "@/lib/prisma";
import { HomeLive } from "@/components/HomeLive";
import { HomeBacktestWidget } from "@/components/HomeBacktestWidget";
import { HeroAnimated } from "@/components/HeroAnimated";
import { HowItWorksAnimations } from "@/components/HowItWorksAnimations";
import { CompanyAvatar } from "@/components/CompanyBadge";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";

export const revalidate = 60; // Revalidate home every 60s (ISR)

async function getBacktestSnapshot() {
  try {
    const total = await prisma.backtestResult.count();
    if (total === 0) return null;
    const results = await prisma.backtestResult.findMany({
      where: { return90d: { not: null } },
      select: { return90d: true },
    });
    const r90 = results.map((r) => r.return90d!);
    const avg = r90.reduce((a, b) => a + b, 0) / r90.length;
    const winRate = (r90.filter((v) => v > 0).length / r90.length) * 100;
    return { total, avg90d: avg, winRate90d: winRate };
  } catch { return null; }
}

async function getHighScoreSignals() {
  try {
    return (await prisma.declaration.findMany({
      where: {
        type: "DIRIGEANTS",
        transactionNature: { contains: "Acquisition", mode: "insensitive" },
        signalScore: { gte: 65 },
        pdfParsed: true,
        totalAmount: { gt: 0 },
      },
      orderBy: { pubDate: "desc" },
      take: 6,
      select: {
        id: true, pubDate: true, transactionDate: true, insiderName: true,
        insiderFunction: true, totalAmount: true, signalScore: true,
        pctOfMarketCap: true, isin: true,
        company: { select: { name: true, slug: true, logoUrl: true } },
      },
    })).map((s) => ({
      ...s,
      pubDate: s.pubDate.toISOString(),
      transactionDate: s.transactionDate?.toISOString() ?? null,
    }));
  } catch { return []; }
}

async function getInitialData() {
  const since90d = new Date(Date.now() - 90 * 86400_000);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const [totalDeclarations, totalCompanies, totalInsiders, totalBuys, totalSells,
    earliestDecl, lastDecl, todayCount,
    recentDeclarations, topCompaniesRaw, topInsidersRaw] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.company.count({ where: { declarations: { some: { type: "DIRIGEANTS" } } } }),
    prisma.insider.count(),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: { contains: "Acquisition", mode: "insensitive" } } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: { contains: "Cession", mode: "insensitive" } } }),
    prisma.declaration.findFirst({
      where: { type: "DIRIGEANTS", transactionDate: { gte: new Date("2020-01-01") } },
      orderBy: { transactionDate: "asc" },
      select: { transactionDate: true },
    }),
    prisma.declaration.findFirst({
      where: { type: "DIRIGEANTS" },
      orderBy: { pubDate: "desc" },
      select: { pubDate: true },
    }),
    prisma.declaration.count({
      where: { type: "DIRIGEANTS", pubDate: { gte: todayStart } },
    }),
    prisma.declaration.findMany({
      where: { type: "DIRIGEANTS" },
      orderBy: { pubDate: "desc" },
      take: 20,
      select: {
        id: true, amfId: true, type: true, pubDate: true, link: true, description: true,
        insiderName: true, insiderFunction: true, transactionNature: true,
        instrumentType: true, isin: true, unitPrice: true, volume: true,
        totalAmount: true, currency: true, transactionDate: true, transactionVenue: true,
        pdfParsed: true, signalScore: true, pctOfMarketCap: true, pctOfInsiderFlow: true,
        company: { select: { name: true, slug: true, logoUrl: true } },
        insider: { select: { name: true, slug: true } },
      },
    }),
    prisma.declaration.groupBy({
      by: ["companyId"],
      where: { type: "DIRIGEANTS", totalAmount: { not: null }, pubDate: { gte: since90d } },
      _sum: { totalAmount: true }, _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 30,
    }),
    prisma.declaration.groupBy({
      by: ["insiderName"],
      where: { type: "DIRIGEANTS", totalAmount: { not: null }, insiderName: { not: null } },
      _sum: { totalAmount: true }, _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 30,
    }),
  ]);

  const companyIds = topCompaniesRaw.map((r) => r.companyId);
  const companyDetails = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true, slug: true, marketCap: true },
  });
  const companyMap = new Map(companyDetails.map((c) => [c.id, c]));

  const topCompanies = topCompaniesRaw.map((r) => {
    const co = companyMap.get(r.companyId);
    return { companyId: r.companyId, count: r._count.id, totalAmount: r._sum.totalAmount, company: co ? { name: co.name, slug: co.slug, marketCap: co.marketCap ? Number(co.marketCap) : null } : null };
  });

  const insiderNames = topInsidersRaw.map((r) => r.insiderName!).filter(Boolean);
  const insiderDetails = await prisma.insider.findMany({ where: { name: { in: insiderNames } }, select: { name: true, slug: true } });
  const insiderMap = new Map(insiderDetails.map((i) => [i.name, i]));
  const topInsiders = topInsidersRaw.map((r) => ({ insiderName: r.insiderName, count: r._count.id, totalAmount: r._sum.totalAmount, insider: insiderMap.get(r.insiderName ?? "") ?? null }));

  const earliestYear = earliestDecl?.transactionDate
    ? new Date(earliestDecl.transactionDate).getFullYear()
    : 2021;

  return {
    stats: { totalDeclarations, totalCompanies, totalInsiders, totalBuys, totalSells, earliestYear },
    lastAmfDate: lastDecl?.pubDate.toISOString() ?? null,
    todayCount,
    recentDeclarations: recentDeclarations.map((d) => ({ ...d, pubDate: d.pubDate.toISOString(), transactionDate: d.transactionDate?.toISOString() ?? null })),
    topCompanies,
    topInsiders,
    updatedAt: new Date().toISOString(),
  };
}

export default async function HomePage() {
  const [initial, backtestSnapshot, highScoreSignals] = await Promise.all([
    getInitialData(), getBacktestSnapshot(), getHighScoreSignals(),
  ]);

  const { stats } = initial;
  const buyPct = stats.totalBuys + stats.totalSells > 0
    ? Math.round((stats.totalBuys / (stats.totalBuys + stats.totalSells)) * 100)
    : 0;

  return (
    <div className="content-wrapper">

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="mb-16 sm:mb-20 animate-fade-in" style={{ position: "relative" }}>
        <div className="flex items-start gap-8 xl:gap-16">

          {/* Left column */}
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            {/* Eyebrow tag */}
            <div className="hero-tag mb-6 sm:mb-7">
              <span className="live-dot" />
              Données AMF · Temps réel · Règlement MAR
            </div>

            {/* Main headline — Banana Grotesk, très grand */}
            <h1 style={{
              fontFamily: "'Banana Grotesk', var(--font-inter), system-ui, sans-serif",
              fontSize: "clamp(2.25rem, 6.5vw, 5.75rem)",
              fontWeight: 700,
              letterSpacing: "-0.046em",
              lineHeight: 1.02,
              color: "var(--tx-1)",
              marginBottom: "1rem",
              maxWidth: "660px",
              overflowWrap: "break-word",
              hyphens: "auto",
            }}>
              Transactions<br/>
              <span style={{
                background: "linear-gradient(130deg, var(--c-indigo-2) 0%, var(--c-violet) 55%, var(--c-emerald-2) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}>
                dirigeants
              </span>
              <br/>
              <span style={{ color: "var(--tx-2)", fontSize: "0.65em", fontWeight: 600, letterSpacing: "-0.02em" }}>décodées.</span>
            </h1>

            <p style={{
              fontFamily: "var(--font-inter), system-ui, sans-serif",
              fontSize: "clamp(0.95rem, 2.4vw, 1.0625rem)",
              color: "var(--tx-2)",
              maxWidth: "500px",
              lineHeight: 1.65,
              marginBottom: "1.75rem",
              fontWeight: 400,
            }}>
              Suivez chaque déclaration AMF, détectez les signaux d&apos;accumulation et analysez les patterns historiques des insiders français.
            </p>

            {/* CTA row */}
            <div className="hero-cta-row mb-10">
              <Link href="/companies" className="btn btn-cta-gradient hero-cta">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M3 3h18v4H3zM3 10h11v4H3zM3 17h7v4H3z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Explorer les sociétés
              </Link>
              <Link href="/recommendations" className="btn btn-glass hero-cta">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Top signaux
              </Link>
              <Link href="/backtest" className="btn btn-outline hero-cta">
                Backtesting →
              </Link>
            </div>

            {/* Trust indicators */}
            <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
              <TrustBadge icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="9 22 9 12 15 12 15 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>} label="Données AMF officielles" />
              <TrustBadge icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>} label={`${stats.totalDeclarations.toLocaleString("fr-FR")} déclarations`} />
              <TrustBadge icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><polyline points="12 6 12 12 16 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>} label="Mis à jour quotidiennement" />
            </div>
          </div>

          {/* Right column — animated hero */}
          <div className="hidden xl:flex flex-col flex-shrink-0">
            <HeroAnimated
              winRate={backtestSnapshot?.winRate90d}
              totalDeclarations={stats.totalDeclarations}
            />
          </div>
        </div>
      </section>

      {/* ── KPI STRIP ─────────────────────────────────────────────────── */}
      <section className="mb-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            value={stats.totalDeclarations.toLocaleString("fr-FR")}
            label="Déclarations totales"
            sub={`depuis ${stats.earliestYear}`}
            accent="indigo"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <KpiCard
            value={stats.totalCompanies.toLocaleString("fr-FR")}
            label="Sociétés suivies"
            sub="cotées françaises"
            accent="emerald"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            }
          />
          <KpiCard
            value={`${buyPct}%`}
            label="Ratio achats/ventes"
            sub={`${stats.totalBuys.toLocaleString("fr-FR")} achats`}
            accent="emerald"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="17 6 23 6 23 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <KpiCard
            value={stats.totalInsiders.toLocaleString("fr-FR")}
            label="Dirigeants identifiés"
            sub="PDG, DG, CA…"
            accent="violet"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            }
          />
        </div>
      </section>

      {/* ── FEATURE STRIP — 3 valeurs ────────────────────────────────── */}
      <section className="mb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FeatureCard
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
            title="Détection des signaux"
            body="Scoring composite sur 100 points : taille de l'achat, conviction du dirigeant, rôle, capitalisation. Seuls les signaux vraiment significatifs remontent."
            accent="var(--c-indigo)"
          />
          <FeatureCard
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17 6 23 6 23 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            title="Backtesting historique"
            body={`Performance réelle de ${backtestSnapshot ? backtestSnapshot.total.toLocaleString("fr-FR") : "22 000"}+ transactions depuis ${stats.earliestYear}. Win rate, Sharpe, retour médian à T+30, T+90, T+365. Données vérifiées sur Yahoo Finance.`}
            accent="var(--c-emerald)"
          />
          <FeatureCard
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            title="Recommandations actionnables"
            body="Top 10 signaux d'achat générés chaque jour. Personnalisé si vous avez un portefeuille. Alertes email sur les nouvelles opportunités."
            accent="var(--c-violet)"
          />
        </div>
      </section>

      {/* ── SIGNALS DU MOMENT ────────────────────────────────────────── */}
      {highScoreSignals.length > 0 && (
        <section className="mb-16">
          <SectionHeader
            title="Signaux du moment"
            sub="Achats avec score ≥ 65 · Les plus récents · Triés par conviction"
            eyebrow="Intelligence"
            action={{ label: "Voir toutes les recommandations →", href: "/recommendations" }}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-5">
            {highScoreSignals.slice(0, 6).map((sig) => (
              <SignalCard key={sig.id} sig={sig} />
            ))}
          </div>
        </section>
      )}

      {/* ── BACKTEST TEASER ──────────────────────────────────────────── */}
      {backtestSnapshot && (
        <section className="mb-16">
          <HomeBacktestWidget snapshot={backtestSnapshot} />
        </section>
      )}

      {/* ── VISUAL SECTION — "Comment ça marche" ─────────────────────── */}
      <section className="mb-16">
        <SectionHeader
          title="Comment ça marche"
          sub="De la déclaration AMF au signal actionnable en temps réel"
          eyebrow="Méthodologie"
        />
        <div className="mt-6">
          <HowItWorksAnimations />
        </div>
      </section>

      {/* ── LIVE FEED ────────────────────────────────────────────────── */}
      <Suspense fallback={
        <div style={{ animation: "pulse 1.5s ease-in-out infinite", display: "flex", flexDirection: "column", gap: "10px" }}>
          {[1,2,3,4,5].map(i => <div key={i} style={{ height: "64px", borderRadius: "12px", background: "var(--bg-raised)" }} />)}
        </div>
      }>
        <HomeLive initial={initial} />
      </Suspense>

    </div>
  );
}

// ── Win-rate sparkline card ───────────────────────────────────────────────────

function WinRateSparkline({ winRate, avg90d }: { winRate: number; avg90d: number }) {
  const seed = [0.62, 0.58, 0.67, 0.55, 0.71, 0.64, 0.69, 0.60, 0.73, 0.66, 0.70, winRate / 100];
  const W = 280, H = 90;
  const min = Math.min(...seed) - 0.04;
  const max = Math.max(...seed) + 0.04;
  const pts = seed.map((v, i) => {
    const x = (i / (seed.length - 1)) * W;
    const y = H - ((v - min) / (max - min)) * H;
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const area = `M0,${H} L${pts.join(" L")} L${W},${H} Z`;
  const lastX = W.toFixed(1);
  const lastY = (H - ((seed[seed.length - 1] - min) / (max - min)) * H).toFixed(1);
  const refY = (H - ((0.5 - min) / (max - min)) * H).toFixed(1);

  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-med)",
      borderRadius: "16px",
      padding: "16px 20px 14px",
      boxShadow: "var(--shadow-sm)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div style={{ fontSize: "0.65rem", fontFamily: "'Inter', system-ui", fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--tx-3)" }}>
          Win rate · T+90 · 12 mois
        </div>
        <div className="badge badge-emerald">Live</div>
      </div>

      {/* SVG chart */}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" style={{ display: "block" }}>
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--c-emerald)" stopOpacity="0.15"/>
            <stop offset="100%" stopColor="var(--c-emerald)" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={area} fill="url(#area-fill)"/>
        {/* 50% reference dashed */}
        <line x1="0" y1={refY} x2={W} y2={refY} stroke="rgba(99,155,255,0.15)" strokeWidth="1" strokeDasharray="4 4"/>
        {/* Main line */}
        <polyline
          points={polyline}
          stroke="var(--c-emerald)"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="sparkline-path"
        />
        {/* End glow */}
        <circle cx={lastX} cy={lastY} r="6" fill="var(--c-emerald)" fillOpacity="0.2"/>
        <circle cx={lastX} cy={lastY} r="3.5" fill="var(--c-emerald)"/>
        <circle cx={lastX} cy={lastY} r="1.8" fill="white"/>
      </svg>

      {/* Stats */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
        <div>
          <div style={{ fontFamily: "'Banana Grotesk', 'Inter', system-ui", fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.05em", color: "var(--c-emerald)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {winRate.toFixed(0)}%
          </div>
          <div style={{ fontFamily: "'Inter', system-ui", fontSize: "0.63rem", color: "var(--tx-3)", fontWeight: 600, marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>trades gagnants</div>
        </div>
        <div style={{ height: "32px", width: "1px", background: "var(--border-med)" }} />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Banana Grotesk', 'Inter', system-ui", fontSize: "1.25rem", fontWeight: 700, letterSpacing: "-0.04em", color: (avg90d > 0 ? "var(--c-emerald)" : "var(--c-crimson)"), lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {avg90d >= 0 ? "+" : ""}{avg90d.toFixed(1)}%
          </div>
          <div style={{ fontFamily: "'Inter', system-ui", fontSize: "0.63rem", color: "var(--tx-3)", fontWeight: 600, marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>retour moy.</div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      fontSize: "0.78rem",
      fontFamily: "'Inter', system-ui",
      fontWeight: 500,
      color: "var(--tx-3)",
    }}>
      <span style={{ color: "var(--tx-2)", display: "flex", alignItems: "center" }}>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

type AccentColor = "indigo" | "emerald" | "crimson" | "amber" | "violet";

function KpiCard({ value, label, sub, accent, icon }: {
  value: string;
  label: string;
  sub?: string;
  accent: AccentColor;
  icon?: React.ReactNode;
}) {
  const styles: Record<AccentColor, { top: string; border: string; color: string; bg: string }> = {
    indigo:  { top: "var(--c-indigo)",   border: "var(--c-indigo-bd)",   color: "var(--c-indigo-2)",  bg: "var(--c-indigo-bg)"  },
    emerald: { top: "var(--c-emerald)",  border: "var(--c-emerald-bd)",  color: "var(--c-emerald)",   bg: "var(--c-emerald-bg)" },
    crimson: { top: "var(--c-crimson)",  border: "var(--c-crimson-bd)",  color: "var(--c-crimson)",   bg: "var(--c-crimson-bg)" },
    amber:   { top: "var(--c-amber)",    border: "var(--c-amber-bd)",    color: "var(--c-amber)",     bg: "var(--c-amber-bg)"   },
    violet:  { top: "var(--c-violet)",   border: "var(--c-violet-bd)",   color: "var(--c-violet)",    bg: "var(--c-violet-bg)"  },
  };
  const s = styles[accent];
  return (
    <div className="card p-5" style={{
      borderColor: s.border,
      borderTopWidth: "2px",
      borderTopColor: s.top,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "8px" }}>
        <div className="stat-value" style={{ color: s.color }}>{value}</div>
        {icon && (
          <div style={{
            width: "34px", height: "34px",
            borderRadius: "9px",
            background: s.bg,
            border: `1px solid ${s.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: s.color, flexShrink: 0,
          }}>
            {icon}
          </div>
        )}
      </div>
      <div style={{ fontFamily: "'Inter', system-ui", fontSize: "0.84rem", fontWeight: 600, color: "var(--tx-1)", letterSpacing: "-0.01em" }}>{label}</div>
      {sub && <div style={{ fontFamily: "'Inter', system-ui", fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "3px", fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

function FeatureCard({ icon, title, body, accent }: { icon: React.ReactNode; title: string; body: React.ReactNode; accent: string }) {
  return (
    <div className="card p-6 group" style={{ position: "relative", overflow: "hidden" }}>
      <div style={{
        position: "absolute",
        top: "-20px",
        right: "-20px",
        width: "80px",
        height: "80px",
        borderRadius: "50%",
        background: `${accent}`,
        opacity: 0.06,
        filter: "blur(30px)",
        pointerEvents: "none",
      }} />
      <div style={{
        width: "42px", height: "42px",
        borderRadius: "11px",
        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 22%, transparent)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: accent,
        marginBottom: "14px",
      }}>
        {icon}
      </div>
      <h3 style={{
        fontFamily: "'Banana Grotesk', 'Inter', system-ui",
        fontSize: "1rem",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        color: "var(--tx-1)",
        marginBottom: "8px",
      }}>
        {title}
      </h3>
      <p style={{
        fontFamily: "'Inter', system-ui",
        fontSize: "0.84rem",
        color: "var(--tx-2)",
        lineHeight: 1.65,
        margin: 0,
      }}>
        {body}
      </p>
    </div>
  );
}

function SectionHeader({ title, sub, eyebrow, action }: {
  title: string;
  sub?: string;
  eyebrow?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-1">
      <div>
        {eyebrow && (
          <div style={{
            fontFamily: "'Inter', system-ui",
            fontSize: "0.67rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--c-indigo-2)",
            marginBottom: "6px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}>
            <span style={{ width: "16px", height: "1px", background: "var(--c-indigo)", display: "inline-block" }} />
            {eyebrow}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <h2 className="heading-section">{title}</h2>
        </div>
        {sub && <p style={{ fontFamily: "'Inter', system-ui", fontSize: "0.8rem", color: "var(--tx-3)", marginTop: "4px" }}>{sub}</p>}
      </div>
      {action && (
        <Link href={action.href} style={{
          fontFamily: "'Inter', system-ui",
          fontSize: "0.8rem",
          fontWeight: 600,
          color: "var(--c-indigo-2)",
          textDecoration: "none",
          whiteSpace: "nowrap",
          letterSpacing: "-0.01em",
        }}
          className="hover:opacity-80 transition-opacity">
          {action.label}
        </Link>
      )}
    </div>
  );
}

type Signal = {
  id: string;
  company: { name: string; slug: string };
  insiderName: string | null;
  insiderFunction: string | null;
  totalAmount: number | null;
  signalScore: number | null;
  pctOfMarketCap: number | null;
  transactionDate: string | null;
  pubDate: string;
};

function SignalCard({ sig }: { sig: Signal }) {
  const score = Math.round(sig.signalScore ?? 0);

  const amtStr = sig.totalAmount
    ? sig.totalAmount >= 1e6 ? `${(sig.totalAmount / 1e6).toFixed(1)} M€`
    : sig.totalAmount >= 1e3 ? `${(sig.totalAmount / 1e3).toFixed(0)} k€`
    : `${sig.totalAmount.toFixed(0)} €`
    : null;

  const pubDate = new Date(sig.pubDate).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  const pctMcapStr =
    sig.pctOfMarketCap != null && sig.pctOfMarketCap > 0
      ? sig.pctOfMarketCap < 0.1
        ? `${sig.pctOfMarketCap.toFixed(2)}%`
        : `${sig.pctOfMarketCap.toFixed(1)}%`
      : null;

  return (
    <Link
      href={`/company/${sig.company.slug}`}
      className="tearsheet"
      style={{ textDecoration: "none", padding: "18px 18px 14px 22px", gap: "12px" }}
    >
      <span className="tearsheet-stripe buy" aria-hidden="true" />

      {/* Head */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <CompanyAvatar
            name={sig.company.name}
            logoUrl={(sig.company as { logoUrl?: string | null }).logoUrl}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontSize: "1.05rem",
              fontWeight: 400,
              color: "var(--tx-1)",
              letterSpacing: "-0.005em",
              lineHeight: 1.15,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {sig.company.name}
            </div>
            {sig.insiderName && (
              <div style={{
                fontSize: "0.72rem",
                color: "var(--tx-3)",
                marginTop: "2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {sig.insiderName}
              </div>
            )}
          </div>
        </div>

        {/* Score typographic */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Banana Grotesk', sans-serif",
            fontSize: "1.5rem",
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: score >= 75 ? "var(--signal-pos)" : "var(--gold)",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}>
            {score}
          </div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.52rem",
            color: "var(--tx-4)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}>
            Signal
          </div>
        </div>
      </div>

      {/* Rule + metrics */}
      <div style={{
        display: "flex",
        alignItems: "baseline",
        gap: "18px",
        paddingTop: "10px",
        borderTop: "1px solid var(--border)",
      }}>
        {amtStr && (
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.55rem",
              color: "var(--tx-3)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: "2px",
            }}>
              Ticket
            </div>
            <div style={{
              fontFamily: "'Banana Grotesk', sans-serif",
              fontSize: "0.92rem",
              fontWeight: 700,
              color: "var(--signal-pos)",
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}>
              {amtStr}
            </div>
          </div>
        )}
        {pctMcapStr && (
          <div>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.55rem",
              color: "var(--tx-3)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
              marginBottom: "2px",
            }}>
              % MCap
            </div>
            <div style={{
              fontFamily: "'Banana Grotesk', sans-serif",
              fontSize: "0.92rem",
              fontWeight: 700,
              color: "var(--gold)",
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
            }}>
              {pctMcapStr}
            </div>
          </div>
        )}
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.65rem",
            color: "var(--tx-4)",
            letterSpacing: "0.04em",
          }}>
            {pubDate}
          </div>
        </div>
      </div>
    </Link>
  );
}
