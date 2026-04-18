import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function InsidersPage() {
  const insiders = await prisma.insider.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { declarations: true } },
      companies: {
        include: { company: { select: { name: true, slug: true } } },
        take: 3,
      },
      declarations: {
        orderBy: { pubDate: "desc" },
        take: 1,
        select: { pubDate: true },
      },
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Dirigeants</h1>
        <p className="text-gray-400 mt-1">
          {insiders.length} dirigeant{insiders.length !== 1 ? "s" : ""} dans la base
        </p>
      </div>

      {insiders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700 p-16 text-center">
          <div className="text-5xl mb-4">👤</div>
          <h2 className="text-xl font-semibold text-white mb-2">
            Aucun dirigeant enregistré
          </h2>
          <p className="text-gray-400 mb-6">
            Les dirigeants apparaissent automatiquement lors des synchronisations des déclarations.
          </p>
          <Link
            href="/companies/add"
            className="inline-flex px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
          >
            Ajouter une société
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {insiders.map((insider) => (
            <Link
              key={insider.id}
              href={`/insider/${insider.slug}`}
              className="group rounded-xl border border-gray-800 bg-gray-900/30 hover:bg-gray-900/60 hover:border-gray-700 transition-all p-5"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500/20 to-pink-500/20 border border-violet-500/20 flex items-center justify-center text-sm font-bold text-violet-400">
                  {insider.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-white group-hover:text-emerald-400 transition-colors">
                    {insider.name}
                  </h3>
                  {insider.companies[0]?.function && (
                    <p className="text-xs text-gray-500">
                      {insider.companies[0].function}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {insider.companies.map((ci) => (
                  <span
                    key={ci.company.slug}
                    className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400"
                  >
                    {ci.company.name}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800">
                <span className="text-sm text-gray-400">
                  {insider._count.declarations} déclaration
                  {insider._count.declarations !== 1 ? "s" : ""}
                </span>
                {insider.declarations[0] && (
                  <span className="text-xs text-gray-500">
                    {formatDate(insider.declarations[0].pubDate)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
