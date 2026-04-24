import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { SyncButton } from "@/components/SyncButton";
import { CompaniesClient, type CompanyRow } from "@/components/CompaniesClient";

export const dynamic = "force-dynamic"; // locale-aware: prevents FR/EN cache conflict on shared internal route

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

export async function generateMetadata() {
  const hdrs = await headers();
  const originalPath = hdrs.get("x-original-path") ?? "/companies/";
  const isFr = originalPath === "/fr" || originalPath.startsWith("/fr/");
  const canonical = isFr ? `${BASE}/fr/companies/` : `${BASE}/companies/`;
  return {
    title: isFr ? "Sociétés cotées · InsiderTrades Sigma" : "Listed Companies · InsiderTrades Sigma",
    description: isFr
      ? "Toutes les sociétés françaises ayant fait l'objet d'une déclaration de dirigeant à l'AMF."
      : "All French-listed companies with insider declarations filed to the AMF.",
    alternates: { canonical },
    openGraph: { url: canonical, locale: isFr ? "fr_FR" : "en_US" },
  };
}

// Single aggregated SQL query · one round trip, DB-side aggregate, no N+1.
// Returns: one row per company with pre-computed count and latest declaration.
interface CompanyAggregateRow {
  id: string;
  name: string;
  slug: string;
  amfToken: string | null;
  marketCap: bigint | null;
  yahooSymbol: string | null;
  currentPrice: number | null;
  logoUrl: string | null;
  declarationCount: bigint;
  lastPubDate: Date | null;
  lastInsiderName: string | null;
  lastTransactionNature: string | null;
  lastTotalAmount: bigint | null;
}

async function fetchCompanies(showAll: boolean): Promise<CompanyRow[]> {
  const rows = await prisma.$queryRawUnsafe<CompanyAggregateRow[]>(`
    SELECT
      c.id,
      c.name,
      c.slug,
      c."amfToken",
      c."marketCap",
      c."yahooSymbol",
      c."currentPrice",
      c."logoUrl",
      COALESCE(d.decl_count, 0)::bigint AS "declarationCount",
      d.last_pub_date AS "lastPubDate",
      d.last_insider AS "lastInsiderName",
      d.last_nature AS "lastTransactionNature",
      d.last_total AS "lastTotalAmount"
    FROM "Company" c
    ${showAll ? "LEFT JOIN" : "INNER JOIN"} (
      SELECT
        "companyId",
        COUNT(*) AS decl_count,
        MAX("pubDate") AS last_pub_date,
        (ARRAY_AGG("insiderName" ORDER BY "pubDate" DESC))[1] AS last_insider,
        (ARRAY_AGG("transactionNature" ORDER BY "pubDate" DESC))[1] AS last_nature,
        (ARRAY_AGG("totalAmount" ORDER BY "pubDate" DESC))[1] AS last_total
      FROM "Declaration"
      WHERE "type" = 'DIRIGEANTS'
      GROUP BY "companyId"
    ) d ON d."companyId" = c.id
    ORDER BY c.name ASC
  `);

  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    amfToken: c.amfToken,
    marketCap: c.marketCap ? Number(c.marketCap) : null,
    yahooSymbol: c.yahooSymbol,
    currentPrice: c.currentPrice,
    logoUrl: c.logoUrl ?? null,
    declarationCount: Number(c.declarationCount),
    lastDecl: c.lastPubDate
      ? {
          pubDate: c.lastPubDate.toISOString(),
          insiderName: c.lastInsiderName,
          transactionNature: c.lastTransactionNature,
          totalAmount: c.lastTotalAmount ? Number(c.lastTotalAmount) : null,
        }
      : null,
  }));
}

const getCompaniesWithDecl = unstable_cache(
  () => fetchCompanies(false),
  ["companies-with-decl-v2"],
  { revalidate: 300 }
);

const getAllCompanies = unstable_cache(
  () => fetchCompanies(true),
  ["companies-all-v2"],
  { revalidate: 300 }
);

// Also cache the total count separately so we can render the header instantly.
const getCompanyCounts = unstable_cache(
  async () => {
    const [withDecl, all] = await Promise.all([
      prisma.company.count({ where: { declarations: { some: { type: "DIRIGEANTS" } } } }),
      prisma.company.count(),
    ]);
    return { withDecl, all };
  },
  ["company-counts-v1"],
  { revalidate: 300 }
);

interface Props {
  searchParams: Promise<{ all?: string; q?: string }>;
}

async function CompaniesGrid({ showAll, q }: { showAll: boolean; q?: string }) {
  const companies = await (showAll ? getAllCompanies() : getCompaniesWithDecl());
  return <CompaniesClient companies={companies} initialQ={q} />;
}

function CompaniesGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(12)].map((_, i) => (
        <div key={i} className="card p-5" style={{ height: "140px", animation: "pulse 1.5s ease-in-out infinite" }} />
      ))}
    </div>
  );
}

export default async function CompaniesPage({ searchParams }: Props) {
  const { all, q } = await searchParams;
  const showAll = all === "1";

  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";

  const counts = await getCompanyCounts();
  const displayCount = showAll ? counts.all : counts.withDecl;

  return (
    <div className="content-wrapper">
      <div className="mb-8">
        <div className="masthead-dateline">
          <span className="masthead-folio">{isFr ? "Cotation" : "Market"}</span>
          <span className="masthead-rule" aria-hidden="true" />
          <span className="masthead-count">
            {displayCount.toLocaleString(isFr ? "fr-FR" : "en-GB")}{" "}{isFr ? "sociétés" : "companies"}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="min-w-0">
            <h1
              style={{
                fontFamily: "var(--font-dm-serif), Georgia, serif",
                fontSize: "clamp(2rem, 5vw, 3.25rem)",
                fontWeight: 400,
                letterSpacing: "-0.015em",
                lineHeight: 1.05,
                color: "var(--tx-1)",
              }}
            >
              {isFr ? "Sociétés" : "Companies"}
            </h1>
            <p style={{ color: "var(--tx-2)", fontSize: "0.9rem", marginTop: "6px", lineHeight: 1.6, maxWidth: "480px" }}>
              {isFr
                ? (!showAll
                  ? "Toutes les sociétés cotées ayant fait l'objet d'une déclaration de dirigeant à l'AMF."
                  : "L'ensemble des sociétés françaises référencées dans la base.")
                : (!showAll
                  ? "All listed companies with at least one insider declaration filed with the AMF."
                  : "All French companies referenced in the database.")}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "2px",
                padding: "3px",
                background: "var(--bg-raised)",
                border: "1px solid var(--border-med)",
                borderRadius: "8px",
              }}
            >
              <Link
                href="/companies"
                style={{
                  padding: "10px 14px",
                  minHeight: "44px",
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "5px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  letterSpacing: "0.02em",
                  background: !showAll ? "var(--gold-bg)" : "transparent",
                  color: !showAll ? "var(--gold)" : "var(--tx-3)",
                }}
              >
                {isFr ? "Avec décl." : "With decl."}
              </Link>
              <Link
                href="/companies?all=1"
                style={{
                  padding: "10px 14px",
                  minHeight: "44px",
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "5px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  textDecoration: "none",
                  letterSpacing: "0.02em",
                  background: showAll ? "var(--gold-bg)" : "transparent",
                  color: showAll ? "var(--gold)" : "var(--tx-3)",
                }}
              >
                {isFr ? "Toutes" : "All"}
              </Link>
            </div>
            <SyncButton />
            <Link href="/companies/add" className="btn btn-primary" style={{ fontSize: "0.8rem" }}>
              {isFr ? "+ Ajouter" : "+ Add"}
            </Link>
          </div>
        </div>
      </div>

      <Suspense fallback={<CompaniesGridSkeleton />}>
        <CompaniesGrid showAll={showAll} q={q} />
      </Suspense>
    </div>
  );
}
