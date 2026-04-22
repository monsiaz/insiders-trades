import { prisma } from "@/lib/prisma";
import { HomeLive } from "@/components/HomeLive";
import { HomeBacktestWidget } from "@/components/HomeBacktestWidget";
import { HeroAnimated } from "@/components/HeroAnimated";
import { HowItWorksAnimations } from "@/components/HowItWorksAnimations";
import { CompanyAvatar } from "@/components/CompanyBadge";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";

export const revalidate = 60; // Revalidate home every 60s (ISR)

// ── Fast SQL-aggregate backtest snapshot (was loading 20k rows → now 1 aggregate query) ─
const getBacktestSnapshot = unstable_cache(
  async () => {
    try {
      const rows = await prisma.$queryRaw<Array<{ total: bigint; avg90d: number | null; winrate: number | null }>>`
        SELECT
          COUNT(*)::bigint AS total,
          AVG("return90d")::float8 AS avg90d,
          (SUM(CASE WHEN "return90d" > 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0))::float8 AS winrate
        FROM "BacktestResult"
        WHERE "return90d" IS NOT NULL
      `;
      const r = rows[0];
      if (!r || Number(r.total) === 0) return null;
      return {
        total: Number(r.total),
        avg90d: r.avg90d ?? 0,
        winRate90d: r.winrate ?? 0,
      };
    } catch { return null; }
  },
  ["home-backtest-snapshot-v2"],
  { revalidate: 3600 }
);

const getHighScoreSignals = unstable_cache(
  async () => {
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
  },
  ["home-high-score-signals-v1"],
  { revalidate: 300 }
);

// ── Fast header stats — just 6 count queries, cached 5 min ────────────────────
const getHeaderStats = unstable_cache(
  async () => {
    const [totalDeclarations, totalCompanies, totalInsiders, totalBuys, totalSells, earliestDecl] =
      await Promise.all([
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
      ]);
    const earliestYear = earliestDecl?.transactionDate
      ? new Date(earliestDecl.transactionDate).getFullYear()
      : 2021;
    return { totalDeclarations, totalCompanies, totalInsiders, totalBuys, totalSells, earliestYear };
  },
  ["home-header-stats-v2"],
  { revalidate: 300 }
);

// ── Heavier live-feed data, streamed via Suspense below the fold ──────────────
const getLiveData = unstable_cache(
  async () => {
    const since90d = new Date(Date.now() - 90 * 86400_000);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const [lastDecl, todayCount, recentDeclarations, topCompaniesRaw, topInsidersRaw] =
      await Promise.all([
        prisma.declaration.findFirst({
          where: { type: "DIRIGEANTS" },
          orderBy: { pubDate: "desc" },
          select: { pubDate: true },
        }),
        prisma.declaration.count({ where: { type: "DIRIGEANTS", pubDate: { gte: todayStart } } }),
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
      return {
        companyId: r.companyId,
        count: r._count.id,
        totalAmount: r._sum.totalAmount,
        company: co ? { name: co.name, slug: co.slug, marketCap: co.marketCap ? Number(co.marketCap) : null } : null,
      };
    });

    const insiderNames = topInsidersRaw.map((r) => r.insiderName!).filter(Boolean);
    const insiderDetails = await prisma.insider.findMany({
      where: { name: { in: insiderNames } },
      select: { name: true, slug: true },
    });
    const insiderMap = new Map(insiderDetails.map((i) => [i.name, i]));
    const topInsiders = topInsidersRaw.map((r) => ({
      insiderName: r.insiderName,
      count: r._count.id,
      totalAmount: r._sum.totalAmount,
      insider: insiderMap.get(r.insiderName ?? "") ?? null,
    }));

    return {
      lastAmfDate: lastDecl?.pubDate.toISOString() ?? null,
      todayCount,
      recentDeclarations: recentDeclarations.map((d) => ({
        ...d,
        pubDate: d.pubDate.toISOString(),
        transactionDate: d.transactionDate?.toISOString() ?? null,
      })),
      topCompanies,
      topInsiders,
      updatedAt: new Date().toISOString(),
    };
  },
  ["home-live-data-v2"],
  { revalidate: 120 }
);

// ── Streaming sections (each is an independent Suspense boundary) ────────────

async function HeroBacktestBadge({ totalDeclarations }: { totalDeclarations: number }) {
  const snap = await getBacktestSnapshot();
  return (
    <HeroAnimated winRate={snap?.winRate90d} totalDeclarations={totalDeclarations} />
  );
}

async function FeatureStripSection({ earliestYear }: { earliestYear: number }) {
  const snap = await getBacktestSnapshot();
  return (
    <section className="mb-16">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FeatureCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
          title="Détection des signaux"
          body="Scoring composite sur 100 points : taille de l'achat, conviction du dirigeant, rôle, capitalisation. Seuls les signaux vraiment significatifs remontent."
          accent="var(--gold)"
        />
        <FeatureCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17 6 23 6 23 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          title="Backtesting historique"
          body={`Performance réelle de ${snap ? snap.total.toLocaleString("fr-FR") : "22 000"}+ transactions depuis ${earliestYear}. Win rate, Sharpe, retour médian à T+30, T+90, T+365. Données vérifiées sur Yahoo Finance.`}
          accent="var(--corporate)"
        />
        <FeatureCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="22 4 12 14.01 9 11.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          title="Recommandations actionnables"
          body="Top 10 signaux d'achat générés chaque jour. Personnalisé si vous avez un portefeuille. Alertes email sur les nouvelles opportunités."
          accent="var(--gold)"
        />
      </div>
    </section>
  );
}

async function HighScoreSection() {
  const sigs = await getHighScoreSignals();
  if (sigs.length === 0) return null;
  return (
    <section className="mb-16">
      <SectionHeader
        title="Signaux du moment"
        sub="Achats avec score ≥ 65 · Les plus récents · Triés par conviction"
        eyebrow="Intelligence"
        action={{ label: "Voir toutes les recommandations →", href: "/recommendations" }}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-5">
        {sigs.slice(0, 6).map((sig) => (
          <SignalCard key={sig.id} sig={sig} />
        ))}
      </div>
    </section>
  );
}

async function BacktestTeaserSection() {
  const snap = await getBacktestSnapshot();
  if (!snap) return null;
  return (
    <section className="mb-16">
      <HomeBacktestWidget snapshot={snap} />
    </section>
  );
}

async function HomeLiveSection({ stats }: { stats: Awaited<ReturnType<typeof getHeaderStats>> }) {
  const live = await getLiveData();
  return <HomeLive initial={{ stats, ...live }} />;
}

// ── Skeletons for each streaming section ─────────────────────────────────────
function HeroBadgeSkeleton() {
  return (
    <div style={{
      width: "340px", height: "320px",
      borderRadius: "20px", background: "var(--bg-raised)",
      animation: "pulse 1.5s ease-in-out infinite",
    }} />
  );
}

function FeatureStripSkeleton() {
  return (
    <section className="mb-16">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: "180px", borderRadius: "16px", background: "var(--bg-raised)" }} />
        ))}
      </div>
    </section>
  );
}

function SectionSkeleton({ height = 200 }: { height?: number }) {
  return (
    <section className="mb-16">
      <div style={{ animation: "pulse 1.5s ease-in-out infinite", height: `${height}px`, borderRadius: "16px", background: "var(--bg-raised)" }} />
    </section>
  );
}

function HomeLiveSkeleton() {
  return (
    <div style={{ animation: "pulse 1.5s ease-in-out infinite", display: "flex", flexDirection: "column", gap: "10px" }}>
      {[1, 2, 3, 4, 5].map((i) => <div key={i} style={{ height: "64px", borderRadius: "12px", background: "var(--bg-raised)" }} />)}
    </div>
  );
}

export default async function HomePage() {
  // Only fetch the fast header stats for SSR — everything else streams below
  const stats = await getHeaderStats();
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
                fontFamily: "var(--font-dm-serif), Georgia, serif",
                fontStyle: "italic",
                fontWeight: 400,
                color: "var(--gold)",
                letterSpacing: "-0.015em",
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

          {/* Right column — animated hero (winRate streams in async) */}
          <div className="hidden xl:flex flex-col flex-shrink-0">
            <Suspense fallback={<HeroBadgeSkeleton />}>
              <HeroBacktestBadge totalDeclarations={stats.totalDeclarations} />
            </Suspense>
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
            accent="gold"
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
            accent="gold"
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
            accent="gold"
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
            accent="gold"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            }
          />
        </div>
      </section>

      {/* ── FEATURE STRIP — 3 valeurs (streams in with backtest total) ── */}
      <Suspense fallback={<FeatureStripSkeleton />}>
        <FeatureStripSection earliestYear={stats.earliestYear} />
      </Suspense>

      {/* ── STRATÉGIE SIGMA (hero banner) ────────────────────────────── */}
      <section className="mb-16">
        <Link
          href="/strategie"
          style={{
            display: "block",
            padding: "28px 32px",
            borderRadius: "6px",
            background: "linear-gradient(135deg, var(--corporate-bg) 0%, var(--gold-bg) 100%)",
            border: "1px solid var(--corporate-bd)",
            borderLeft: "3px solid var(--gold)",
            textDecoration: "none",
            transition: "border-color 0.15s ease",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "24px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.64rem",
                  fontWeight: 700,
                  color: "var(--gold)",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                ★ Stratégie Sigma — disponible
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-dm-serif), Georgia, serif",
                  fontSize: "clamp(1.4rem, 3.5vw, 2rem)",
                  fontWeight: 400,
                  letterSpacing: "-0.015em",
                  color: "var(--tx-1)",
                  lineHeight: 1.15,
                  marginBottom: "8px",
                }}
              >
                Une stratégie qui a battu le CAC 40<br />
                <span style={{ fontStyle: "italic", color: "var(--gold)" }}>chaque année depuis 2022</span>
              </h2>
              <div style={{ display: "flex", gap: "18px", flexWrap: "wrap", alignItems: "baseline", marginTop: "14px" }}>
                <div>
                  <div style={{ fontFamily: "'Banana Grotesk', sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--signal-pos)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
                    +16.3%
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    rendement annuel moyen
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: "'Banana Grotesk', sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--tx-1)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
                    +10.4 pts
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    alpha vs CAC 40
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: "'Banana Grotesk', sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--tx-1)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
                    1.00
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    ratio de Sharpe
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: "'Banana Grotesk', sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--tx-1)", letterSpacing: "-0.03em" }}>
                    4 / 4
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    années gagnées
                  </div>
                </div>
              </div>
            </div>
            <div
              style={{
                padding: "12px 20px",
                background: "var(--gold)",
                color: "#0A0C10",
                borderRadius: "3px",
                fontWeight: 700,
                fontSize: "0.88rem",
                letterSpacing: "-0.005em",
                whiteSpace: "nowrap",
                boxShadow: "0 4px 16px rgba(184,149,90,0.25)",
              }}
            >
              Voir la preuve →
            </div>
          </div>
        </Link>
      </section>

      {/* ── SIGNALS DU MOMENT (streamed) ─────────────────────────────── */}
      <Suspense fallback={<SectionSkeleton height={280} />}>
        <HighScoreSection />
      </Suspense>

      {/* ── BACKTEST TEASER (streamed) ──────────────────────────────── */}
      <Suspense fallback={<SectionSkeleton height={200} />}>
        <BacktestTeaserSection />
      </Suspense>

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

      {/* ── LIVE FEED (streamed — heavy queries) ────────────────────── */}
      <Suspense fallback={<HomeLiveSkeleton />}>
        <HomeLiveSection stats={stats} />
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
        <div className="badge badge-amber">Live</div>
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
          <div style={{ fontFamily: "'Banana Grotesk', 'Inter', system-ui", fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.05em", color: "var(--tx-1)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
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

// DA v3: 3 accents only (gold / navy / financial signals).
// Legacy accent names are remapped to the new palette.
type AccentColor = "gold" | "navy" | "emerald" | "crimson" | "indigo" | "amber" | "violet";

function KpiCard({ value, label, sub, accent, icon }: {
  value: string;
  label: string;
  sub?: string;
  accent: AccentColor;
  icon?: React.ReactNode;
}) {
  const GOLD = { top: "var(--gold)",      border: "var(--gold-bd)",      color: "var(--gold)",       bg: "var(--gold-bg)"      };
  const NAVY = { top: "var(--corporate)", border: "var(--corporate-bd)", color: "var(--corporate-2)", bg: "var(--corporate-bg)" };
  const EMER = { top: "var(--signal-pos)", border: "var(--signal-pos-bd)", color: "var(--signal-pos)", bg: "var(--signal-pos-bg)" };
  const CRIM = { top: "var(--signal-neg)", border: "var(--signal-neg-bd)", color: "var(--signal-neg)", bg: "var(--signal-neg-bg)" };
  const styles: Record<AccentColor, typeof GOLD> = {
    gold:    GOLD,
    navy:    NAVY,
    emerald: EMER,
    crimson: CRIM,
    // Legacy aliases (all collapse to gold/navy for DA unity)
    indigo:  NAVY,
    amber:   GOLD,
    violet:  NAVY,
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
            color: "var(--gold)",
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
              color: "var(--tx-1)",
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
