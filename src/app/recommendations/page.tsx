/**
 * /recommendations · Page des recommandations actionnables
 *
 * Tab "Achats"   : Top 10 signaux d'achat (tous utilisateurs)
 * Tab "Ventes"   : Top 10 signaux de vente (tous utilisateurs)
 * Tab "Pour moi" : Top personnalisés selon le portfolio de l'utilisateur
 */
import { Suspense } from "react";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getRecommendations, type RecoItem } from "@/lib/recommendation-engine";
import { RecoCard } from "@/components/RecoCard";
import FreemiumGate from "@/components/FreemiumGate";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { unstable_cache } from "next/cache";

const FREE_VISIBLE = 3; // number of reco cards visible to non-authenticated users

export const dynamic = "force-dynamic"; // locale-aware: prevents FR/EN cache conflict

export async function generateMetadata() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";
  return {
    title: isFr
      ? "Recommandations · InsiderTrades Sigma"
      : "Recommendations · InsiderTrades Sigma",
    description: isFr
      ? "Top signaux d'achat et de vente basés sur les performances historiques et les transactions récentes des dirigeants AMF."
      : "Top buy and sell signals based on historical performance and recent AMF insider transactions.",
  };
}

async function getGeneralRecos(): Promise<RecoItem[]> {
  try {
    return await getRecommendations({ mode: "general", limit: 10, lookbackDays: 90 });
  } catch { return []; }
}

async function getSellRecos(): Promise<RecoItem[]> {
  try {
    return await getRecommendations({ mode: "sells", limit: 10, lookbackDays: 90 });
  } catch { return []; }
}

/** Masks sensitive fields for non-authenticated users (server-side, never reaches client) */
function maskRecos(recos: RecoItem[], isAuth: boolean): RecoItem[] {
  if (isAuth) return recos;
  return recos.map((r, i) => {
    if (i < FREE_VISIBLE) return r;
    return {
      ...r,
      company: { name: "████████ ███", slug: "", yahooSymbol: null, logoUrl: null },
      insider: { name: "████████", slug: null, function: null, role: r.insider.role },
      allInsiders: [{ name: "████████", slug: null, role: r.insider.role }],
      recoScore: Math.round(r.recoScore * 0.7 + 5),
      expectedReturn90d: null,
      historicalWinRate90d: null,
      historicalAvgReturn365d: null,
      isin: null,
      amfLink: "#",
    };
  });
}

// Cached per-user (5 min TTL) to avoid recomputing on every navigation
function getPersonalRecosCached(userId: string) {
  return unstable_cache(
    async () => {
      try {
        const [positions, user] = await Promise.all([
          prisma.portfolioPosition.findMany({ where: { userId, isin: { not: null } }, select: { isin: true } }),
          prisma.user.findUnique({ where: { id: userId }, select: { alertEnabled: true } }),
        ]);
        const portfolioIsins = positions.map((p) => p.isin!).filter(Boolean);
        const recos = await getRecommendations({ mode: "personal", limit: 12, lookbackDays: 90, portfolioIsins });
        return { recos, portfolioSize: positions.length, alertEnabled: user?.alertEnabled ?? true };
      } catch { return { recos: [] as RecoItem[], portfolioSize: 0, alertEnabled: true }; }
    },
    ["reco-personal-v3", userId],
    { revalidate: 300, tags: [`reco-personal-${userId}`] }
  )();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ mode, locale = "fr" }: { mode: "general" | "personal"; locale?: "en" | "fr" }) {
  const isFr = locale === "fr";
  return (
    <div className="text-center py-20">
      <div className="mx-auto mb-5 flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-med)" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--tx-3)" }}><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
      </div>
      <p className="text-lg font-semibold" style={{ color: "var(--tx-1)" }}>
        {mode === "personal"
          ? isFr ? "Aucune recommandation personnalisée" : "No personalised recommendations"
          : isFr ? "Aucune recommandation disponible" : "No recommendations available"}
      </p>
      <p className="text-sm mt-2" style={{ color: "var(--tx-3)" }}>
        {mode === "personal"
          ? isFr
            ? "Ajoutez des positions à votre portfolio pour voir les alertes de vente et les achats sur vos secteurs."
            : "Add positions to your portfolio to see sell alerts and buys in your sectors."
          : isFr
            ? "Revenez dans quelques heures, les données AMF sont synchronisées quotidiennement."
            : "Check back in a few hours — AMF data is synced daily."}
      </p>
      {mode === "personal" && (
        <Link href="/portfolio/" className="btn btn-primary mt-6 inline-flex">
          {isFr ? "Gérer mon portfolio" : "Manage my portfolio"}
        </Link>
      )}
    </div>
  );
}

function AlertToggle({ alertEnabled, locale = "fr" }: { alertEnabled: boolean; locale?: "en" | "fr" }) {
  const isFr = locale === "fr";
  return (
    <form action="/api/alerts/preferences" method="POST"
      className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: alertEnabled ? "var(--gold-bg)" : "var(--bg-raised)", border: `1px solid ${alertEnabled ? "var(--gold-bd)" : "var(--border)"}` }}>
      <div className="w-2 h-2 rounded-full" style={{ background: alertEnabled ? "var(--gold)" : "var(--tx-4)" }} />
      <span className="text-xs font-semibold" style={{ color: alertEnabled ? "var(--gold)" : "var(--tx-3)" }}>
        {alertEnabled
          ? isFr ? "Alertes email actives" : "Email alerts active"
          : isFr ? "Alertes désactivées" : "Alerts disabled"}
      </span>
    </form>
  );
}

function SectionHeader({ title, sub, count, locale = "en" }: { title: string; sub: string; count?: number; locale?: "en" | "fr" }) {
  const isFr = locale === "fr";
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6 pb-3" style={{ borderBottom: "1px solid var(--border-med)" }}>
      <div>
        <div className="flex items-baseline gap-3">
          <h2 style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontSize: "1.35rem",
            fontWeight: 400,
            color: "var(--tx-1)",
            letterSpacing: "-0.01em",
          }}>
            {title}
          </h2>
          {count != null && (
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.68rem",
              color: "var(--gold)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}>
 · {count.toString().padStart(2, "0")} {isFr ? "signaux" : "signals"}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--tx-3)", fontStyle: "italic", letterSpacing: "0.005em" }}>{sub}</p>
      </div>
    </div>
  );
}

// ── Score methodology card ────────────────────────────────────────────────────

function MethodologyCard({ locale = "en" }: { locale?: "en" | "fr" }) {
  const isFr = locale === "fr";
  const pts = isFr
    ? [
        { label: "Signal AMF v3",   pts: "30", desc: "Score propriétaire 10 composantes (track record, DCA…)" },
        { label: "Win rate (shr.)", pts: "25", desc: "% trades gagnants, shrinkage bayésien vers la moyenne" },
        { label: "Retour T+90 (shr.)", pts: "20", desc: "Rendement moyen historique, shrinkage bayésien" },
        { label: "Récence",         pts: "15", desc: "Décroissance exp. · demi-vie 45j (v3) + staleness" },
        { label: "Conviction",      pts: "10", desc: "Cluster · % mcap · taille ticket" },
      ]
    : [
        { label: "AMF signal v3",   pts: "30", desc: "Proprietary 10-component score (track record, DCA…)" },
        { label: "Win rate (shr.)", pts: "25", desc: "% winning trades, Bayesian shrinkage toward mean" },
        { label: "T+90 return (shr.)", pts: "20", desc: "Average historical return, Bayesian shrinkage" },
        { label: "Recency",         pts: "15", desc: "Exp. decay · half-life 45d (v3) + staleness" },
        { label: "Conviction",      pts: "10", desc: "Cluster · % mcap · ticket size" },
      ];
  return (
    <div className="mb-8" style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-med)",
      borderLeft: "3px solid var(--gold)",
      borderRadius: "2px",
      padding: "16px clamp(14px, 4vw, 24px) 18px",
    }}>
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <span style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontStyle: "italic",
          fontSize: "1.05rem",
          color: "var(--gold)",
          letterSpacing: "-0.01em",
        }}>
          {isFr ? "Méthodologie" : "Methodology"}
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.64rem",
          color: "var(--tx-3)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}>
 · {isFr ? "Score composite / 100 pts" : "Composite score / 100 pts"}
        </span>
        <Link
          href="/methodologie/"
          style={{
            marginLeft: "auto",
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: "0.72rem",
            fontWeight: 600,
            color: "var(--gold)",
            textDecoration: "none",
            letterSpacing: "0.02em",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {isFr ? "Tout comprendre" : "Learn more"}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 17L17 7M17 7H8M17 7v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" style={{ gap: 0 }}>
        {pts.map((p, i) => (
          <div key={i} className="methodology-cell" style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--border)",
          }}>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span style={{
                fontFamily: "'Banana Grotesk', sans-serif",
                fontSize: "1.35rem", fontWeight: 700,
                color: "var(--gold)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}>{p.pts}</span>
              <span style={{ fontSize: "0.62rem", color: "var(--tx-4)", letterSpacing: "0.06em" }}>PTS</span>
            </div>
            <div style={{
              fontSize: "0.78rem", fontWeight: 600,
              color: "var(--tx-1)", marginBottom: 2,
              letterSpacing: "-0.005em",
            }}>{p.label}</div>
            <div style={{ fontSize: "0.68rem", color: "var(--tx-3)", lineHeight: 1.45 }}>{p.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tabs (rendered instantly, counts stream in via Suspense) ─────────────────

function Tabs({ activeTab, isAuth, locale = "en" }: { activeTab: "general" | "sells" | "personal"; isAuth: boolean; locale?: "en" | "fr" }) {
  const isFr = locale === "fr";
  return (
    <div className="flex gap-0 mb-8 overflow-x-auto" style={{ borderBottom: "1px solid var(--border-med)" }}>
      <Link
        href="/recommendations/"
        className="reco-tab"
        style={{
          color: activeTab === "general" ? "var(--tx-1)" : "var(--tx-3)",
          borderBottomColor: activeTab === "general" ? "var(--signal-pos)" : "transparent",
        }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: "var(--signal-pos)" }}>
          <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {isFr ? "Achats" : "Buys"}
      </Link>
      <Link
        href="/recommendations?tab=sells"
        className="reco-tab"
        style={{
          color: activeTab === "sells" ? "var(--tx-1)" : "var(--tx-3)",
          borderBottomColor: activeTab === "sells" ? "var(--signal-neg)" : "transparent",
        }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: "var(--signal-neg)" }}>
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        {isFr ? "Ventes" : "Sells"}
      </Link>
      {isAuth ? (
        <Link
          href="/recommendations?tab=personal"
          className="reco-tab"
          style={{
            color: activeTab === "personal" ? "var(--tx-1)" : "var(--tx-3)",
            borderBottomColor: activeTab === "personal" ? "var(--gold)" : "transparent",
          }}>
          {isFr ? "Pour moi" : "For me"}
        </Link>
      ) : (
        <Link href="/auth/login?next=/recommendations?tab=personal"
          className="reco-tab"
          style={{ color: "var(--tx-4)" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          {isFr ? "Pour moi" : "For me"}
        </Link>
      )}
    </div>
  );
}

// ── Skeletons shown while server computes recommendations ────────────────────

function RecoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5" style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ height: "210px", borderRadius: "14px", background: "var(--bg-raised)" }} />
      ))}
    </div>
  );
}

function SectionHeaderSkeleton() {
  return (
    <div className="mb-6 pb-3" style={{ borderBottom: "1px solid var(--border-med)", animation: "pulse 1.5s ease-in-out infinite" }}>
      <div style={{ height: "28px", width: "min(260px, 70%)", borderRadius: "6px", background: "var(--bg-raised)", marginBottom: "8px" }} />
      <div style={{ height: "14px", width: "min(440px, 90%)", borderRadius: "4px", background: "var(--bg-raised)" }} />
    </div>
  );
}

// ── Streaming sections · heavy Prisma work happens here ──────────────────────

async function GeneralTabContent({ isAuth, locale = "en" }: { isAuth: boolean; locale?: "en" | "fr" }) {
  const isFr = locale === "fr";
  const raw = await getGeneralRecos();
  const recos = maskRecos(raw, isAuth);
  return (
    <>
      <SectionHeader
        title={isFr ? "Top signaux d'achat" : "Top buy signals"}
        sub={isFr
          ? "Toutes sociétés cotées françaises · Déclarations AMF des 90 derniers jours"
          : "All French listed companies · AMF declarations from the last 90 days"}
        count={recos.length}
        locale={locale}
      />
      {recos.length === 0 ? (
        <EmptyState mode="general" locale={locale} />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            {recos.slice(0, FREE_VISIBLE).map((item, i) => (
              <RecoCard key={item.declarationId} item={item} rank={i + 1} locale={locale} />
            ))}
          </div>
          {!isAuth && recos.length > FREE_VISIBLE && (
            <FreemiumGate locale={locale} feature={isFr
              ? "les 7 autres recommandations avec noms des entreprises, scores et retours estimés"
              : "the 7 other recommendations with company names, scores and estimated returns"}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {recos.slice(FREE_VISIBLE).map((item, i) => (
                  <RecoCard key={item.declarationId} item={item} rank={FREE_VISIBLE + i + 1} locale={locale} />
                ))}
              </div>
            </FreemiumGate>
          )}
          {isAuth && recos.length > FREE_VISIBLE && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {recos.slice(FREE_VISIBLE).map((item, i) => (
                <RecoCard key={item.declarationId} item={item} rank={FREE_VISIBLE + i + 1} locale={locale} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

async function SellsTabContent({ isAuth, locale = "en" }: { isAuth: boolean; locale?: "en" | "fr" }) {
  const isFr = locale === "fr";
  const raw = await getSellRecos();
  const recos = maskRecos(raw, isAuth);
  return (
    <>
      <SectionHeader
        title={isFr ? "Top signaux de vente" : "Top sell signals"}
        sub={isFr
          ? "Cessions de dirigeants sur des profils historiquement baissiers à T+90"
          : "Executive disposals on historically bearish profiles at T+90"}
        count={recos.length}
        locale={locale}
      />
      {recos.length === 0 ? (
        <div className="text-center py-20">
          <div className="mx-auto mb-5 flex items-center justify-center w-14 h-14 rounded-2xl"
            style={{ background: "var(--signal-neg-bg)", border: "1px solid var(--signal-neg-bd)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--signal-neg)" }}>
              <path d="M12 4v16M6 14l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="text-lg font-semibold" style={{ color: "var(--tx-1)" }}>
            {isFr ? "Aucun signal de vente actionnable" : "No actionable sell signal"}
          </p>
          <p className="text-sm mt-2" style={{ color: "var(--tx-3)", maxWidth: "420px", margin: "8px auto 0" }}>
            {isFr
              ? "Les cessions récentes ne répondent pas aux critères de conviction ou aux patterns historiquement baissiers."
              : "Recent disposals do not meet the conviction criteria or historically bearish patterns."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-4">
            {recos.slice(0, FREE_VISIBLE).map((item, i) => (
              <RecoCard key={item.declarationId} item={item} rank={i + 1} locale={locale} />
            ))}
          </div>
          {!isAuth && recos.length > FREE_VISIBLE && (
            <FreemiumGate locale={locale} feature={isFr
              ? `les ${recos.length - FREE_VISIBLE} autres signaux de vente avec sociétés, dirigeants et retours historiques`
              : `the ${recos.length - FREE_VISIBLE} other sell signals with companies, insiders and historical returns`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {recos.slice(FREE_VISIBLE).map((item, i) => (
                  <RecoCard key={item.declarationId} item={item} rank={FREE_VISIBLE + i + 1} locale={locale} />
                ))}
              </div>
            </FreemiumGate>
          )}
          {isAuth && recos.length > FREE_VISIBLE && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {recos.slice(FREE_VISIBLE).map((item, i) => (
                <RecoCard key={item.declarationId} item={item} rank={FREE_VISIBLE + i + 1} locale={locale} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

async function PersonalTabContent({ userId, locale = "en" }: { userId: string; locale?: "en" | "fr" }) {
  const isFr = locale === "fr";
  const data = await getPersonalRecosCached(userId);
  const hasPortfolio = data.portfolioSize > 0;

  if (!hasPortfolio) {
    return (
      <>
        <div className="card p-5 mb-6 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
            style={{ background: "var(--c-amber-bg)", border: "1px solid var(--c-amber-bd)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="var(--c-amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p className="font-semibold text-sm mb-1" style={{ color: "var(--tx-1)" }}>
              {isFr
                ? "Ajoutez vos positions pour des recos personnalisées"
                : "Add your positions for personalised recommendations"}
            </p>
            <p className="text-xs" style={{ color: "var(--tx-3)" }}>
              {isFr ? (
                <>
                  Sans portfolio, vous voyez les mêmes signaux que la vue générale. Importez vos positions pour :
                  alertes de vente sur vos holdings · signaux d&apos;accumulation sur vos secteurs · email quotidien personnalisé.
                </>
              ) : (
                <>
                  Without a portfolio you see the same signals as the general view. Import your positions for:
                  sell alerts on your holdings · accumulation signals in your sectors · personalised daily email.
                </>
              )}
            </p>
            <Link href="/portfolio/" className="btn btn-primary mt-3 text-xs py-1.5 px-3">
              {isFr ? "Ajouter mon portfolio →" : "Add my portfolio →"}
            </Link>
          </div>
        </div>
        <SectionHeader
          title={isFr ? "Vos recommandations" : "Your recommendations"}
          sub={isFr
            ? "Vue générale · ajoutez un portfolio pour personnaliser"
            : "General view · add a portfolio to personalise"}
          count={data.recos.length}
          locale={locale}
        />
        {data.recos.length === 0 ? (
          <EmptyState mode="personal" locale={locale} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {data.recos.map((item, i) => (
              <RecoCard key={item.declarationId} item={item} rank={i + 1} locale={locale} />
            ))}
          </div>
        )}
      </>
    );
  }

  const sellRecos = data.recos.filter((r) => r.action === "SELL");
  const buyRecos = data.recos.filter((r) => r.action === "BUY");

  return (
    <>
      {/* Alert preference toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 p-4 rounded-xl"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-med)" }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--tx-1)" }}>
            {isFr ? "Alertes email" : "Email alerts"}
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
            {isFr
              ? <>Recevez un email dès qu&apos;un nouveau signal fort apparaît · {data.portfolioSize} positions suivies</>
              : <>Get an email as soon as a new strong signal appears · {data.portfolioSize} positions tracked</>}
          </div>
        </div>
        <AlertToggle alertEnabled={data.alertEnabled} locale={locale} />
      </div>

      {sellRecos.length > 0 && (
        <>
          <SectionHeader
            title={isFr ? "Ventes sur vos positions" : "Sells on your positions"}
            sub={isFr
              ? "Des insiders vendent des sociétés que vous détenez en portefeuille"
              : "Insiders are selling companies you hold in your portfolio"}
            count={sellRecos.length}
            locale={locale}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
            {sellRecos.map((item, i) => (
              <RecoCard key={item.declarationId} item={item} rank={i + 1} locale={locale} />
            ))}
          </div>
        </>
      )}

      {buyRecos.length > 0 && (
        <>
          <SectionHeader
            title={isFr ? "Signaux d'achat pour vous" : "Buy signals for you"}
            sub={isFr
              ? "Basés sur votre profil de portfolio et les performances historiques similaires"
              : "Based on your portfolio profile and similar historical performance"}
            count={buyRecos.length}
            locale={locale}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {buyRecos.map((item, i) => (
              <RecoCard key={item.declarationId} item={item} rank={i + 1} locale={locale} />
            ))}
          </div>
        </>
      )}

      {data.recos.length === 0 && <EmptyState mode="personal" locale={locale} />}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function RecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab: "general" | "sells" | "personal" =
    tab === "personal" ? "personal"
    : tab === "sells" ? "sells"
    : "general";

  // Only fetch auth status (instant JWT verify, no DB call) · heavy data streams in below
  const [user, hdrs] = await Promise.all([getCurrentUser(), headers()]);
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";
  const isAuth = !!user;

  const dateLabel = new Date().toLocaleDateString(isFr ? "fr-FR" : "en-US", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="content-wrapper">

      {/* ── Page header · editorial masthead (rendered instantly) ── */}
      <div className="mb-8">
        <div className="masthead-dateline">
          <span className="masthead-folio">
            № {dateLabel}
          </span>
          <span className="masthead-rule" aria-hidden="true" />
          <span className="masthead-live">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--gold)" }} />
            {isFr ? "Live · mis à jour quotidiennement" : "Live · updated daily"}
          </span>
        </div>
        <h1 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(2rem, 6vw, 3.75rem)",
          fontWeight: 400,
          letterSpacing: "-0.015em",
          lineHeight: 1.05,
          color: "var(--tx-1)",
          marginBottom: "14px",
          overflowWrap: "break-word",
          hyphens: "auto",
        }}>
          {isFr ? (
            <>Recommandations <span style={{ fontStyle: "italic", color: "var(--gold)" }}>actionnables</span></>
          ) : (
            <>Actionable <span style={{ fontStyle: "italic", color: "var(--gold)" }}>recommendations</span></>
          )}
        </h1>
        <p style={{
          fontSize: "0.92rem",
          color: "var(--tx-2)",
          maxWidth: "680px",
          lineHeight: 1.6,
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          {activeTab === "sells" ? (
            isFr ? (
              <>
                Signaux de <strong style={{ color: "var(--tx-1)" }}>vente</strong> : dirigeants qui cèdent leurs actions
                sur des profils où le titre a historiquement{" "}
                <strong style={{ color: "var(--signal-neg)" }}>baissé</strong> dans les 90 jours suivants.
                Filtrage strict : retour historique T+90 ≤ -2% ou score ≥ 55.
              </>
            ) : (
              <>
                <strong style={{ color: "var(--tx-1)" }}>Sell</strong> signals: executives disposing of shares
                on profiles where the stock has historically{" "}
                <strong style={{ color: "var(--signal-neg)" }}>declined</strong> in the following 90 days.
                Strict filter: historical T+90 return ≤ -2% or score ≥ 55.
              </>
            )
          ) : (
            isFr ? (
              <>
                Signaux d&apos;achat classés par score composite · signal AMF × backtest historique × récence × conviction.
                Nous ne présentons que les dossiers avec un retour estimé supérieur à{" "}
                <strong style={{ color: "var(--tx-1)" }}>+4 % T+90</strong>.
              </>
            ) : (
              <>
                Buy signals ranked by composite score · AMF signal × historical backtest × recency × conviction.
                We only surface opportunities with an estimated return above{" "}
                <strong style={{ color: "var(--tx-1)" }}>+4% T+90</strong>.
              </>
            )
          )}
        </p>
      </div>

      {/* ── Tabs + Methodology (no data dependency, render instantly) ── */}
      <Tabs activeTab={activeTab} isAuth={isAuth} locale={locale} />
      <MethodologyCard locale={locale} />

      {/* ── Tab content streams in via Suspense ── */}
      {activeTab === "general" && (
        <Suspense fallback={<><SectionHeaderSkeleton /><RecoGridSkeleton /></>}>
          <GeneralTabContent isAuth={isAuth} locale={locale} />
        </Suspense>
      )}

      {activeTab === "sells" && (
        <Suspense fallback={<><SectionHeaderSkeleton /><RecoGridSkeleton /></>}>
          <SellsTabContent isAuth={isAuth} locale={locale} />
        </Suspense>
      )}

      {activeTab === "personal" && !user && (
        <div className="text-center py-16">
          <div className="mx-auto mb-5 flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-med)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--tx-3)" }}><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </div>
          <p className="text-lg font-semibold mb-2" style={{ color: "var(--tx-1)" }}>
            {isFr ? "Connexion requise" : "Sign in required"}
          </p>
          <p className="text-sm mb-6" style={{ color: "var(--tx-3)" }}>
            {isFr
              ? "Les recommandations personnalisées nécessitent un compte avec portfolio."
              : "Personalised recommendations require an account with a portfolio."}
          </p>
          <Link href="/auth/login?next=/recommendations?tab=personal" className="btn btn-primary">
            {isFr ? "Se connecter" : "Sign in"}
          </Link>
        </div>
      )}

      {activeTab === "personal" && user && (
        <Suspense fallback={<><SectionHeaderSkeleton /><RecoGridSkeleton /></>}>
          <PersonalTabContent userId={user.id} locale={locale} />
        </Suspense>
      )}

      {/* ── Disclaimer ── */}
      <div className="mt-12 p-4 rounded-xl" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--tx-4)" }}>
          {isFr ? (
            <>
              <strong style={{ color: "var(--tx-3)" }}>Avertissement :</strong>{" "}
              Ces recommandations sont générées algorithmiquement à partir des déclarations AMF publiques et de l&apos;analyse des performances historiques.
              Elles ne constituent pas des conseils en investissement. Les performances passées ne préjugent pas des performances futures.
              Investir comporte des risques de perte en capital.
            </>
          ) : (
            <>
              <strong style={{ color: "var(--tx-3)" }}>Disclaimer:</strong>{" "}
              These recommendations are generated algorithmically from public AMF declarations and historical performance analysis.
              They do not constitute investment advice. Past performance is not indicative of future results.
              Investing carries a risk of capital loss.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
