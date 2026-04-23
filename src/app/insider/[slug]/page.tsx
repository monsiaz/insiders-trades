import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DeclarationCard } from "@/components/DeclarationCard";
import { RelatedEntities } from "@/components/RelatedEntities";
import { AnimateIn } from "@/components/AnimateIn";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { translateRole } from "@/lib/i18n";

// force-dynamic: same reason as company page — prevents locale cache conflict.
export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const insider = await prisma.insider.findUnique({
    where: { slug },
    select: { name: true, primaryRole: true, descriptionEn: true, descriptionFr: true },
  });
  if (!insider) return {};
  const hdrs = await headers();
  const metaPath = hdrs.get("x-original-path") ?? "/";
  const isFr = metaPath === "/fr" || metaPath.startsWith("/fr/");
  const title = `${insider.name}${insider.primaryRole ? ` · ${insider.primaryRole}` : ""} | Sigma`;
  const desc = (isFr ? insider.descriptionFr : insider.descriptionEn)?.slice(0, 160)
    ?? (isFr
      ? `Suivez les déclarations d'initiés de ${insider.name}.`
      : `Track insider declarations by ${insider.name} on InsiderTrades Sigma.`);
  // Canonical and hreflang are handled globally by layout.tsx — no alternates here to avoid duplicates.
  return {
    title,
    description: desc,
    openGraph: {
      title: `${insider.name} · Insider Declarations`,
      description: desc,
      type: "website",
      locale: isFr ? "fr_FR" : "en_US",
      alternateLocale: [isFr ? "en_US" : "fr_FR"],
    },
  };
}

const getInsiderData = (slug: string) =>
  unstable_cache(
    async () => {
      const insider = await prisma.insider.findUnique({
        where: { slug },
        include: {
          companies: { include: { company: { select: { name: true, slug: true } } } },
          _count: { select: { declarations: true } },
        },
      });
      if (!insider) return null;

      const [buyAgg, sellAgg] = await Promise.all([
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

      return { insider, buyAgg, sellAgg };
    },
    [`insider-data-${slug}`],
    { revalidate: 300, tags: [`insider-${slug}`] }
  )();

// Pre-build the top 50 most-active insider pages
export async function generateStaticParams() {
  try {
    const insiders = await prisma.insider.findMany({
      where: { declarations: { some: { type: "DIRIGEANTS" } } },
      orderBy: { declarations: { _count: "desc" } },
      take: 50,
      select: { slug: true },
    });
    return insiders.map((i) => ({ slug: i.slug }));
  } catch {
    return [];
  }
}

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

  const headersList = await headers();
  const originalPath = headersList.get("x-original-path") ?? "/";
  const locale = (originalPath === "/fr" || originalPath.startsWith("/fr/")) ? "fr" : "en";
  const isFr = locale === "fr";

  const cached = await getInsiderData(slug);
  if (!cached) notFound();
  const { insider, buyAgg, sellAgg } = cached;

  // Fetch SEO content + related entities
  const insiderSeo = await prisma.insider.findUnique({
    where: { slug },
    select: {
      descriptionFr: true, descriptionEn: true,
      primaryRole: true,
      relatedCompanySlugs: true, relatedInsiderSlugs: true,
    },
  });

  const [relatedCompaniesData, relatedInsidersData] = await Promise.all([
    insiderSeo?.relatedCompanySlugs?.length
      ? prisma.company.findMany({
          where: { slug: { in: insiderSeo.relatedCompanySlugs } },
          select: { slug: true, name: true, logoUrl: true, sectorTag: true, sectorTagEn: true },
          take: 6,
        })
      : Promise.resolve([]),
    insiderSeo?.relatedInsiderSlugs?.length
      ? prisma.insider.findMany({
          where: { slug: { in: insiderSeo.relatedInsiderSlugs } },
          select: { slug: true, name: true, primaryRole: true },
          take: 6,
        })
      : Promise.resolve([]),
  ]);

  const [declarations, totalCount] = await Promise.all([
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
        pdfParsed: true, signalScore: true, pctOfMarketCap: true, pctOfInsiderFlow: true,
        company: { select: { name: true, slug: true } },
        insider: { select: { name: true, slug: true } },
      },
    }),
    prisma.declaration.count({ where: { insiderId: insider.id } }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);
  const initials = insider.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const fmt = (v: number | null | undefined) =>
    v ? new Intl.NumberFormat(isFr ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: v >= 1_000_000 ? "compact" : "standard" }).format(v) : "·";

  return (
    <div className="content-wrapper">
      {/* Back */}
      <Link href="/insiders" className="inline-flex items-center gap-1.5 text-sm text-[var(--tx-3)] hover:text-[var(--tx-2)] transition-colors mb-6 animate-fade-in">
        {isFr ? "← Dirigeants" : "← Executives"}
      </Link>

      {/* Hero */}
      <AnimateIn single className="animate-fade-in-delay mb-6">
      <div className="glass-card-static rounded-3xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/25 flex items-center justify-center text-xl font-bold tx-violet flex-shrink-0">
            {initials}
          </div>
            <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--tx-1)] tracking-tight" style={{ overflowWrap: "break-word", wordBreak: "break-word" }}>{insider.name}</h1>
            {insiderSeo?.primaryRole && (
              <div className="text-sm mt-1" style={{ color: "var(--tx-3)" }}>
                {translateRole(insiderSeo.primaryRole, locale)}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {insider.companies.map((ci) => (
                <Link
                  key={ci.company.slug}
                  href={isFr ? `/fr/company/${ci.company.slug}` : `/company/${ci.company.slug}`}
                  className="text-xs px-2.5 py-1 rounded-full glass-card-static border-white/8 text-[var(--tx-2)] hover:text-[var(--tx-1)] transition-colors truncate"
                  style={{ maxWidth: "min(100%, 200px)" }}
                >
                  {ci.company.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
      </AnimateIn>

      {/* Stats */}
      <AnimateIn className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7" stagger={80} baseDelay={80}>
        <div className="glass-card-static rounded-2xl p-4 bg-gradient-to-br from-indigo-500/8 to-transparent border-indigo-500/12">
          <div className="text-xl font-bold text-[var(--tx-1)]">{insider._count.declarations}</div>
          <div className="text-xs text-[var(--tx-3)] mt-1">{isFr ? "Déclarations totales" : "Total declarations"}</div>
        </div>
        <div className="glass-card-static rounded-2xl p-4 bg-gradient-to-br from-sky-500/8 to-transparent border-sky-500/12">
          <div className="text-xl font-bold text-[var(--tx-1)]">{insider.companies.length}</div>
          <div className="text-xs text-[var(--tx-3)] mt-1">
            {isFr
              ? <>Société{insider.companies.length > 1 ? "s" : ""}</>
              : <>{insider.companies.length > 1 ? "Companies" : "Company"}</>}
          </div>
        </div>
        <div className="glass-card-static rounded-2xl p-4 bg-gradient-to-br from-emerald-500/8 to-transparent border-emerald-500/12">
          <div className="text-xl font-bold tx-pos">{fmt(buyAgg._sum.totalAmount)}</div>
          <div className="text-xs text-[var(--tx-3)] mt-1">▲ {isFr ? `Achats (${buyAgg._count} opér.)` : `Purchases (${buyAgg._count} ops.)`}</div>
        </div>
        <div className="glass-card-static rounded-2xl p-4 bg-gradient-to-br from-rose-500/8 to-transparent border-rose-500/12">
          <div className="text-xl font-bold tx-neg">{fmt(sellAgg._sum.totalAmount)}</div>
          <div className="text-xs text-[var(--tx-3)] mt-1">▼ {isFr ? `Ventes (${sellAgg._count} opér.)` : `Sales (${sellAgg._count} ops.)`}</div>
        </div>
      </AnimateIn>

      {/* Declarations */}
      <AnimateIn className="space-y-2" stagger={22}>
        {declarations.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center text-[var(--tx-3)]">
            {isFr ? "Aucune déclaration" : "No declarations"}
          </div>
        ) : (
          declarations.map((decl) => <DeclarationCard key={decl.id} declaration={decl} locale={locale} />)
        )}
      </AnimateIn>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          {pageNum > 1 && (
            <Link href={`/insider/${slug}?page=${pageNum - 1}`} className="btn-glass px-4 py-2 rounded-xl text-sm font-medium">
              {isFr ? "← Précédent" : "← Previous"}
            </Link>
          )}
          <span className="text-sm text-[var(--tx-3)]">Page {pageNum} / {totalPages}</span>
          {pageNum < totalPages && (
            <Link href={`/insider/${slug}?page=${pageNum + 1}`} className="btn-glass px-4 py-2 rounded-xl text-sm font-medium">
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

      {/* AI-generated insider description */}
      {(isFr ? insiderSeo?.descriptionFr : insiderSeo?.descriptionEn) && (
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
              {isFr ? `À propos de ${insider.name}` : `About ${insider.name}`}
            </h2>
            <p
              style={{
                color: "var(--tx-2)",
                fontSize: "0.875rem",
                lineHeight: 1.75,
                whiteSpace: "pre-line",
              }}
            >
              {isFr ? insiderSeo?.descriptionFr : insiderSeo?.descriptionEn}
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
          entityType="insider"
        />
      </AnimateIn>
    </div>
  );
}
