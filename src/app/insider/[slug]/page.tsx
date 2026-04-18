import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DeclarationCard } from "@/components/DeclarationCard";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function InsiderPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page || "1", 10));
  const limit = 25;
  const offset = (pageNum - 1) * limit;

  const insider = await prisma.insider.findUnique({
    where: { slug },
    include: {
      companies: { include: { company: { select: { name: true, slug: true } } } },
      _count: { select: { declarations: true } },
    },
  });
  if (!insider) notFound();

  const [declarations, totalCount, buyAgg, sellAgg] = await Promise.all([
    prisma.declaration.findMany({
      where: { insiderId: insider.id },
      orderBy: { pubDate: "desc" },
      take: limit,
      skip: offset,
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
    prisma.declaration.count({ where: { insiderId: insider.id } }),
    prisma.declaration.aggregate({
      where: { insiderId: insider.id, transactionNature: { contains: "Acquisition", mode: "insensitive" } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.declaration.aggregate({
      where: { insiderId: insider.id, transactionNature: { contains: "Cession", mode: "insensitive" } },
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);
  const initials = insider.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const fmt = (v: number | null | undefined) =>
    v ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: v >= 1_000_000 ? "compact" : "standard" }).format(v) : "—";

  return (
    <div className="content-wrapper">
      {/* Back */}
      <Link href="/insiders" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6">
        ← Dirigeants
      </Link>

      {/* Hero */}
      <div className="glass-card-static rounded-3xl p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/25 flex items-center justify-center text-xl font-bold text-violet-300">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{insider.name}</h1>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {insider.companies.map((ci) => (
                <Link
                  key={ci.company.slug}
                  href={`/company/${ci.company.slug}`}
                  className="text-xs px-2.5 py-1 rounded-full glass-card-static border-white/8 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {ci.company.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
        <div className="glass-card-static rounded-2xl p-4 bg-gradient-to-br from-indigo-500/8 to-transparent border-indigo-500/12">
          <div className="text-xl font-bold text-white">{insider._count.declarations}</div>
          <div className="text-xs text-slate-500 mt-1">Déclarations totales</div>
        </div>
        <div className="glass-card-static rounded-2xl p-4 bg-gradient-to-br from-sky-500/8 to-transparent border-sky-500/12">
          <div className="text-xl font-bold text-white">{insider.companies.length}</div>
          <div className="text-xs text-slate-500 mt-1">Société{insider.companies.length > 1 ? "s" : ""}</div>
        </div>
        <div className="glass-card-static rounded-2xl p-4 bg-gradient-to-br from-emerald-500/8 to-transparent border-emerald-500/12">
          <div className="text-xl font-bold text-emerald-400">{fmt(buyAgg._sum.totalAmount)}</div>
          <div className="text-xs text-slate-500 mt-1">▲ Achats ({buyAgg._count} opér.)</div>
        </div>
        <div className="glass-card-static rounded-2xl p-4 bg-gradient-to-br from-rose-500/8 to-transparent border-rose-500/12">
          <div className="text-xl font-bold text-rose-400">{fmt(sellAgg._sum.totalAmount)}</div>
          <div className="text-xs text-slate-500 mt-1">▼ Ventes ({sellAgg._count} opér.)</div>
        </div>
      </div>

      {/* Declarations */}
      <div className="space-y-2">
        {declarations.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center text-slate-500">
            Aucune déclaration
          </div>
        ) : (
          declarations.map((decl) => <DeclarationCard key={decl.id} declaration={decl} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          {pageNum > 1 && (
            <Link href={`/insider/${slug}?page=${pageNum - 1}`} className="btn-glass px-4 py-2 rounded-xl text-sm font-medium">
              ← Précédent
            </Link>
          )}
          <span className="text-sm text-slate-500">Page {pageNum} / {totalPages}</span>
          {pageNum < totalPages && (
            <Link href={`/insider/${slug}?page=${pageNum + 1}`} className="btn-glass px-4 py-2 rounded-xl text-sm font-medium">
              Suivant →
            </Link>
          )}
        </div>
      )}
      <div className="mt-4 text-center text-xs text-slate-700">
        {totalCount} déclaration{totalCount !== 1 ? "s" : ""} au total
      </div>
    </div>
  );
}
