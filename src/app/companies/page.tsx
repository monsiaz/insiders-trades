import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { SyncButton } from "@/components/SyncButton";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ all?: string; q?: string }>;
}

export default async function CompaniesPage({ searchParams }: Props) {
  const { all, q } = await searchParams;
  const showAll = all === "1";

  const where = {
    ...(q ? { name: { contains: q.toUpperCase() } } : {}),
    ...(!showAll ? { declarations: { some: { type: "DIRIGEANTS" as const } } } : {}),
  };

  const companies = await prisma.company.findMany({
    where,
    orderBy: { name: "asc" },
    include: {
      _count: { select: { declarations: true } },
      declarations: {
        where: { type: "DIRIGEANTS" },
        orderBy: { pubDate: "desc" },
        take: 1,
        select: { pubDate: true },
      },
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Sociétés suivies</h1>
          <p className="text-gray-400 mt-1">
            {companies.length} société{companies.length !== 1 ? "s" : ""}
            {!showAll && " avec déclarations de dirigeants"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SyncButton />
          <Link
            href="/companies/add"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
          >
            + Ajouter
          </Link>
        </div>
      </div>

      {/* Search + Filter bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <form action="/companies" className="flex-1 min-w-64">
          <input
            name="q"
            defaultValue={q || ""}
            placeholder="Rechercher une société..."
            className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-sm"
          />
          {all && <input type="hidden" name="all" value="1" />}
        </form>
        <div className="flex items-center gap-2">
          <Link
            href={`/companies${q ? `?q=${q}` : ""}`}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${!showAll ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
          >
            Avec déclarations
          </Link>
          <Link
            href={`/companies?all=1${q ? `&q=${q}` : ""}`}
            className={`px-3 py-2 rounded-lg text-sm transition-colors ${showAll ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"}`}
          >
            Toutes (2207)
          </Link>
        </div>
      </div>

      {companies.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700 p-16 text-center">
          <div className="text-5xl mb-4">🏢</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Aucune société ajoutée
          </h2>
          <p className="text-gray-400 mb-6">
            Ajoutez des sociétés avec leur jeton AMF pour commencer le suivi.
          </p>
          <Link
            href="/companies/add"
            className="inline-flex px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
          >
            + Ajouter une société
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/company/${company.slug}`}
              className="group rounded-xl border border-gray-800 bg-gray-900/30 hover:bg-gray-900/60 hover:border-gray-700 transition-all p-5"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center text-lg font-bold text-emerald-400">
                  {company.name.charAt(0)}
                </div>
                <span className="text-xs text-gray-500 font-mono bg-gray-800 px-2 py-1 rounded">
                  {company.amfToken}
                </span>
              </div>

              <h3 className="font-semibold text-white group-hover:text-emerald-400 transition-colors mb-1">
                {company.name}
              </h3>

              {company.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                  {company.description}
                </p>
              )}

              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
                <span className="text-sm text-gray-400">
                  {company._count.declarations} déclaration
                  {company._count.declarations !== 1 ? "s" : ""}
                </span>
                {company.declarations[0] && (
                  <span className="text-xs text-gray-500">
                    {formatDate(company.declarations[0].pubDate)}
                  </span>
                )}
              </div>

              {company.isin && (
                <div className="mt-2 text-xs text-gray-500">
                  ISIN: <span className="font-mono text-gray-400">{company.isin}</span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
