import { prisma } from "@/lib/prisma";
import { HomeLive } from "@/components/HomeLive";
import { HomeBacktestWidget } from "@/components/HomeBacktestWidget";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
        company: { select: { name: true, slug: true } },
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
  const [totalDeclarations, totalCompanies, totalInsiders, totalBuys, totalSells,
    recentDeclarations, topCompaniesRaw, topInsidersRaw] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.company.count({ where: { declarations: { some: { type: "DIRIGEANTS" } } } }),
    prisma.insider.count(),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: { contains: "Acquisition", mode: "insensitive" } } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: { contains: "Cession", mode: "insensitive" } } }),
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
        company: { select: { name: true, slug: true } },
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

  return {
    stats: { totalDeclarations, totalCompanies, totalInsiders, totalBuys, totalSells },
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

      {/* ── Hero ──────────────────────────────────────────── */}
      <section className="mb-16 animate-fade-in">
        {/* Live pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8"
          style={{ background: "var(--c-mint-bg)", border: "1px solid var(--c-mint-bd)" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--c-mint)" }} />
          <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-mint)" }}>
            Données AMF · Temps réel
          </span>
        </div>

        {/* Main headline */}
        <h1 className="heading-hero mb-6" style={{ maxWidth: "640px" }}>
          Intelligence des
          <br />
          <span className="text-gradient-brand">transactions dirigeants</span>
        </h1>
        <p className="mb-8" style={{ fontSize: "1.05rem", color: "var(--tx-2)", maxWidth: "520px", lineHeight: 1.65 }}>
          Suivez les déclarations publiées par l'AMF, détectez les signaux d'accumulation et analysez les patterns historiques.
        </p>

        {/* CTA row */}
        <div className="flex flex-wrap gap-3">
          <Link href="/companies" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 3h18v4H3zM3 10h11v4H3zM3 17h7v4H3z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Explorer les sociétés
          </Link>
          <Link href="/backtest" className="btn btn-glass">
            Backtesting →
          </Link>
        </div>
      </section>

      {/* ── KPI Strip ────────────────────────────────────── */}
      <section className="mb-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            value={stats.totalDeclarations.toLocaleString("fr-FR")}
            label="Déclarations totales"
            sub="depuis 2022"
            accent="indigo"
          />
          <KpiCard
            value={stats.totalCompanies.toLocaleString("fr-FR")}
            label="Sociétés suivies"
            sub="cotées françaises"
            accent="mint"
          />
          <KpiCard
            value={`${buyPct}%`}
            label="Achats vs ventes"
            sub={`${stats.totalBuys.toLocaleString("fr-FR")} achats`}
            accent="mint"
          />
          <KpiCard
            value={stats.totalInsiders.toLocaleString("fr-FR")}
            label="Dirigeants identifiés"
            sub="PDG, DG, CA…"
            accent="indigo"
          />
        </div>
      </section>

      {/* ── Signals du moment ───────────────────────────── */}
      {highScoreSignals.length > 0 && (
        <section className="mb-16">
          <SectionHeader
            title="Signaux du moment"
            sub="Achats avec score signal ≥ 65 — les plus récents"
            action={{ label: "Voir le backtesting →", href: "/backtest" }}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-5">
            {highScoreSignals.slice(0, 6).map((sig) => (
              <SignalCard key={sig.id} sig={sig} />
            ))}
          </div>
        </section>
      )}

      {/* ── Backtest teaser ─────────────────────────────── */}
      {backtestSnapshot && (
        <section className="mb-16">
          <HomeBacktestWidget snapshot={backtestSnapshot} />
        </section>
      )}

      {/* ── Live feed ─────────────────────────────────── */}
      <HomeLive initial={initial} />

    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({ value, label, sub, accent }: { value: string; label: string; sub?: string; accent: "indigo" | "mint" | "red" }) {
  const styles = {
    indigo: { top: "var(--c-indigo)", border: "var(--c-indigo-bd)", color: "var(--c-indigo-2)", darkColor: "var(--c-indigo-2)", lightColor: "var(--c-indigo-3)" },
    mint:   { top: "var(--c-mint)",   border: "var(--c-mint-bd)",   color: "var(--c-mint)",     darkColor: "var(--c-mint)",     lightColor: "#007a5a" },
    red:    { top: "var(--c-red)",    border: "var(--c-red-bd)",    color: "var(--c-red)",      darkColor: "var(--c-red)",      lightColor: "#cc1a32" },
  };
  const s = styles[accent];
  return (
    <div className="card p-5" style={{
      borderColor: s.border,
      borderTopWidth: "3px",
      borderTopColor: s.top,
    }}>
      <div className="stat-value mb-1" style={{ color: s.color }}>{value}</div>
      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--tx-1)", letterSpacing: "-0.01em" }}>{label}</div>
      {sub && <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "3px", fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: { label: string; href: string } }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-1">
      <div>
        <div className="flex items-center gap-2.5">
          <div style={{ width: "3px", height: "18px", background: "var(--c-indigo)", borderRadius: "2px", flexShrink: 0 }} />
          <h2 className="heading-section">{title}</h2>
        </div>
        {sub && <p style={{ fontSize: "0.8rem", color: "var(--tx-3)", marginTop: "4px", paddingLeft: "15px" }}>{sub}</p>}
      </div>
      {action && (
        <Link href={action.href} style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--c-indigo-2)", textDecoration: "none", whiteSpace: "nowrap", letterSpacing: "-0.01em" }}
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
  const score = sig.signalScore ?? 0;
  const isHigh = score >= 70;
  const amtStr = sig.totalAmount
    ? sig.totalAmount >= 1e6 ? `${(sig.totalAmount / 1e6).toFixed(1)}M€`
    : sig.totalAmount >= 1e3 ? `${(sig.totalAmount / 1e3).toFixed(0)}k€`
    : `${sig.totalAmount.toFixed(0)}€`
    : null;

  return (
    <Link href={`/company/${sig.company.slug}`}
      className="card p-4 group block"
      style={{ textDecoration: "none" }}>
      <div className="flex items-start justify-between gap-2 mb-3">
        {/* Company initial */}
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm"
          style={{
            background: isHigh ? "var(--c-mint-bg)" : "var(--c-indigo-bg)",
            border: `1px solid ${isHigh ? "var(--c-mint-bd)" : "var(--c-indigo-bd)"}`,
            color: isHigh ? "var(--c-mint)" : "var(--c-indigo-2)",
            fontFamily: "Space Grotesk, sans-serif",
          }}>
          {sig.company.name.charAt(0)}
        </div>

        {/* Score badge */}
        <div className={`score-pill ${isHigh ? "score-high" : "score-mid"}`}>
          {Math.round(score)}
        </div>
      </div>

      <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--tx-1)", marginBottom: "2px", fontFamily: "Space Grotesk, sans-serif" }}>
        {sig.company.name}
      </div>
      {sig.insiderName && (
        <div style={{ fontSize: "0.75rem", color: "var(--tx-3)", marginBottom: "10px" }}>{sig.insiderName}</div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {amtStr && (
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--c-mint)" }}>+{amtStr}</span>
        )}
        {sig.pctOfMarketCap != null && sig.pctOfMarketCap > 0 && (
          <span className="badge badge-amber" style={{ fontFamily: "JetBrains Mono, monospace" }}>
            {sig.pctOfMarketCap < 0.01 ? sig.pctOfMarketCap.toFixed(4)
              : sig.pctOfMarketCap < 0.1 ? sig.pctOfMarketCap.toFixed(3)
              : sig.pctOfMarketCap.toFixed(2)}% mcap
          </span>
        )}
      </div>
    </Link>
  );
}
