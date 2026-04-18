import { prisma } from "@/lib/prisma";
import { DeclarationCard } from "@/components/DeclarationCard";
import { StatsCard } from "@/components/StatsCard";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getStats() {
  const [totalDeclarations, totalCompanies, totalInsiders, recentDeclarations] =
    await Promise.all([
      prisma.declaration.count(),
      prisma.company.count(),
      prisma.insider.count(),
      prisma.declaration.findMany({
        where: { type: "DIRIGEANTS" },
        orderBy: { pubDate: "desc" },
        take: 20,
        include: {
          company: { select: { name: true, slug: true } },
          insider: { select: { name: true, slug: true } },
        },
      }),
    ]);

  return { totalDeclarations, totalCompanies, totalInsiders, recentDeclarations };
}

export default async function HomePage() {
  const { totalDeclarations, totalCompanies, totalInsiders, recentDeclarations } =
    await getStats();

  const hasData = totalCompanies > 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero */}
      <div className="mb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Données AMF · Temps réel
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
          Transactions des{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
            dirigeants
          </span>
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Suivez en temps réel les déclarations de transactions des dirigeants
          (insiders) publiées par l&apos;Autorité des marchés financiers.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-12">
        <StatsCard
          label="Déclarations"
          value={totalDeclarations.toLocaleString("fr-FR")}
          icon="📋"
        />
        <StatsCard
          label="Sociétés suivies"
          value={totalCompanies.toLocaleString("fr-FR")}
          icon="🏢"
        />
        <StatsCard
          label="Dirigeants"
          value={totalInsiders.toLocaleString("fr-FR")}
          icon="👤"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {!hasData && (
        <div className="rounded-2xl border border-dashed border-gray-700 p-16 text-center mb-12">
          <div className="text-5xl mb-4">🚀</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Aucune société suivie pour l&apos;instant
          </h2>
          <p className="text-gray-400 mb-6 max-w-md mx-auto">
            Ajoutez des sociétés à suivre en utilisant leur jeton AMF pour
            commencer à recevoir les déclarations.
          </p>
          <Link
            href="/companies/add"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
          >
            + Ajouter une société
          </Link>
        </div>
      )}

      {/* Recent declarations */}
      {recentDeclarations.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">
              Dernières déclarations de dirigeants
            </h2>
            <Link
              href="/companies"
              className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Voir toutes les sociétés →
            </Link>
          </div>

          <div className="space-y-3">
            {recentDeclarations.map((decl) => (
              <DeclarationCard key={decl.id} declaration={decl} />
            ))}
          </div>
        </div>
      )}

      {hasData && recentDeclarations.length === 0 && (
        <div className="rounded-2xl border border-gray-800 p-12 text-center">
          <div className="text-4xl mb-4">📭</div>
          <h2 className="text-lg font-semibold text-white mb-2">
            Aucune déclaration de dirigeants
          </h2>
          <p className="text-gray-400 mb-4">
            Lancez une synchronisation pour récupérer les dernières déclarations.
          </p>
          <Link
            href="/companies"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium transition-colors"
          >
            Gérer les sociétés →
          </Link>
        </div>
      )}
    </div>
  );
}
