import { prisma } from "@/lib/prisma";
import { DeclarationCard } from "@/components/DeclarationCard";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getStats() {
  const since90d = new Date(Date.now() - 90 * 86400_000);

  const [
    totalDeclarations,
    totalCompanies,
    totalInsiders,
    totalBuys,
    totalSells,
    recentDeclarations,
    topCompanies,
    topInsiders,
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
        pdfParsed: true, signalScore: true, pctOfMarketCap: true,
        company: { select: { name: true, slug: true } },
        insider: { select: { name: true, slug: true } },
      },
    }),

    // Top 30 companies: most active (by total declared volume) in last 90 days
    prisma.declaration.groupBy({
      by: ["companyId"],
      where: {
        type: "DIRIGEANTS",
        totalAmount: { not: null },
        pubDate: { gte: since90d },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 30,
    }),

    // Top 30 insiders by total volume (all-time)
    prisma.declaration.groupBy({
      by: ["insiderName"],
      where: {
        type: "DIRIGEANTS",
        totalAmount: { not: null },
        insiderName: { not: null },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 30,
    }),
  ]);

  // Resolve company details for topCompanies
  const companyIds = topCompanies.map((r) => r.companyId);
  const companyDetails = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true, slug: true, marketCap: true },
  });
  const companyMap = new Map(companyDetails.map((c) => [c.id, c]));

  const topCompaniesEnriched = topCompanies.map((r) => ({
    ...r,
    company: companyMap.get(r.companyId),
  }));

  // Resolve insider details (slug from Insider table)
  const insiderNames = topInsiders.map((r) => r.insiderName!).filter(Boolean);
  const insiderDetails = await prisma.insider.findMany({
    where: { name: { in: insiderNames } },
    select: { name: true, slug: true },
  });
  const insiderMap = new Map(insiderDetails.map((i) => [i.name, i]));

  const topInsidersEnriched = topInsiders.map((r) => ({
    ...r,
    insider: insiderMap.get(r.insiderName ?? ""),
  }));

  return {
    totalDeclarations, totalCompanies, totalInsiders,
    totalBuys, totalSells, recentDeclarations,
    topCompanies: topCompaniesEnriched,
    topInsiders: topInsidersEnriched,
  };
}

function fmtAmount(n: number | null | undefined): string {
  if (!n) return "–";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}Md€`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M€`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k€`;
  return `${n.toFixed(0)}€`;
}

function fmtMcap(n: bigint | null | undefined): string {
  if (!n) return "";
  const v = Number(n);
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}Md€`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M€`;
  return "";
}

export default async function HomePage() {
  const {
    totalDeclarations, totalCompanies, totalInsiders,
    totalBuys, totalSells, recentDeclarations,
    topCompanies, topInsiders,
  } = await getStats();

  return (
    <div className="content-wrapper">
      {/* Hero */}
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

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-14 animate-fade-in-delay">
        <StatTile label="Déclarations" value={totalDeclarations.toLocaleString("fr-FR")} icon="📋" accent="indigo" />
        <StatTile label="Sociétés" value={totalCompanies.toLocaleString("fr-FR")} icon="🏢" accent="violet" />
        <StatTile label="Dirigeants" value={totalInsiders.toLocaleString("fr-FR")} icon="👤" accent="slate" className="hidden sm:flex" />
        <StatTile label="Achats" value={totalBuys.toLocaleString("fr-FR")} icon="▲" accent="emerald" />
        <StatTile label="Ventes" value={totalSells.toLocaleString("fr-FR")} icon="▼" accent="rose" />
      </div>

      {/* Two-column rankings */}
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
          <ol className="space-y-1.5">
            {topCompanies.map((row, i) => (
              <li key={row.companyId}>
                <Link
                  href={row.company ? `/company/${row.company.slug}` : "#"}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <span className="text-xs font-mono text-slate-500 w-5 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                        {row.company?.name ?? "—"}
                      </span>
                      {row.company?.marketCap && (
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {fmtMcap(row.company.marketCap)}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {row._count.id} transaction{row._count.id > 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-emerald-400">
                      {fmtAmount(row._sum.totalAmount)}
                    </div>
                  </div>
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
          <ol className="space-y-1.5">
            {topInsiders.map((row, i) => (
              <li key={row.insiderName}>
                <Link
                  href={row.insider ? `/insider/${row.insider.slug}` : "#"}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <span className="text-xs font-mono text-slate-500 w-5 text-right shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                      {row.insiderName}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {row._count.id} transaction{row._count.id > 1 ? "s" : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-indigo-400">
                      {fmtAmount(row._sum.totalAmount)}
                    </div>
                  </div>
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
            <Link
              href="/companies"
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium"
            >
              Toutes les sociétés →
            </Link>
          </div>
          <div className="space-y-2">
            {recentDeclarations.map((decl) => (
              <DeclarationCard key={decl.id} declaration={decl} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  accent,
  className = "",
}: {
  label: string;
  value: string;
  icon: string;
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
    <div
      className={`glass-card-static rounded-2xl p-4 bg-gradient-to-br ${accentMap[accent]} flex flex-col gap-2 ${className}`}
    >
      <span className="text-base">{icon}</span>
      <div className="stat-number">{value}</div>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
    </div>
  );
}
