import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DeclarationCard } from "@/components/DeclarationCard";
import { StatsCard } from "@/components/StatsCard";
import { formatDate } from "@/lib/utils";

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
      companies: {
        include: { company: { select: { name: true, slug: true } } },
      },
      _count: { select: { declarations: true } },
    },
  });

  if (!insider) notFound();

  const [declarations, totalCount] = await Promise.all([
    prisma.declaration.findMany({
      where: { insiderId: insider.id },
      orderBy: { pubDate: "desc" },
      take: limit,
      skip: offset,
      include: {
        company: { select: { name: true, slug: true } },
        insider: { select: { name: true, slug: true } },
      },
    }),
    prisma.declaration.count({ where: { insiderId: insider.id } }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  const lastDecl = declarations[0];
  const firstDecl = await prisma.declaration.findFirst({
    where: { insiderId: insider.id },
    orderBy: { pubDate: "asc" },
    select: { pubDate: true },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link
        href="/insiders"
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-6 inline-flex items-center gap-1"
      >
        ← Dirigeants
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500/20 to-pink-500/20 border border-violet-500/20 flex items-center justify-center text-2xl font-bold text-violet-400">
            {insider.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{insider.name}</h1>
            {insider.companies[0]?.function && (
              <p className="text-gray-400 mt-1">{insider.companies[0].function}</p>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              {insider.companies.map((ci) => (
                <Link
                  key={ci.company.slug}
                  href={`/company/${ci.company.slug}`}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  🏢 {ci.company.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <StatsCard
          label="Déclarations total"
          value={totalCount.toString()}
          icon="📋"
        />
        <StatsCard
          label="Première déclaration"
          value={firstDecl ? formatDate(firstDecl.pubDate) : "—"}
          icon="📅"
        />
        <StatsCard
          label="Dernière déclaration"
          value={lastDecl ? formatDate(lastDecl.pubDate) : "—"}
          icon="🕐"
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Declarations */}
      <h2 className="text-lg font-semibold text-white mb-4">
        Déclarations ({totalCount})
      </h2>

      <div className="space-y-3">
        {declarations.length === 0 ? (
          <div className="rounded-xl border border-gray-800 p-12 text-center text-gray-500">
            Aucune déclaration trouvée
          </div>
        ) : (
          declarations.map((decl) => (
            <DeclarationCard key={decl.id} declaration={decl} showCompany />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {pageNum > 1 && (
            <Link
              href={`/insider/${slug}?page=${pageNum - 1}`}
              className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-sm"
            >
              ← Précédent
            </Link>
          )}
          <span className="text-sm text-gray-500">
            Page {pageNum} / {totalPages}
          </span>
          {pageNum < totalPages && (
            <Link
              href={`/insider/${slug}?page=${pageNum + 1}`}
              className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-sm"
            >
              Suivant →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
