/**
 * /recommendations — Page des recommandations actionnables
 *
 * Tab "Achats"   : Top 10 signaux d'achat (tous utilisateurs)
 * Tab "Ventes"   : Top 10 signaux de vente (tous utilisateurs)
 * Tab "Pour moi" : Top personnalisés selon le portfolio de l'utilisateur
 */
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getRecommendations, type RecoItem } from "@/lib/recommendation-engine";
import { RecoCard } from "@/components/RecoCard";
import FreemiumGate from "@/components/FreemiumGate";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { unstable_cache } from "next/cache";

const FREE_VISIBLE = 3; // number of reco cards visible to non-authenticated users

export const revalidate = 600; // Revalidate every 10 min

export const metadata = {
  title: "Recommandations — InsiderTrades Sigma",
  description: "Top signaux d'achat et de vente basés sur les performances historiques et les transactions récentes des dirigeants AMF.",
};

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
      insider: { name: "████████", function: null, role: r.insider.role },
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
    ["reco-personal-v2", userId],
    { revalidate: 300, tags: [`reco-personal-${userId}`] }
  )();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({ mode }: { mode: "general" | "personal" }) {
  return (
    <div className="text-center py-20">
      <div className="mx-auto mb-5 flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-med)" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--tx-3)" }}><rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
      </div>
      <p className="text-lg font-semibold" style={{ color: "var(--tx-1)" }}>
        {mode === "personal" ? "Aucune recommandation personnalisée" : "Aucune recommandation disponible"}
      </p>
      <p className="text-sm mt-2" style={{ color: "var(--tx-3)" }}>
        {mode === "personal"
          ? "Ajoutez des positions à votre portfolio pour voir les alertes de vente et les achats sur vos secteurs."
          : "Revenez dans quelques heures, les données AMF sont synchronisées quotidiennement."}
      </p>
      {mode === "personal" && (
        <Link href="/portfolio" className="btn btn-primary mt-6 inline-flex">
          Gérer mon portfolio
        </Link>
      )}
    </div>
  );
}

function AlertToggle({ alertEnabled }: { alertEnabled: boolean }) {
  return (
    <form action="/api/alerts/preferences" method="POST"
      className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: alertEnabled ? "var(--gold-bg)" : "var(--bg-raised)", border: `1px solid ${alertEnabled ? "var(--gold-bd)" : "var(--border)"}` }}>
      <div className="w-2 h-2 rounded-full" style={{ background: alertEnabled ? "var(--gold)" : "var(--tx-4)" }} />
      <span className="text-xs font-semibold" style={{ color: alertEnabled ? "var(--gold)" : "var(--tx-3)" }}>
        {alertEnabled ? "Alertes email actives" : "Alertes désactivées"}
      </span>
    </form>
  );
}

function SectionHeader({ title, sub, count }: { title: string; sub: string; count?: number }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6 pb-3" style={{ borderBottom: "1px solid var(--border-med)" }}>
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
              — {count.toString().padStart(2, "0")} signaux
            </span>
          )}
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--tx-3)", fontStyle: "italic", letterSpacing: "0.005em" }}>{sub}</p>
      </div>
    </div>
  );
}

// ── Score methodology card ────────────────────────────────────────────────────

function MethodologyCard() {
  const pts = [
    { label: "Signal AMF",    pts: "30", desc: "Score propriétaire + comportement insider" },
    { label: "Win rate",      pts: "25", desc: "% trades gagnants pour ce profil" },
    { label: "Retour T+90",   pts: "20", desc: "Rendement moyen historique" },
    { label: "Récence",       pts: "15", desc: "Décroissance exp. · demi-vie 21j" },
    { label: "Conviction",    pts: "10", desc: "Cluster · % mcap · taille ticket" },
  ];
  return (
    <div className="mb-8" style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-med)",
      borderLeft: "3px solid var(--gold)",
      borderRadius: "2px",
      padding: "18px 24px 20px",
    }}>
      <div className="flex items-baseline gap-3 mb-4 flex-wrap">
        <span style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontStyle: "italic",
          fontSize: "1.05rem",
          color: "var(--gold)",
          letterSpacing: "-0.01em",
        }}>
          Méthodologie
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.64rem",
          color: "var(--tx-3)",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}>
          — Score composite / 100 pts
        </span>
        <Link
          href="/methodologie"
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
          Tout comprendre
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 17L17 7M17 7H8M17 7v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5" style={{ gap: 0 }}>
        {pts.map((p, i) => (
          <div key={i} style={{
            padding: "10px 14px",
            borderRight: i < pts.length - 1 ? "1px solid var(--border)" : "none",
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

function Tabs({ activeTab, isAuth }: { activeTab: "general" | "sells" | "personal"; isAuth: boolean }) {
  return (
    <div className="flex gap-0 mb-8 overflow-x-auto" style={{ borderBottom: "1px solid var(--border-med)" }}>
      <Link
        href="/recommendations"
        className="reco-tab"
        style={{
          color: activeTab === "general" ? "var(--tx-1)" : "var(--tx-3)",
          borderBottomColor: activeTab === "general" ? "var(--signal-pos)" : "transparent",
        }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: "var(--signal-pos)" }}>
          <path d="M7 14l5-5 5 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Achats
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
        Ventes
      </Link>
      {isAuth ? (
        <Link
          href="/recommendations?tab=personal"
          className="reco-tab"
          style={{
            color: activeTab === "personal" ? "var(--tx-1)" : "var(--tx-3)",
            borderBottomColor: activeTab === "personal" ? "var(--gold)" : "transparent",
          }}>
          Pour moi
        </Link>
      ) : (
        <Link href="/auth/login?next=/recommendations?tab=personal"
          className="reco-tab"
          style={{ color: "var(--tx-4)" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          Pour moi
        </Link>
      )}
    </div>
  );
}

// ── Skeletons shown while server computes recommendations ────────────────────

function RecoGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5" style={{ animation: "pulse 1.5s ease-in-out infinite" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ height: "210px", borderRadius: "14px", background: "var(--bg-raised)" }} />
      ))}
    </div>
  );
}

function SectionHeaderSkeleton() {
  return (
    <div className="mb-6 pb-3" style={{ borderBottom: "1px solid var(--border-med)", animation: "pulse 1.5s ease-in-out infinite" }}>
      <div style={{ height: "28px", width: "260px", borderRadius: "6px", background: "var(--bg-raised)", marginBottom: "8px" }} />
      <div style={{ height: "14px", width: "440px", borderRadius: "4px", background: "var(--bg-raised)" }} />
    </div>
  );
}

// ── Streaming sections — heavy Prisma work happens here ──────────────────────

async function GeneralTabContent({ isAuth }: { isAuth: boolean }) {
  const raw = await getGeneralRecos();
  const recos = maskRecos(raw, isAuth);
  return (
    <>
      <SectionHeader
        title="Top signaux d'achat"
        sub="Toutes sociétés cotées françaises · Déclarations AMF des 90 derniers jours"
        count={recos.length}
      />
      {recos.length === 0 ? (
        <EmptyState mode="general" />
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-4">
            {recos.slice(0, FREE_VISIBLE).map((item, i) => (
              <RecoCard key={item.declarationId} item={item} rank={i + 1} />
            ))}
          </div>
          {!isAuth && recos.length > FREE_VISIBLE && (
            <FreemiumGate feature="les 7 autres recommandations avec noms des entreprises, scores et retours estimés">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {recos.slice(FREE_VISIBLE).map((item, i) => (
                  <RecoCard key={item.declarationId} item={item} rank={FREE_VISIBLE + i + 1} />
                ))}
              </div>
            </FreemiumGate>
          )}
          {isAuth && recos.length > FREE_VISIBLE && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {recos.slice(FREE_VISIBLE).map((item, i) => (
                <RecoCard key={item.declarationId} item={item} rank={FREE_VISIBLE + i + 1} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

async function SellsTabContent({ isAuth }: { isAuth: boolean }) {
  const raw = await getSellRecos();
  const recos = maskRecos(raw, isAuth);
  return (
    <>
      <SectionHeader
        title="Top signaux de vente"
        sub="Cessions de dirigeants sur des profils historiquement baissiers à T+90"
        count={recos.length}
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
            Aucun signal de vente actionnable
          </p>
          <p className="text-sm mt-2" style={{ color: "var(--tx-3)", maxWidth: "420px", margin: "8px auto 0" }}>
            Les cessions récentes ne répondent pas aux critères de conviction ou aux patterns historiquement baissiers.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-4">
            {recos.slice(0, FREE_VISIBLE).map((item, i) => (
              <RecoCard key={item.declarationId} item={item} rank={i + 1} />
            ))}
          </div>
          {!isAuth && recos.length > FREE_VISIBLE && (
            <FreemiumGate feature={`les ${recos.length - FREE_VISIBLE} autres signaux de vente avec sociétés, dirigeants et retours historiques`}>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {recos.slice(FREE_VISIBLE).map((item, i) => (
                  <RecoCard key={item.declarationId} item={item} rank={FREE_VISIBLE + i + 1} />
                ))}
              </div>
            </FreemiumGate>
          )}
          {isAuth && recos.length > FREE_VISIBLE && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {recos.slice(FREE_VISIBLE).map((item, i) => (
                <RecoCard key={item.declarationId} item={item} rank={FREE_VISIBLE + i + 1} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

async function PersonalTabContent({ userId }: { userId: string }) {
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
              Ajoutez vos positions pour des recos personnalisées
            </p>
            <p className="text-xs" style={{ color: "var(--tx-3)" }}>
              Sans portfolio, vous voyez les mêmes signaux que la vue générale. Importez vos positions pour :
              alertes de vente sur vos holdings · signaux d&apos;accumulation sur vos secteurs · email quotidien personnalisé.
            </p>
            <Link href="/portfolio" className="btn btn-primary mt-3 text-xs py-1.5 px-3">
              Ajouter mon portfolio →
            </Link>
          </div>
        </div>
        <SectionHeader
          title="Vos recommandations"
          sub="Vue générale · ajoutez un portfolio pour personnaliser"
          count={data.recos.length}
        />
        {data.recos.length === 0 ? (
          <EmptyState mode="personal" />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {data.recos.map((item, i) => (
              <RecoCard key={item.declarationId} item={item} rank={i + 1} />
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
      <div className="flex items-center justify-between mb-6 p-4 rounded-xl"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-med)" }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--tx-1)" }}>
            Alertes email
          </div>
          <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
            Recevez un email dès qu&apos;un nouveau signal fort apparaît · {data.portfolioSize} positions suivies
          </div>
        </div>
        <AlertToggle alertEnabled={data.alertEnabled} />
      </div>

      {sellRecos.length > 0 && (
        <>
          <SectionHeader
            title="Ventes sur vos positions"
            sub="Des insiders vendent des sociétés que vous détenez en portefeuille"
            count={sellRecos.length}
          />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-8">
            {sellRecos.map((item, i) => (
              <RecoCard key={item.declarationId} item={item} rank={i + 1} />
            ))}
          </div>
        </>
      )}

      {buyRecos.length > 0 && (
        <>
          <SectionHeader
            title="Signaux d'achat pour vous"
            sub="Basés sur votre profil de portfolio et les performances historiques similaires"
            count={buyRecos.length}
          />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {buyRecos.map((item, i) => (
              <RecoCard key={item.declarationId} item={item} rank={i + 1} />
            ))}
          </div>
        </>
      )}

      {data.recos.length === 0 && <EmptyState mode="personal" />}
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

  // Only fetch auth status (instant JWT verify, no DB call) — heavy data streams in below
  const user = await getCurrentUser();
  const isAuth = !!user;

  return (
    <div className="content-wrapper">

      {/* ── Page header — editorial masthead (rendered instantly) ── */}
      <div className="mb-8">
        <div className="masthead-dateline">
          <span className="masthead-folio">
            № {new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
          </span>
          <span className="masthead-rule" aria-hidden="true" />
          <span className="masthead-live">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--gold)" }} />
            Live · mis à jour quotidiennement
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
          Recommandations <span style={{ fontStyle: "italic", color: "var(--gold)" }}>actionnables</span>
        </h1>
        <p style={{
          fontSize: "0.92rem",
          color: "var(--tx-2)",
          maxWidth: "680px",
          lineHeight: 1.6,
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          {activeTab === "sells" ? (
            <>
              Signaux de <strong style={{ color: "var(--tx-1)" }}>vente</strong> : dirigeants qui cèdent leurs actions
              sur des profils où le titre a historiquement{" "}
              <strong style={{ color: "var(--signal-neg)" }}>baissé</strong> dans les 90 jours suivants.
              Filtrage strict : retour historique T+90 ≤ -2% ou score ≥ 55.
            </>
          ) : (
            <>
              Signaux d&apos;achat classés par score composite — signal AMF × backtest historique × récence × conviction.
              Nous ne présentons que les dossiers avec un retour estimé supérieur à{" "}
              <strong style={{ color: "var(--tx-1)" }}>+4 % T+90</strong>.
            </>
          )}
        </p>
      </div>

      {/* ── Tabs + Methodology (no data dependency, render instantly) ── */}
      <Tabs activeTab={activeTab} isAuth={isAuth} />
      <MethodologyCard />

      {/* ── Tab content streams in via Suspense ── */}
      {activeTab === "general" && (
        <Suspense fallback={<><SectionHeaderSkeleton /><RecoGridSkeleton /></>}>
          <GeneralTabContent isAuth={isAuth} />
        </Suspense>
      )}

      {activeTab === "sells" && (
        <Suspense fallback={<><SectionHeaderSkeleton /><RecoGridSkeleton /></>}>
          <SellsTabContent isAuth={isAuth} />
        </Suspense>
      )}

      {activeTab === "personal" && !user && (
        <div className="text-center py-16">
          <div className="mx-auto mb-5 flex items-center justify-center w-14 h-14 rounded-2xl" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-med)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: "var(--tx-3)" }}><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </div>
          <p className="text-lg font-semibold mb-2" style={{ color: "var(--tx-1)" }}>Connexion requise</p>
          <p className="text-sm mb-6" style={{ color: "var(--tx-3)" }}>
            Les recommandations personnalisées nécessitent un compte avec portfolio.
          </p>
          <Link href="/auth/login?next=/recommendations?tab=personal" className="btn btn-primary">
            Se connecter
          </Link>
        </div>
      )}

      {activeTab === "personal" && user && (
        <Suspense fallback={<><SectionHeaderSkeleton /><RecoGridSkeleton /></>}>
          <PersonalTabContent userId={user.id} />
        </Suspense>
      )}

      {/* ── Disclaimer ── */}
      <div className="mt-12 p-4 rounded-xl" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--tx-4)" }}>
          <strong style={{ color: "var(--tx-3)" }}>Avertissement :</strong>{" "}
          Ces recommandations sont générées algorithmiquement à partir des déclarations AMF publiques et de l&apos;analyse des performances historiques.
          Elles ne constituent pas des conseils en investissement. Les performances passées ne préjugent pas des performances futures.
          Investir comporte des risques de perte en capital.
        </p>
      </div>
    </div>
  );
}
