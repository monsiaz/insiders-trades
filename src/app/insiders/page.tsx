import { prisma } from "@/lib/prisma";
import Link from "next/link";

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
        select: { pubDate: true, transactionNature: true, totalAmount: true, currency: true },
      },
    },
  });

  return (
    <div className="content-wrapper">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gradient tracking-tight">Dirigeants</h1>
        <p className="text-slate-500 text-sm mt-1">
          {insiders.length} dirigeant{insiders.length !== 1 ? "s" : ""} dans la base
        </p>
      </div>

      {insiders.length === 0 ? (
        <div className="glass-card rounded-3xl p-16 text-center">
          <div className="text-5xl mb-4">👤</div>
          <h2 className="text-xl font-semibold text-white mb-2">Aucun dirigeant enregistré</h2>
          <p className="text-slate-500 mb-6">Les dirigeants apparaissent lors des synchronisations.</p>
          <Link href="/companies/add" className="btn-emerald px-5 py-2.5 rounded-xl text-sm font-semibold">
            Ajouter une société
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {insiders.map((insider) => {
            const initials = insider.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
            const lastDecl = insider.declarations[0];
            const nature = lastDecl?.transactionNature?.toLowerCase();

            return (
              <Link
                key={insider.id}
                href={`/insider/${insider.slug}`}
                className="glass-card rounded-2xl p-5 group flex flex-col gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500/15 to-fuchsia-500/15 border border-violet-500/20 flex items-center justify-center text-sm font-bold text-violet-300 flex-shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-200 group-hover:text-white transition-colors truncate">
                      {insider.name}
                    </h3>
                    {insider.companies[0]?.function && (
                      <p className="text-xs text-slate-600 truncate">{insider.companies[0].function}</p>
                    )}
                  </div>
                  {lastDecl?.totalAmount && (
                    <span className={`ml-auto text-xs font-bold tabular-nums flex-shrink-0 ${nature?.includes("cession") ? "text-rose-400" : "text-emerald-400"}`}>
                      {nature?.includes("cession") ? "▼" : "▲"}
                      {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: lastDecl.totalAmount >= 1_000_000 ? "compact" : "standard" }).format(lastDecl.totalAmount)}
                    </span>
                  )}
                </div>

                {/* Companies */}
                <div className="flex flex-wrap gap-1.5">
                  {insider.companies.map((ci) => (
                    <span key={ci.company.slug} className="text-[10px] px-2 py-0.5 rounded-full glass-card-static text-slate-500 border-white/5">
                      {ci.company.name}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="text-xs text-slate-500 font-semibold">
                    {insider._count.declarations} décl.
                  </span>
                  {lastDecl && (
                    <span className="text-[10px] text-slate-600">
                      {new Date(lastDecl.pubDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" })}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
