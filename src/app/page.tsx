import { prisma } from "@/lib/prisma";
import { DeclarationCard } from "@/components/DeclarationCard";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getStats() {
  const [
    totalDeclarations,
    totalCompanies,
    totalInsiders,
    totalEnriched,
    totalBuys,
    totalSells,
    recentDeclarations,
  ] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.company.count({ where: { declarations: { some: { type: "DIRIGEANTS" } } } }),
    prisma.insider.count(),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true, insiderName: { not: null } } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: { contains: "Acquisition", mode: "insensitive" } } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", transactionNature: { contains: "Cession", mode: "insensitive" } } }),
    prisma.declaration.findMany({
      where: { type: "DIRIGEANTS" },
      orderBy: { pubDate: "desc" },
      take: 30,
      select: {
        id: true, amfId: true, type: true, pubDate: true, link: true, description: true,
        insiderName: true, insiderFunction: true, transactionNature: true,
        instrumentType: true, isin: true, unitPrice: true, volume: true,
        totalAmount: true, currency: true, transactionDate: true, transactionVenue: true,
        pdfParsed: true,
        company: { select: { name: true, slug: true } },
        insider: { select: { name: true, slug: true } },
      },
    }),
  ]);

  return {
    totalDeclarations, totalCompanies, totalInsiders, totalEnriched,
    totalBuys, totalSells, recentDeclarations,
  };
}

export default async function HomePage() {
  const {
    totalDeclarations, totalCompanies, totalInsiders,
    totalBuys, totalSells, recentDeclarations,
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-12 animate-fade-in-delay">
        <StatTile label="Déclarations" value={totalDeclarations.toLocaleString("fr-FR")} icon="📋" accent="indigo" />
        <StatTile label="Sociétés" value={totalCompanies.toLocaleString("fr-FR")} icon="🏢" accent="violet" />
        <StatTile label="Dirigeants" value={totalInsiders.toLocaleString("fr-FR")} icon="👤" accent="slate" className="hidden sm:flex" />
        <StatTile label="Achats" value={totalBuys.toLocaleString("fr-FR")} icon="▲" accent="emerald" />
        <StatTile label="Ventes" value={totalSells.toLocaleString("fr-FR")} icon="▼" accent="rose" />
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
