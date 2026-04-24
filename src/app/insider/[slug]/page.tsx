import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

/** Compact monetary amount for meta descriptions. */
function fmtAmtMeta(v: number | bigint | null | undefined): string | null {
  if (v == null) return null;
  const n = typeof v === "bigint" ? Number(v) : v;
  if (n <= 0) return null;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}Md€`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M€`;
  if (n >= 1_000)         return `${Math.round(n / 1_000)}k€`;
  return `${Math.round(n)}€`;
}
import Link from "next/link";
import { DeclarationsLoadMore } from "@/components/DeclarationsLoadMore";
import { RelatedEntities } from "@/components/RelatedEntities";
import { AnimateIn } from "@/components/AnimateIn";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { translateRole } from "@/lib/i18n";

// force-dynamic: same reason as company page — prevents locale cache conflict.
export const dynamic = "force-dynamic";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

/**
 * One consolidated, 1h-cached fetch for everything the insider page needs
 * except non-default pagination. Shared with generateMetadata so no duplicate
 * DB round-trip is made for the same slug.
 */
const getInsiderFullCached = (slug: string) =>
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

      const DECL_SELECT = {
        id: true, amfId: true, type: true, pubDate: true, link: true, description: true,
        insiderName: true, insiderFunction: true, transactionNature: true,
        instrumentType: true, isin: true, unitPrice: true, volume: true,
        totalAmount: true, currency: true, transactionDate: true, transactionVenue: true,
        pdfParsed: true, signalScore: true, pctOfMarketCap: true, pctOfInsiderFlow: true,
        company: { select: { name: true, slug: true } },
        insider: { select: { name: true, slug: true } },
      } as const;

      const [buyAgg, sellAgg, defaultDeclarations, defaultTotalCount] = await Promise.all([
        prisma.declaration.aggregate({
          where: { insiderId: insider.id, transactionNature: { contains: "Acquisition", mode: "insensitive" } },
          _sum: { totalAmount: true }, _count: true,
        }),
        prisma.declaration.aggregate({
          where: { insiderId: insider.id, transactionNature: { contains: "Cession", mode: "insensitive" } },
          _sum: { totalAmount: true }, _count: true,
        }),
        prisma.declaration.findMany({
          where: { insiderId: insider.id },
          orderBy: { pubDate: "desc" },
          take: 25, skip: 0,
          select: DECL_SELECT,
        }),
        prisma.declaration.count({ where: { insiderId: insider.id } }),
      ]);

      const [relatedCompanies, relatedInsiders] = await Promise.all([
        insider.relatedCompanySlugs?.length
          ? prisma.company.findMany({
              where: { slug: { in: insider.relatedCompanySlugs } },
              select: { slug: true, name: true, logoUrl: true, sectorTag: true, sectorTagEn: true },
              take: 6,
            })
          : Promise.resolve([] as Array<{ slug: string; name: string; logoUrl: string | null; sectorTag: string | null; sectorTagEn: string | null }>),
        insider.relatedInsiderSlugs?.length
          ? prisma.insider.findMany({
              where: { slug: { in: insider.relatedInsiderSlugs } },
              select: { slug: true, name: true, primaryRole: true },
              take: 6,
            })
          : Promise.resolve([] as Array<{ slug: string; name: string; primaryRole: string | null }>),
      ]);

      return {
        insider, buyAgg, sellAgg,
        defaultDeclarations, defaultTotalCount,
        relatedCompanies, relatedInsiders,
      };
    },
    [`insider-full-v3-${slug}`],
    { revalidate: 3600, tags: [`insider-${slug}`] }
  )();

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cached = await getInsiderFullCached(slug);
  if (!cached) return {};
  const { insider } = cached;
  const hdrs = await headers();
  const metaPath = hdrs.get("x-original-path") ?? "/";
  const isFr = metaPath === "/fr" || metaPath.startsWith("/fr/");
  const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";
  const canonical = isFr ? `${BASE}/fr/insider/${slug}/` : `${BASE}/insider/${slug}/`;
  const altLocale = isFr ? `${BASE}/insider/${slug}/`    : `${BASE}/fr/insider/${slug}/`;
  const title = `${insider.name}${insider.primaryRole ? ` · ${insider.primaryRole}` : ""} | Sigma`;

  // Structured meta description ≤130 chars
  // Parts: role · N déclarations AMF · Achats XM€ · Ventes XM€ · Company names
  const { buyAgg, sellAgg, defaultTotalCount } = cached;
  const role     = insider.primaryRole ?? null;
  const buyAmt   = fmtAmtMeta(buyAgg._sum.totalAmount);
  const sellAmt  = fmtAmtMeta(sellAgg._sum.totalAmount);
  const companies = insider.companies
    .slice(0, 2)
    .map((r: { company: { name: string } }) => r.company.name)
    .join(", ");

  const metaParts: string[] = [];
  if (role) metaParts.push(role);
  metaParts.push(isFr ? `${defaultTotalCount} déclarations AMF` : `${defaultTotalCount} AMF filings`);
  if (buyAmt)  metaParts.push(isFr ? `Achats ${buyAmt}` : `Buys ${buyAmt}`);
  if (sellAmt) metaParts.push(isFr ? `Ventes ${sellAmt}` : `Sells ${sellAmt}`);
  if (companies) metaParts.push(companies);

  const desc = metaParts.join(" · ").slice(0, 130);
  return {
    title,
    description: desc,
    alternates: {
      canonical,
      languages: { [isFr ? "fr" : "en"]: canonical, [isFr ? "en" : "fr"]: altLocale },
    },
    openGraph: {
      title: `${insider.name} · ${isFr ? "Déclarations d'initiés" : "Insider Declarations"}`,
      description: desc,
      url: canonical,
      type: "website",
      locale: isFr ? "fr_FR" : "en_US",
      alternateLocale: [isFr ? "en_US" : "fr_FR"],
    },
  };
}

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
  searchParams: Promise<Record<string, string>>;
}

export default async function InsiderPage({ params }: Props) {
  const { slug } = await params;
  const limit = 25;

  const headersList = await headers();
  const originalPath = headersList.get("x-original-path") ?? "/";
  const locale = (originalPath === "/fr" || originalPath.startsWith("/fr/")) ? "fr" : "en";
  const isFr = locale === "fr";

  const cached = await getInsiderFullCached(slug);
  if (!cached) notFound();
  const {
    insider, buyAgg, sellAgg,
    defaultDeclarations, defaultTotalCount,
    relatedCompanies: relatedCompaniesData,
    relatedInsiders:  relatedInsidersData,
  } = cached;

  // SEO fields are now on the insider record itself (fetched in the cached call)
  const insiderSeo = {
    descriptionFr: insider.descriptionFr,
    descriptionEn: insider.descriptionEn,
    primaryRole: insider.primaryRole,
  };

  // Always use cached first-page payload — more pages loaded client-side via API.
  const declarations = defaultDeclarations;
  const totalCount   = defaultTotalCount;
  void limit; // pageSize passed to DeclarationsLoadMore
  const initials = insider.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  const fmt = (v: number | null | undefined) =>
    v ? new Intl.NumberFormat(isFr ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: v >= 1_000_000 ? "compact" : "standard" }).format(v) : "·";

  return (
    <div className="content-wrapper">
      {/* Back */}
      <Link href="/insiders/" className="inline-flex items-center gap-1.5 text-sm text-[var(--tx-3)] hover:text-[var(--tx-2)] transition-colors mb-6 animate-fade-in">
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

      {/* Declarations — load more on click (no pagination URLs) */}
      <DeclarationsLoadMore
        initial={declarations as Parameters<typeof DeclarationsLoadMore>[0]["initial"]}
        total={totalCount}
        entityId={insider.id}
        entityType="insider"
        showCompany
        locale={locale}
      />

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
