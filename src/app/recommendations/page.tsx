/**
 * /recommendations — Page des recommandations actionnables
 *
 * Tab "Général"  : Top 10 signaux d'achat tous utilisateurs
 * Tab "Pour moi" : Top 10 personnalisés (+ ventes sur positions) pour users avec portfolio
 */
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getRecommendations, type RecoItem } from "@/lib/recommendation-engine";
import { RecoCard } from "@/components/RecoCard";
import FreemiumGate from "@/components/FreemiumGate";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

const FREE_VISIBLE = 3; // number of reco cards visible to non-authenticated users

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Recommandations — InsiderTrades",
  description: "Top 10 signaux d'achat basés sur les performances historiques et les transactions récentes des dirigeants AMF.",
};

async function getGeneralRecos(): Promise<RecoItem[]> {
  try {
    return await getRecommendations({ mode: "general", limit: 10, lookbackDays: 90 });
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

async function getPersonalRecos(userId: string): Promise<{ recos: RecoItem[]; portfolioSize: number; alertEnabled: boolean }> {
  try {
    const [positions, user] = await Promise.all([
      prisma.portfolioPosition.findMany({ where: { userId, isin: { not: null } }, select: { isin: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { alertEnabled: true } }),
    ]);
    const portfolioIsins = positions.map((p) => p.isin!).filter(Boolean);
    const recos = await getRecommendations({ mode: "personal", limit: 12, lookbackDays: 90, portfolioIsins });
    return { recos, portfolioSize: positions.length, alertEnabled: user?.alertEnabled ?? true };
  } catch { return { recos: [], portfolioSize: 0, alertEnabled: true }; }
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
      style={{ background: alertEnabled ? "var(--c-mint-bg)" : "var(--bg-raised)", border: `1px solid ${alertEnabled ? "var(--c-mint-bd)" : "var(--border)"}` }}>
      <div className="w-2 h-2 rounded-full" style={{ background: alertEnabled ? "var(--c-mint)" : "var(--tx-4)" }} />
      <span className="text-xs font-semibold" style={{ color: alertEnabled ? "var(--c-mint)" : "var(--tx-3)" }}>
        {alertEnabled ? "Alertes email actives" : "Alertes désactivées"}
      </span>
    </form>
  );
}

function SectionHeader({ title, sub, count }: { title: string; sub: string; count?: number }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6">
      <div>
        <div className="flex items-center gap-2.5">
          <div style={{ width: "3px", height: "18px", background: "var(--c-indigo)", borderRadius: "2px", flexShrink: 0 }} />
          <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--tx-1)", letterSpacing: "-0.025em", fontFamily: "'Banana Grotesk', 'Space Grotesk', sans-serif" }}>
            {title}
            {count != null && (
              <span className="ml-2 text-sm font-semibold" style={{ color: "var(--tx-3)" }}>
                {count} signaux
              </span>
            )}
          </h2>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--tx-3)", paddingLeft: "15px" }}>{sub}</p>
      </div>
    </div>
  );
}

// ── Score methodology card ────────────────────────────────────────────────────

function MethodologyCard() {
  const pts = [
    { label: "Score signal (0-30 pts)", desc: "Score propriétaire AMF + comportement insider" },
    { label: "Win rate historique (0-25 pts)", desc: "% de trades gagnants pour ce type de signal" },
    { label: "Retour attendu T+90 (0-20 pts)", desc: "Rendement moyen du backtest pour ce profil" },
    { label: "Récence (0-15 pts)", desc: "Décroissance exponentielle depuis la publication (demi-vie 21j)" },
    { label: "Conviction (0-10 pts)", desc: "Cluster d'insiders, % market cap, montant significatif" },
  ];
  return (
    <div className="card p-5 mb-8" style={{ borderTop: "3px solid var(--c-indigo)" }}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: "var(--c-indigo-bg)", border: "1px solid var(--c-indigo-bd)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="var(--c-indigo-2)" strokeWidth="2"/>
            <path d="M12 8v4l3 3" stroke="var(--c-indigo-2)" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <span className="text-sm font-bold" style={{ color: "var(--tx-1)" }}>Méthodologie du score (0–100)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {pts.map((p, i) => (
          <div key={i} className="rounded-xl p-3" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
            <div className="text-xs font-bold mb-1" style={{ color: "var(--c-indigo-2)" }}>{p.label}</div>
            <div className="text-[11px]" style={{ color: "var(--tx-3)" }}>{p.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function RecommendationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "personal" ? "personal" : "general";

  const user = await getCurrentUser();
  const isAuth = !!user;

  const [generalRecosRaw, personalData] = await Promise.all([
    getGeneralRecos(),
    user ? getPersonalRecos(user.id) : Promise.resolve(null),
  ]);

  const generalRecos = maskRecos(generalRecosRaw, isAuth);

  const hasPortfolio = personalData && personalData.portfolioSize > 0;

  return (
    <div className="content-wrapper">

      {/* ── Page header ── */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: "var(--c-mint-bg)", border: "1px solid var(--c-mint-bd)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--c-mint)" }} />
            <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--c-mint)" }}>
              Mis à jour quotidiennement
            </span>
          </div>
        </div>
        <h1 className="heading-hero mb-3">
          Recommandations<br />
          <span className="text-gradient-brand">actionnables</span>
        </h1>
        <p className="text-sm" style={{ color: "var(--tx-2)", maxWidth: "560px", lineHeight: 1.65 }}>
          Signaux d'achat classés par score composite (signal AMF × backtest historique × récence × conviction).
          {user && hasPortfolio && " Les ventes sur vos positions sont aussi mises en avant."}
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid var(--border-med)", paddingBottom: "0" }}>
        <Link
          href="/recommendations"
          className={`px-4 py-2.5 text-sm font-semibold transition-all rounded-t-lg -mb-px ${activeTab === "general" ? "border-b-2" : ""}`}
          style={{
            color: activeTab === "general" ? "var(--c-indigo-2)" : "var(--tx-3)",
            borderBottomColor: activeTab === "general" ? "var(--c-indigo-2)" : "transparent",
          }}>
          <span className="flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="currentColor" strokeWidth="2"/></svg>
            Top 10 général
          </span>
        </Link>
        {user ? (
          <Link
            href="/recommendations?tab=personal"
            className={`px-4 py-2.5 text-sm font-semibold transition-all rounded-t-lg -mb-px ${activeTab === "personal" ? "border-b-2" : ""}`}
            style={{
              color: activeTab === "personal" ? "var(--c-indigo-2)" : "var(--tx-3)",
              borderBottomColor: activeTab === "personal" ? "var(--c-indigo-2)" : "transparent",
            }}>
            <span className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Pour moi
            </span>
            {personalData && personalData.recos.length > 0 && (
              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: "var(--c-indigo-bg)", color: "var(--c-indigo-2)" }}>
                {personalData.recos.length}
              </span>
            )}
          </Link>
        ) : (
          <Link href="/auth/login?next=/recommendations?tab=personal"
            className="px-4 py-2.5 text-sm font-semibold transition-all rounded-t-lg"
            style={{ color: "var(--tx-4)" }}>
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              Pour moi
            </span>
          </Link>
        )}
      </div>

      {/* ── Methodology ── */}
      <MethodologyCard />

      {/* ── General tab ── */}
      {activeTab === "general" && (
        <>
          <SectionHeader
            title="Top signaux d'achat"
            sub="Toutes sociétés cotées françaises · Déclarations AMF des 90 derniers jours"
            count={generalRecos.length}
          />
          {generalRecos.length === 0 ? (
            <EmptyState mode="general" />
          ) : (
            <>
              {/* Free visible cards */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
                {generalRecos.slice(0, FREE_VISIBLE).map((item, i) => (
                  <RecoCard key={item.declarationId} item={item} rank={i + 1} />
                ))}
              </div>
              {/* Gated cards (only shown when not authenticated) */}
              {!isAuth && generalRecos.length > FREE_VISIBLE && (
                <FreemiumGate feature="les 7 autres recommandations avec noms des entreprises, scores et retours estimés">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {generalRecos.slice(FREE_VISIBLE).map((item, i) => (
                      <RecoCard key={item.declarationId} item={item} rank={FREE_VISIBLE + i + 1} />
                    ))}
                  </div>
                </FreemiumGate>
              )}
              {/* If auth, show remaining cards normally */}
              {isAuth && generalRecos.length > FREE_VISIBLE && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {generalRecos.slice(FREE_VISIBLE).map((item, i) => (
                    <RecoCard key={item.declarationId} item={item} rank={FREE_VISIBLE + i + 1} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Personal tab ── */}
      {activeTab === "personal" && (
        <>
          {!user && (
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

          {user && !hasPortfolio && (
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
                    alertes de vente sur vos holdings · signaux d'accumulation sur vos secteurs · email quotidien personnalisé.
                  </p>
                  <Link href="/portfolio" className="btn btn-primary mt-3 text-xs py-1.5 px-3">
                    Ajouter mon portfolio →
                  </Link>
                </div>
              </div>

              <SectionHeader
                title="Vos recommandations"
                sub="Vue générale · ajoutez un portfolio pour personnaliser"
                count={personalData?.recos.length ?? 0}
              />
              {(personalData?.recos ?? []).length === 0 ? (
                <EmptyState mode="personal" />
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {(personalData?.recos ?? []).map((item, i) => (
                    <RecoCard key={item.declarationId} item={item} rank={i + 1} />
                  ))}
                </div>
              )}
            </>
          )}

          {user && hasPortfolio && personalData && (
            <>
              {/* Alert preference toggle */}
              <div className="flex items-center justify-between mb-6 p-4 rounded-xl"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-med)" }}>
                <div>
                  <div className="text-sm font-semibold" style={{ color: "var(--tx-1)" }}>
                    Alertes email
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--tx-3)" }}>
                    Recevez un email dès qu'un nouveau signal fort apparaît · {personalData.portfolioSize} positions suivies
                  </div>
                </div>
                <AlertToggle alertEnabled={personalData.alertEnabled} />
              </div>

              {/* Sell signals first (if any) */}
              {personalData.recos.filter((r) => r.action === "SELL").length > 0 && (
                <>
                  <SectionHeader
                    title="Ventes sur vos positions"
                    sub="Des insiders vendent des sociétés que vous détenez en portefeuille"
                    count={personalData.recos.filter((r) => r.action === "SELL").length}
                  />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-8">
                    {personalData.recos.filter((r) => r.action === "SELL").map((item, i) => (
                      <RecoCard key={item.declarationId} item={item} rank={i + 1} />
                    ))}
                  </div>
                </>
              )}

              {/* Buy signals */}
              {personalData.recos.filter((r) => r.action === "BUY").length > 0 && (
                <>
                  <SectionHeader
                    title="Signaux d'achat pour vous"
                    sub="Basés sur votre profil de portfolio et les performances historiques similaires"
                    count={personalData.recos.filter((r) => r.action === "BUY").length}
                  />
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {personalData.recos.filter((r) => r.action === "BUY").map((item, i) => (
                      <RecoCard key={item.declarationId} item={item} rank={i + 1} />
                    ))}
                  </div>
                </>
              )}

              {personalData.recos.length === 0 && <EmptyState mode="personal" />}
            </>
          )}
        </>
      )}

      {/* ── Disclaimer ── */}
      <div className="mt-12 p-4 rounded-xl" style={{ background: "var(--bg-raised)", border: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--tx-4)" }}>
          <strong style={{ color: "var(--tx-3)" }}>Avertissement :</strong>{" "}
          Ces recommandations sont générées algorithmiquement à partir des déclarations AMF publiques et de l'analyse des performances historiques.
          Elles ne constituent pas des conseils en investissement. Les performances passées ne préjugent pas des performances futures.
          Investir comporte des risques de perte en capital.
        </p>
      </div>
    </div>
  );
}
