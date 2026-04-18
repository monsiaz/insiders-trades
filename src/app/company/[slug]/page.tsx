import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DeclarationCard } from "@/components/DeclarationCard";
import { StatsCard } from "@/components/StatsCard";
import { CompanySyncButton } from "@/components/CompanySyncButton";
import { EnrichButton } from "@/components/EnrichButton";
import { formatDate } from "@/lib/utils";
import { DeclarationType } from "@prisma/client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ type?: string; page?: string }>;
}

export default async function CompanyPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { type, page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page || "1", 10));
  const limit = 25;
  const offset = (pageNum - 1) * limit;

  const filterType = type as DeclarationType | undefined;

  const company = await prisma.company.findUnique({
    where: { slug },
    include: {
      _count: { select: { declarations: true, insiders: true } },
    },
  });

  if (!company) notFound();

  const where = {
    companyId: company.id,
    ...(filterType ? { type: filterType } : {}),
  };

  const [declarations, totalCount] = await Promise.all([
    prisma.declaration.findMany({
      where,
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
    prisma.declaration.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  const typeCounts = await prisma.declaration.groupBy({
    by: ["type"],
    where: { companyId: company.id },
    _count: true,
  });

  const typeMap = Object.fromEntries(typeCounts.map((t) => [t.type, t._count]));

  const lastDecl = await prisma.declaration.findFirst({
    where: { companyId: company.id, type: "DIRIGEANTS" },
    orderBy: { pubDate: "desc" },
    select: { pubDate: true },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Back */}
      <Link
        href="/companies"
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors mb-6 inline-flex items-center gap-1"
      >
        ← Sociétés
      </Link>

      {/* Company header */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center text-2xl font-bold text-emerald-400">
              {company.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{company.name}</h1>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <span className="text-sm text-gray-500 font-mono">{company.amfToken}</span>
                {company.isin && (
                  <span className="text-sm text-gray-500">
                    ISIN: <span className="font-mono text-gray-400">{company.isin}</span>
                  </span>
                )}
                {company.market && (
                  <span className="text-sm text-gray-500">{company.market}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CompanySyncButton companyId={company.id} />
            <EnrichButton companyId={company.id} />
            <a
              href={`https://bdif.amf-france.org/fr?xtor=RSS-1`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-lg text-sm border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              AMF ↗
            </a>
          </div>
        </div>

        {company.description && (
          <p className="text-gray-400 mt-4 text-sm">{company.description}</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <StatsCard
          label="Déclarations dirigeants"
          value={(typeMap["DIRIGEANTS"] || 0).toString()}
          icon="📋"
        />
        <StatsCard
          label="Seuils & pactes"
          value={(typeMap["SEUILS"] || 0).toString()}
          icon="📊"
        />
        <StatsCard
          label="Dirigeants suivis"
          value={company._count.insiders.toString()}
          icon="👤"
        />
        <StatsCard
          label="Dernière déclaration"
          value={lastDecl ? formatDate(lastDecl.pubDate) : "—"}
          icon="📅"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { value: undefined, label: "Toutes" },
          { value: "DIRIGEANTS", label: "Dirigeants" },
          { value: "SEUILS", label: "Seuils" },
          { value: "PROSPECTUS", label: "Prospectus" },
          { value: "OTHER", label: "Autre" },
        ].map((f) => (
          <Link
            key={f.label}
            href={`/company/${slug}${f.value ? `?type=${f.value}` : ""}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterType === f.value
                ? "bg-emerald-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
            }`}
          >
            {f.label}
            {f.value && typeMap[f.value] !== undefined && (
              <span className="ml-1.5 text-xs opacity-70">{typeMap[f.value]}</span>
            )}
          </Link>
        ))}
      </div>

      {/* Declarations */}
      <div className="space-y-3">
        {declarations.length === 0 ? (
          <div className="rounded-xl border border-gray-800 p-12 text-center text-gray-500">
            Aucune déclaration trouvée
          </div>
        ) : (
          declarations.map((decl) => (
            <DeclarationCard
              key={decl.id}
              declaration={decl}
              showCompany={false}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {pageNum > 1 && (
            <Link
              href={`/company/${slug}?${new URLSearchParams({
                ...(filterType ? { type: filterType } : {}),
                page: String(pageNum - 1),
              })}`}
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
              href={`/company/${slug}?${new URLSearchParams({
                ...(filterType ? { type: filterType } : {}),
                page: String(pageNum + 1),
              })}`}
              className="px-4 py-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-sm"
            >
              Suivant →
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 text-center text-xs text-gray-600">
        {totalCount} déclaration{totalCount !== 1 ? "s" : ""} au total
      </div>
    </div>
  );
}
