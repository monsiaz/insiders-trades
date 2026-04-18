import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DeclarationCard } from "@/components/DeclarationCard";
import { CompanySyncButton } from "@/components/CompanySyncButton";
import { EnrichButton } from "@/components/EnrichButton";
import { StockChart } from "@/components/StockChart";
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
    include: { _count: { select: { declarations: true, insiders: true } } },
  });
  if (!company) notFound();

  const where = {
    companyId: company.id,
    ...(filterType ? { type: filterType } : {}),
  };

  const [declarations, totalCount, typeCounts, lastDecl, isinRow, buyTotal, sellTotal] =
    await Promise.all([
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
      prisma.declaration.groupBy({ by: ["type"], where: { companyId: company.id }, _count: true }),
      prisma.declaration.findFirst({
        where: { companyId: company.id, type: "DIRIGEANTS" },
        orderBy: { pubDate: "desc" },
        select: { pubDate: true },
      }),
      prisma.declaration.findFirst({
        where: { companyId: company.id, type: "DIRIGEANTS", isin: { not: null } },
        select: { isin: true },
      }),
      // Buy total
      prisma.declaration.aggregate({
        where: { companyId: company.id, type: "DIRIGEANTS", transactionNature: { contains: "Acquisition", mode: "insensitive" } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // Sell total
      prisma.declaration.aggregate({
        where: { companyId: company.id, type: "DIRIGEANTS", transactionNature: { contains: "Cession", mode: "insensitive" } },
        _sum: { totalAmount: true },
        _count: true,
      }),
    ]);

  const typeMap = Object.fromEntries(typeCounts.map((t) => [t.type, t._count]));
  const totalPages = Math.ceil(totalCount / limit);
  const isin = isinRow?.isin ?? company.isin ?? null;

  // Build trade events for chart overlay (last 6 months)
  const tradeEvents = declarations
    .filter((d) => d.type === "DIRIGEANTS" && d.transactionDate && d.transactionNature)
    .map((d) => ({
      date: new Date(d.transactionDate!).toISOString().split("T")[0],
      type: d.transactionNature!.toLowerCase().includes("cession") ? ("sell" as const) : ("buy" as const),
      amount: d.totalAmount ?? undefined,
      person: d.insiderName ?? undefined,
    }));

  const formatAmount = (v: number | null | undefined) =>
    v
      ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: v >= 1_000_000 ? "compact" : "standard" }).format(v)
      : "—";

  return (
    <div className="content-wrapper">
      {/* Back */}
      <Link href="/companies" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors mb-6">
        ← Sociétés
      </Link>

      {/* Company hero */}
      <div className="glass-card-static rounded-3xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/20 flex items-center justify-center text-2xl font-bold text-indigo-300">
              {company.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">{company.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="font-mono text-xs text-slate-500">{company.amfToken}</span>
                {isin && (
                  <span className="font-mono text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-lg border border-white/5">
                    {isin}
                  </span>
                )}
                {company.market && (
                  <span className="text-xs text-slate-500">{company.market}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <CompanySyncButton companyId={company.id} />
            <EnrichButton companyId={company.id} />
            <a
              href={`https://bdif.amf-france.org/fr/details/${company.amfToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-glass px-3 py-2 rounded-xl text-xs font-medium"
            >
              AMF ↗
            </a>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <MiniStat label="Déclarations DD" value={(typeMap["DIRIGEANTS"] || 0).toLocaleString("fr-FR")} accent="indigo" />
        <MiniStat label="Seuils" value={(typeMap["SEUILS"] || 0).toLocaleString("fr-FR")} accent="sky" />
        <MiniStat
          label="Volume achat"
          value={formatAmount(buyTotal._sum.totalAmount)}
          sub={`${buyTotal._count} opér.`}
          accent="emerald"
        />
        <MiniStat
          label="Volume vente"
          value={formatAmount(sellTotal._sum.totalAmount)}
          sub={`${sellTotal._count} opér.`}
          accent="rose"
        />
      </div>

      {/* Stock chart */}
      <div className="mb-6">
        <StockChart
          isin={isin}
          companyName={company.name}
          trades={tradeEvents}
        />
      </div>

      {/* Last declaration date */}
      {lastDecl && (
        <div className="mb-6 text-xs text-slate-600 text-right">
          Dernière déclaration le{" "}
          {new Date(lastDecl.pubDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
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
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterType === f.value
                ? "btn-primary"
                : "btn-glass"
            }`}
          >
            {f.label}
            {f.value && typeMap[f.value] !== undefined && (
              <span className="ml-1.5 opacity-60">{typeMap[f.value]}</span>
            )}
          </Link>
        ))}
      </div>

      {/* Declarations list */}
      <div className="space-y-2">
        {declarations.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center text-slate-500">
            Aucune déclaration trouvée
          </div>
        ) : (
          declarations.map((decl) => (
            <DeclarationCard key={decl.id} declaration={decl} showCompany={false} />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          {pageNum > 1 && (
            <Link
              href={`/company/${slug}?${new URLSearchParams({ ...(filterType ? { type: filterType } : {}), page: String(pageNum - 1) })}`}
              className="btn-glass px-4 py-2 rounded-xl text-sm font-medium"
            >
              ← Précédent
            </Link>
          )}
          <span className="text-sm text-slate-500">
            Page {pageNum} / {totalPages}
          </span>
          {pageNum < totalPages && (
            <Link
              href={`/company/${slug}?${new URLSearchParams({ ...(filterType ? { type: filterType } : {}), page: String(pageNum + 1) })}`}
              className="btn-glass px-4 py-2 rounded-xl text-sm font-medium"
            >
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

function MiniStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: "indigo" | "sky" | "emerald" | "rose";
}) {
  const map = {
    indigo: "from-indigo-500/8 to-transparent border-indigo-500/12",
    sky: "from-sky-500/8 to-transparent border-sky-500/12",
    emerald: "from-emerald-500/8 to-transparent border-emerald-500/12",
    rose: "from-rose-500/8 to-transparent border-rose-500/12",
  };
  return (
    <div className={`glass-card-static rounded-2xl p-4 bg-gradient-to-br ${map[accent]}`}>
      <div className="text-xl font-bold text-white tracking-tight">{value}</div>
      {sub && <div className="text-xs text-slate-600 mt-0.5">{sub}</div>}
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
