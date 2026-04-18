import { prisma } from "@/lib/prisma";
import Link from "next/link";
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
        select: { pubDate: true, insiderName: true, transactionNature: true, totalAmount: true },
      },
    },
  });

  return (
    <div className="content-wrapper">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gradient tracking-tight">Sociétés</h1>
          <p className="text-slate-500 text-sm mt-1">
            {companies.length.toLocaleString("fr-FR")} société{companies.length !== 1 ? "s" : ""}
            {!showAll && " avec déclarations de dirigeants"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncButton />
          <Link href="/companies/add" className="btn-emerald px-4 py-2 rounded-xl text-sm font-semibold">
            + Ajouter
          </Link>
        </div>
      </div>

      {/* Filters + search */}
      <div className="flex flex-wrap gap-3 mb-7">
        <form action="/companies" className="flex-1 min-w-56 relative">
          <input
            name="q"
            defaultValue={q || ""}
            placeholder="Filtrer par nom..."
            className="glass-input w-full pl-9 pr-4 py-2.5 rounded-xl text-sm"
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {all && <input type="hidden" name="all" value="1" />}
        </form>
        <div className="flex items-center gap-1.5 p-1 glass-card-static rounded-xl">
          <Link
            href={`/companies${q ? `?q=${q}` : ""}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${!showAll ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
          >
            Avec déclarations
          </Link>
          <Link
            href={`/companies?all=1${q ? `&q=${q}` : ""}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showAll ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"}`}
          >
            Toutes (2 207)
          </Link>
        </div>
      </div>

      {/* Companies grid */}
      {companies.length === 0 ? (
        <div className="glass-card rounded-3xl p-16 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <h2 className="text-xl font-semibold text-white mb-2">Aucune société trouvée</h2>
          <p className="text-slate-500">Essayez un autre terme de recherche ou{" "}
            <Link href="/companies?all=1" className="text-indigo-400 hover:text-indigo-300">affichez toutes les sociétés</Link>.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => {
            const lastDecl = company.declarations[0];
            const nature = lastDecl?.transactionNature?.toLowerCase();
            const isBuy = nature?.includes("acquisition");
            const isSell = nature?.includes("cession");

            return (
              <Link
                key={company.id}
                href={`/company/${company.slug}`}
                className="glass-card rounded-2xl p-5 flex flex-col gap-3 group"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 border border-indigo-500/15 flex items-center justify-center text-base font-bold text-indigo-300 flex-shrink-0">
                      {company.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors text-sm leading-tight">
                        {company.name}
                      </h3>
                      <span className="text-[10px] font-mono text-slate-600">{company.amfToken}</span>
                    </div>
                  </div>
                  {lastDecl?.totalAmount && (
                    <span className={`text-xs font-bold tabular-nums flex-shrink-0 ${isBuy ? "text-emerald-400" : isSell ? "text-rose-400" : "text-slate-400"}`}>
                      {isBuy ? "▲" : isSell ? "▼" : ""}
                      {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: lastDecl.totalAmount >= 1_000_000 ? "compact" : "standard" }).format(lastDecl.totalAmount)}
                    </span>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-semibold tabular-nums">
                      {company._count.declarations}
                    </span>
                    <span className="text-xs text-slate-600">décl.</span>
                  </div>
                  {lastDecl && (
                    <span className="text-[10px] text-slate-600">
                      {new Date(lastDecl.pubDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}
                    </span>
                  )}
                </div>

                {/* Last insider */}
                {lastDecl?.insiderName && (
                  <div className="text-[11px] text-slate-600 truncate">
                    <span className="text-slate-500">{lastDecl.insiderName}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
