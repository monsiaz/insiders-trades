import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { headers } from "next/headers";
import { InsidersClient, type InsiderRow } from "@/components/InsidersClient";

export const dynamic = "force-dynamic"; // locale-aware: prevents FR/EN cache conflict

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

export async function generateMetadata() {
  const hdrs = await headers();
  const originalPath = hdrs.get("x-original-path") ?? "/insiders/";
  const isFr = originalPath === "/fr" || originalPath.startsWith("/fr/");
  const canonical = isFr ? `${BASE}/fr/insiders/` : `${BASE}/insiders/`;
  return {
    title: isFr ? "Dirigeants · InsiderTrades Sigma" : "Executives · InsiderTrades Sigma",
    description: isFr
      ? "Tous les dirigeants et initiés ayant effectué des déclarations AMF."
      : "All executives and insiders who have filed AMF declarations.",
    alternates: { canonical },
    openGraph: { url: canonical, locale: isFr ? "fr_FR" : "en_US" },
  };
}

// Cache the Prisma query · invalidated every 5min or on demand
const getInsiders = unstable_cache(
  async () =>
    prisma.insider.findMany({
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
          select: {
            pubDate: true,
            transactionNature: true,
            totalAmount: true,
          },
        },
      },
    }),
  ["insiders-list"],
  { revalidate: 300 }
);

export default async function InsidersPage() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";

  const raw = await getInsiders();

  // Normalize + serialize for the client component (small prop shape)
  const insiders: InsiderRow[] = raw.map((i) => ({
    id: i.id,
    slug: i.slug,
    name: i.name,
    declarationCount: i._count.declarations,
    topFunction: i.companies[0]?.function ?? null,
    companies: i.companies.map((c) => ({ name: c.company.name, slug: c.company.slug })),
    lastDecl: i.declarations[0]
      ? {
          // unstable_cache serializes Date → string, so normalize defensively
          pubDate:
            i.declarations[0].pubDate instanceof Date
              ? i.declarations[0].pubDate.toISOString()
              : String(i.declarations[0].pubDate),
          totalAmount: i.declarations[0].totalAmount
            ? Number(i.declarations[0].totalAmount)
            : null,
          nature: i.declarations[0].transactionNature,
        }
      : null,
  }));

  return (
    <div className="content-wrapper">
      <div className="mb-8">
        <div className="masthead-dateline">
          <span className="masthead-folio">{isFr ? "Registre" : "Registry"}</span>
          <span className="masthead-rule" aria-hidden="true" />
          <span className="masthead-count">
            {insiders.length.toLocaleString(isFr ? "fr-FR" : "en-GB")}{" "}{isFr ? "dirigeants" : "executives"}
          </span>
        </div>
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
          {isFr ? "Dirigeants" : "Executives"}
        </h1>
        <p
          style={{
            color: "var(--tx-2)",
            fontSize: "0.9rem",
            marginTop: "6px",
            maxWidth: "520px",
            lineHeight: 1.6,
          }}
        >
          {isFr
            ? <>L&apos;ensemble des dirigeants français déclarant des transactions auprès de l&apos;AMF.</>
            : "All French executives declaring transactions to the AMF."}
        </p>
      </div>

      <InsidersClient insiders={insiders} locale={locale} />
    </div>
  );
}
