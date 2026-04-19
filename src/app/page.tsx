import { prisma } from "@/lib/prisma";
import { HomeLive } from "@/components/HomeLive";
import { HomeBacktestWidget } from "@/components/HomeBacktestWidget";
import Link from "next/link";

// Always render fresh on the server — client takes over auto-refresh
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
  } catch {
    return null;
  }
}

async function getHighScoreSignals() {
  try {
    const signals = await prisma.declaration.findMany({
      where: {
        type: "DIRIGEANTS",
        transactionNature: { contains: "Acquisition", mode: "insensitive" },
        signalScore: { gte: 70 },
        pdfParsed: true,
        totalAmount: { gt: 0 },
      },
      orderBy: { pubDate: "desc" },
      take: 5,
      select: {
        id: true,
        amfId: true,
        pubDate: true,
        transactionDate: true,
        insiderName: true,
        insiderFunction: true,
        totalAmount: true,
        currency: true,
        signalScore: true,
        pctOfMarketCap: true,
        isin: true,
        company: { select: { name: true, slug: true } },
      },
    });
    return signals.map((s) => ({
      ...s,
      pubDate: s.pubDate.toISOString(),
      transactionDate: s.transactionDate?.toISOString() ?? null,
    }));
  } catch {
    return [];
  }
}

async function getInitialData() {
  const since90d = new Date(Date.now() - 90 * 86400_000);

  const [
    totalDeclarations,
    totalCompanies,
    totalInsiders,
    totalBuys,
    totalSells,
    recentDeclarations,
    topCompaniesRaw,
    topInsidersRaw,
  ] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.company.count({ where: { declarations: { some: { type: "DIRIGEANTS" } } } }),
    prisma.insider.count(),
    prisma.declaration.count({
      where: { type: "DIRIGEANTS", transactionNature: { contains: "Acquisition", mode: "insensitive" } },
    }),
    prisma.declaration.count({
      where: { type: "DIRIGEANTS", transactionNature: { contains: "Cession", mode: "insensitive" } },
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
        company: { select: { name: true, slug: true } },
        insider: { select: { name: true, slug: true } },
      },
    }),
    prisma.declaration.groupBy({
      by: ["companyId"],
      where: { type: "DIRIGEANTS", totalAmount: { not: null }, pubDate: { gte: since90d } },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 30,
    }),
    prisma.declaration.groupBy({
      by: ["insiderName"],
      where: { type: "DIRIGEANTS", totalAmount: { not: null }, insiderName: { not: null } },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 30,
    }),
  ]);

  // Resolve company details
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
      company: co
        ? { name: co.name, slug: co.slug, marketCap: co.marketCap ? Number(co.marketCap) : null }
        : null,
    };
  });

  // Resolve insider slugs
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
    stats: { totalDeclarations, totalCompanies, totalInsiders, totalBuys, totalSells },
    recentDeclarations: recentDeclarations.map((d) => ({
      ...d,
      pubDate: d.pubDate.toISOString(),
      transactionDate: d.transactionDate?.toISOString() ?? null,
    })),
    topCompanies,
    topInsiders,
    updatedAt: new Date().toISOString(),
  };
}

export default async function HomePage() {
  const [initial, backtestSnapshot, highScoreSignals] = await Promise.all([
    getInitialData(),
    getBacktestSnapshot(),
    getHighScoreSignals(),
  ]);

  return (
    <div className="content-wrapper">
      {/* Hero — static */}
      <div className="mb-14 text-center animate-fade-in">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass-card-static text-emerald-400 text-xs font-semibold mb-7 border-emerald-500/15">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Données AMF · Mis à jour en continu
        </div>
        <h1 className="heading-hero text-gradient mb-5">
          Transactions des
          <br />
          <span className="text-gradient-indigo">dirigeants</span>
        </h1>
        <p className="text-lg text-slate-400 max-w-xl mx-auto leading-relaxed">
          Suivez les déclarations publiées par l'AMF pour toutes les sociétés cotées françaises — en temps réel.
        </p>
        <div className="flex items-center justify-center gap-3 mt-8">
          <Link href="/companies" className="btn-emerald px-5 py-2.5 rounded-xl text-sm font-semibold">
            Explorer les sociétés
          </Link>
          <Link href="/insiders" className="btn-glass px-5 py-2.5 rounded-xl text-sm font-semibold">
            Voir les dirigeants
          </Link>
        </div>
      </div>

      {/* High-score signals section */}
      {highScoreSignals.length > 0 && (
        <div className="mb-14">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">🎯 Signaux du moment</h2>
              <p className="text-xs text-slate-500 mt-0.5">Achats de dirigeants avec score signal ≥ 70</p>
            </div>
            <Link href="/backtest" className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium">
              Voir le backtesting →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {highScoreSignals.slice(0, 5).map((sig) => (
              <Link key={sig.id} href={`/company/${sig.company.slug}`} className="glass-card rounded-2xl p-4 hover:bg-white/8 transition-all group">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-violet-500/20 border border-emerald-500/15 flex items-center justify-center text-base font-bold text-emerald-300 flex-shrink-0">
                    {sig.company.name.charAt(0)}
                  </div>
                  <SignalPill score={sig.signalScore!} />
                </div>
                <div className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors truncate mb-0.5">
                  {sig.company.name}
                </div>
                {sig.insiderName && (
                  <div className="text-xs text-slate-500 truncate mb-2">{sig.insiderName}</div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {sig.totalAmount && (
                    <span className="text-xs font-bold text-emerald-400">
                      {sig.totalAmount >= 1e6
                        ? `+${(sig.totalAmount / 1e6).toFixed(1)}M€`
                        : sig.totalAmount >= 1e3
                        ? `+${(sig.totalAmount / 1e3).toFixed(0)}k€`
                        : `+${sig.totalAmount.toFixed(0)}€`}
                    </span>
                  )}
                  {sig.pctOfMarketCap != null && sig.pctOfMarketCap > 0 && (
                    <span className="text-[11px] text-amber-400/80 bg-amber-400/8 border border-amber-400/15 px-1.5 py-0.5 rounded tabular-nums">
                      {sig.pctOfMarketCap < 0.01
                        ? `${sig.pctOfMarketCap.toFixed(4)}% mcap`
                        : sig.pctOfMarketCap < 0.1
                        ? `${sig.pctOfMarketCap.toFixed(3)}% mcap`
                        : `${sig.pctOfMarketCap.toFixed(2)}% mcap`}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Backtest widget */}
      {backtestSnapshot && (
        <div className="mb-14">
          <HomeBacktestWidget snapshot={backtestSnapshot} />
        </div>
      )}

      {/* Live section — stats, rankings, recent transactions — client auto-refresh */}
      <HomeLive initial={initial} />
    </div>
  );
}

function SignalPill({ score }: { score: number }) {
  if (score >= 70) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/15 border border-emerald-400/25 text-emerald-300 flex-shrink-0">
      ⚡ {Math.round(score)}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-400/15 border border-amber-400/25 text-amber-300 flex-shrink-0">
      ◆ {Math.round(score)}
    </span>
  );
}
