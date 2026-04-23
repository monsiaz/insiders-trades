import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DeclarationCard } from "@/components/DeclarationCard";
import { CompanySyncButton } from "@/components/CompanySyncButton";
import { EnrichButton } from "@/components/EnrichButton";
import dynamic from "next/dynamic";
import { CompanyFinancials } from "@/components/CompanyFinancials";
import { RelatedEntities } from "@/components/RelatedEntities";
import { AnimateIn } from "@/components/AnimateIn";
import { headers } from "next/headers";

const StockChart = dynamic(() => import("@/components/StockChart").then(m => ({ default: m.StockChart })), {
  loading: () => (
    <div className="card p-5" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="skeleton" style={{ height: 14, width: 120 }} />
      <div className="skeleton" style={{ height: 220, borderRadius: 12 }} />
    </div>
  ),
});

const CompanyBacktestWidget = dynamic(() => import("@/components/CompanyBacktestWidget").then(m => ({ default: m.CompanyBacktestWidget })), {
  loading: () => (
    <div className="card p-5" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div className="skeleton" style={{ height: 16, width: 180 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div className="skeleton" style={{ height: 52 }} />
        <div className="skeleton" style={{ height: 52 }} />
      </div>
      <div className="skeleton" style={{ height: 120 }} />
    </div>
  ),
});
import { CompanyNews } from "@/components/CompanyNews";
import { DeclarationType } from "@prisma/client";
import { CompanyLogo } from "@/components/CompanyLogo";
import { unstable_cache } from "next/cache";

export const revalidate = 300;

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await prisma.company.findUnique({
    where: { slug },
    select: { name: true, sectorTagEn: true, descriptionEn: true, descriptionFr: true },
  });
  if (!company) return {};
  const hdrs = await headers();
  const metaPath = hdrs.get("x-original-path") ?? "/";
  const isFr = metaPath === "/fr" || metaPath.startsWith("/fr/");
  const title = isFr
    ? `${company.name} · Transactions dirigeants | Sigma`
    : `${company.name} · Insider Transactions | Sigma`;
  const desc = (isFr ? company.descriptionFr : company.descriptionEn)?.slice(0, 160)
    ?? (isFr
      ? `Suivez les transactions d'initiés de ${company.name}.`
      : `Track insider transactions for ${company.name} on InsiderTrades Sigma.`);
  // Canonical and hreflang are handled globally by layout.tsx — no alternates here to avoid duplicates.
  return {
    title,
    description: desc,
    openGraph: {
      title: isFr ? `${company.name} · Transactions dirigeants` : `${company.name} · Insider Transactions`,
      description: desc,
      type: "website",
      locale: isFr ? "fr_FR" : "en_US",
      alternateLocale: [isFr ? "en_US" : "fr_FR"],
    },
  };
}

const getCompanyData = (slug: string) =>
  unstable_cache(
    async () => {
      const company = await prisma.company.findUnique({
        where: { slug },
        include: { _count: { select: { declarations: true, insiders: true } } },
        // SEO description fields fetched below
      });
      if (!company) return null;

      const [typeCounts, lastDecl, isinRow, buyTotal, sellTotal, allTradeEvents] =
        await Promise.all([
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
          prisma.declaration.aggregate({
            where: { companyId: company.id, type: "DIRIGEANTS", transactionNature: { contains: "Acquisition", mode: "insensitive" } },
            _sum: { totalAmount: true },
            _count: true,
          }),
          prisma.declaration.aggregate({
            where: { companyId: company.id, type: "DIRIGEANTS", transactionNature: { contains: "Cession", mode: "insensitive" } },
            _sum: { totalAmount: true },
            _count: true,
          }),
          prisma.declaration.findMany({
            where: { companyId: company.id, type: "DIRIGEANTS", transactionNature: { not: null } },
            orderBy: { pubDate: "desc" },
            take: 500,
            select: { transactionDate: true, pubDate: true, transactionNature: true, totalAmount: true, insiderName: true },
          }),
        ]);

      return { company, typeCounts, lastDecl, isinRow, buyTotal, sellTotal, allTradeEvents };
    },
    [`company-data-${slug}`],
    { revalidate: 300, tags: [`company-${slug}`] }
  )();

// Pre-build the top 50 most-visited company pages (by declaration count)
export async function generateStaticParams() {
  try {
    const companies = await prisma.company.findMany({
      where: { declarations: { some: { type: "DIRIGEANTS" } } },
      orderBy: { declarations: { _count: "desc" } },
      take: 50,
      select: { slug: true },
    });
    return companies.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

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

  // Detect locale from x-original-path (ground truth URL, not x-locale which can be stale in cache)
  const headersList = await headers();
  const originalPath = headersList.get("x-original-path") ?? "/";
  const locale = (originalPath === "/fr" || originalPath.startsWith("/fr/")) ? "fr" : "en";
  const isFr = locale === "fr";

  const cached = await getCompanyData(slug);
  if (!cached) notFound();
  const { company, typeCounts, lastDecl, isinRow, buyTotal, sellTotal, allTradeEvents } = cached;

  // Fetch SEO content + related entities
  const companySeo = await prisma.company.findUnique({
    where: { slug },
    select: {
      sectorTag: true, sectorTagEn: true,
      descriptionFr: true, descriptionEn: true,
      relatedCompanySlugs: true, relatedInsiderSlugs: true,
    },
  });

  const [relatedCompaniesData, relatedInsidersData] = await Promise.all([
    companySeo?.relatedCompanySlugs?.length
      ? prisma.company.findMany({
          where: { slug: { in: companySeo.relatedCompanySlugs } },
          select: { slug: true, name: true, logoUrl: true, sectorTag: true, sectorTagEn: true },
          take: 6,
        })
      : Promise.resolve([]),
    companySeo?.relatedInsiderSlugs?.length
      ? prisma.insider.findMany({
          where: { slug: { in: companySeo.relatedInsiderSlugs } },
          select: { slug: true, name: true, primaryRole: true },
          take: 6,
        })
      : Promise.resolve([]),
  ]);

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
        pdfParsed: true, signalScore: true, pctOfMarketCap: true, pctOfInsiderFlow: true,
        company: { select: { name: true, slug: true, logoUrl: true } },
        insider: { select: { name: true, slug: true } },
      },
    }),
    prisma.declaration.count({ where }),
  ]);

  const typeMap = Object.fromEntries(typeCounts.map((t) => [t.type, t._count]));
  const totalPages = Math.ceil(totalCount / limit);
  const isin = isinRow?.isin ?? company.isin ?? null;

  // Build ALL trade events for chart (uses raw ISO string so chart can normalize timezone)
  const tradeEvents = allTradeEvents
    .filter((d) => d.transactionNature)
    .map((d) => ({
      date: (d.transactionDate ?? d.pubDate).toISOString(),
      type: d.transactionNature!.toLowerCase().includes("cession") ? ("sell" as const) : ("buy" as const),
      amount: d.totalAmount ?? undefined,
      person: d.insiderName ?? undefined,
    }));

  const formatAmount = (v: number | null | undefined) =>
    v
      ? new Intl.NumberFormat(isFr ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: v >= 1_000_000 ? "compact" : "standard" }).format(v)
      : "·";

  return (
    <div className="content-wrapper">
      {/* Back */}
      <Link href="/companies" className="inline-flex items-center gap-1.5 text-sm transition-colors mb-6 animate-fade-in"
        style={{ color: "var(--tx-3)" }}>
        {isFr ? "← Sociétés" : "← Companies"}
      </Link>

      {/* Company hero */}
      <AnimateIn single className="animate-fade-in-delay">
      <div className="glass-card-static rounded-3xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <CompanyLogo name={company.name} logoUrl={company.logoUrl} size={56} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--tx-1)", overflowWrap: "break-word", wordBreak: "break-word" }}>{company.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="font-mono text-xs" style={{ color: "var(--tx-3)" }}>{company.amfToken}</span>
                {isin && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded-lg"
                    style={{ color: "var(--tx-3)", background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
                    {isin}
                  </span>
                )}
                {company.market && (
                  <span className="text-xs" style={{ color: "var(--tx-3)" }}>{company.market}</span>
                )}
                {company.marketCap && (
                  <span className="text-xs px-2 py-0.5 rounded-lg"
                    style={{ color: "var(--c-amber)", background: "var(--c-amber-bg)", border: "1px solid var(--c-amber-bd)" }}>
                    Mcap {Number(company.marketCap) >= 1e9
                      ? `${(Number(company.marketCap) / 1e9).toFixed(1)}${isFr ? "Md€" : "Bn€"}`
                      : `${(Number(company.marketCap) / 1e6).toFixed(0)}M€`}
                  </span>
                )}
                {(isFr ? companySeo?.sectorTag : companySeo?.sectorTagEn) && (
                  <span className="text-xs px-2 py-0.5 rounded-lg"
                    style={{ color: "var(--c-sky)", background: "var(--c-sky-bg, rgba(14,165,233,0.1))", border: "1px solid var(--c-sky-bd, rgba(14,165,233,0.2))" }}>
                    {isFr ? companySeo?.sectorTag : companySeo?.sectorTagEn}
                  </span>
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
      </AnimateIn>

      {/* Stats row */}
      <AnimateIn className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" stagger={80} baseDelay={80}>
        <MiniStat label={isFr ? "Déclarations DD" : "Insider Decl."} value={(typeMap["DIRIGEANTS"] || 0).toLocaleString(isFr ? "fr-FR" : "en-GB")} />
        <MiniStat label={isFr ? "Seuils" : "Thresholds"} value={(typeMap["SEUILS"] || 0).toLocaleString(isFr ? "fr-FR" : "en-GB")} />
        <MiniStat
          label={isFr ? "Volume achat" : "Buy Volume"}
          value={formatAmount(buyTotal._sum.totalAmount)}
          sub={`${buyTotal._count} ${isFr ? "opér." : "ops."}`}
          sentiment="positive"
        />
        <MiniStat
          label={isFr ? "Volume vente" : "Sell Volume"}
          value={formatAmount(sellTotal._sum.totalAmount)}
          sub={`${sellTotal._count} ${isFr ? "opér." : "ops."}`}
          sentiment="negative"
        />
      </AnimateIn>

      {/* Stock chart */}
      <AnimateIn single className="mb-6">
        <StockChart
          isin={isin}
          companyName={company.name}
          trades={tradeEvents}
          locale={locale}
        />
      </AnimateIn>

      {/* Financial data */}
      <AnimateIn single className="mb-6">
        <CompanyFinancials
          companyId={company.id}
          companyName={company.name}
          initial={company.financialsAt ? {
            currentPrice: company.currentPrice ?? undefined,
            marketCap: company.marketCap ? Number(company.marketCap) : undefined,
            revenue: company.revenue ? Number(company.revenue) : undefined,
            grossProfit: company.grossProfit ? Number(company.grossProfit) : undefined,
            netIncome: company.netIncome ? Number(company.netIncome) : undefined,
            ebitda: company.ebitda ? Number(company.ebitda) : undefined,
            totalDebt: company.totalDebt ? Number(company.totalDebt) : undefined,
            freeCashFlow: company.freeCashFlow ? Number(company.freeCashFlow) : undefined,
            dilutedEps: company.dilutedEps ?? undefined,
            fiscalYearEnd: company.fiscalYearEnd ?? undefined,
            trailingPE: company.trailingPE ?? undefined,
            forwardPE: company.forwardPE ?? undefined,
            priceToBook: company.priceToBook ?? undefined,
            beta: company.beta ?? undefined,
            debtToEquity: company.debtToEquity ?? undefined,
            returnOnEquity: company.returnOnEquity ?? undefined,
            returnOnAssets: company.returnOnAssets ?? undefined,
            profitMargin: company.profitMargin ?? undefined,
            heldByInsiders: company.heldByInsiders ?? undefined,
            heldByInstitutions: company.heldByInstitutions ?? undefined,
            analystReco: company.analystReco ?? undefined,
            analystScore: company.analystScore ?? undefined,
            targetMean: company.targetMean ?? undefined,
            targetHigh: company.targetHigh ?? undefined,
            targetLow: company.targetLow ?? undefined,
            numAnalysts: company.numAnalysts ?? undefined,
            fetchedAt: company.financialsAt!.toISOString(),
            source: ["cache"],
          } : null}
          locale={locale}
        />
      </AnimateIn>

      {/* Backtest mini-widget */}
      <AnimateIn single className="mb-6">
        <CompanyBacktestWidget companyId={company.id} locale={locale} />
      </AnimateIn>

      {/* Latest news (Google News + Yahoo RSS) */}
      <AnimateIn single className="mb-6">
        <CompanyNews slug={company.slug} companyName={company.name} locale={locale} />
      </AnimateIn>

      {/* Last declaration date */}
      {lastDecl && (
        <div className="mb-6 text-xs text-right" style={{ color: "var(--tx-3)" }}>
          {isFr ? "Dernière déclaration le" : "Last declaration on"}{" "}
          {new Date(lastDecl.pubDate).toLocaleDateString(isFr ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" })}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[
          { value: undefined, label: isFr ? "Toutes" : "All" },
          { value: "DIRIGEANTS", label: isFr ? "Dirigeants" : "Executives" },
          { value: "SEUILS", label: isFr ? "Seuils" : "Thresholds" },
          { value: "PROSPECTUS", label: "Prospectus" },
          { value: "OTHER", label: isFr ? "Autre" : "Other" },
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
      <AnimateIn className="space-y-2" stagger={22}>
        {declarations.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center" style={{ color: "var(--tx-3)" }}>
            {isFr ? "Aucune déclaration trouvée" : "No declarations found"}
          </div>
        ) : (
          declarations.map((decl) => (
            <DeclarationCard key={decl.id} declaration={decl} showCompany={false} locale={locale} />
          ))
        )}
      </AnimateIn>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          {pageNum > 1 && (
            <Link
              href={`/company/${slug}?${new URLSearchParams({ ...(filterType ? { type: filterType } : {}), page: String(pageNum - 1) })}`}
              className="btn-glass px-4 py-2 rounded-xl text-sm font-medium"
            >
              {isFr ? "← Précédent" : "← Previous"}
            </Link>
          )}
          <span className="text-sm" style={{ color: "var(--tx-3)" }}>
            Page {pageNum} / {totalPages}
          </span>
          {pageNum < totalPages && (
            <Link
              href={`/company/${slug}?${new URLSearchParams({ ...(filterType ? { type: filterType } : {}), page: String(pageNum + 1) })}`}
              className="btn-glass px-4 py-2 rounded-xl text-sm font-medium"
            >
              {isFr ? "Suivant →" : "Next →"}
            </Link>
          )}
        </div>
      )}

      <div className="mt-4 text-center text-xs" style={{ color: "var(--tx-3)" }}>
        {isFr
          ? <>{totalCount} déclaration{totalCount !== 1 ? "s" : ""} au total</>
          : <>{totalCount} declaration{totalCount !== 1 ? "s" : ""} total</>}
      </div>

      {/* AI-generated company description */}
      {(isFr ? companySeo?.descriptionFr : companySeo?.descriptionEn) && (
        <AnimateIn single style={{ marginTop: "3rem" }}>
          <div className="glass-card-static rounded-3xl p-6">
            <h2
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--tx-3)",
                marginBottom: "1rem",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {isFr ? `À propos de ${company.name}` : `About ${company.name}`}
            </h2>
            <p
              style={{
                color: "var(--tx-2)",
                fontSize: "0.875rem",
                lineHeight: 1.75,
                whiteSpace: "pre-line",
              }}
            >
              {isFr ? companySeo?.descriptionFr : companySeo?.descriptionEn}
            </p>
          </div>
        </AnimateIn>
      )}

      {/* Related companies and insiders */}
      <AnimateIn single>
        <RelatedEntities
          relatedCompanies={relatedCompaniesData}
          relatedInsiders={relatedInsidersData}
          locale={locale}
          entityType="company"
        />
      </AnimateIn>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  sentiment,
}: {
  label: string;
  value: string;
  sub?: string;
  sentiment?: "positive" | "negative";
}) {
  const valueColor = sentiment === "positive" ? "var(--c-emerald)"
    : sentiment === "negative" ? "var(--c-crimson)"
    : "var(--tx-1)";

  return (
    <div className="card p-4">
      <div style={{
        fontFamily: "'Banana Grotesk', 'Inter', monospace",
        fontSize: "1.2rem", fontWeight: 700, letterSpacing: "-0.03em",
        color: valueColor, lineHeight: 1.2,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "0.7rem", color: "var(--tx-4)", marginTop: "2px" }}>{sub}</div>}
      <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "5px", fontWeight: 500 }}>{label}</div>
    </div>
  );
}
