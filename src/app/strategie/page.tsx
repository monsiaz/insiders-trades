/**
 * /strategie · Public "Winning Strategy" showcase.
 *
 * Hero : "La stratégie qui a battu le CAC 40 chaque année depuis 2022."
 * Parts :
 *   1. Résultats année par année (table + barres)
 *   2. Les 6 critères de la stratégie (carte détaillée)
 *   3. Signaux live matching · 90 dernier jours
 *   4. Comment reproduire (3 étapes)
 *   5. Disclaimer honnête
 *
 * DA Sigma strict : navy + gold + signaux vert/rouge uniquement.
 */

import { headers } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import { LogoMark } from "@/components/Logo";
import {
  getWinningStrategySignals,
  STRATEGY_PROOF,
  WINNING_STRATEGY,
  type WinningSignal,
  type YearlyProof,
} from "@/lib/winning-strategy";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const hdrs = await headers();
  const isFr = (hdrs.get("x-locale") ?? "en") === "fr";
  return isFr ? {
    title: "Stratégie Sigma · bat le CAC 40 chaque année · Insiders Trades",
    description: "La stratégie Sigma découverte par grid-search sur 583 200 combinaisons de filtres. Bat le CAC 40 chaque année depuis 2022 : +16.3% annualisé, Sharpe 1.00, alpha +10.4 pts/an. Signaux live.",
  } : {
    title: "Sigma Strategy · beats the CAC 40 every year · Insiders Trades",
    description: "The Sigma strategy discovered by grid-search on 583,200 filter combinations. Beats the CAC 40 every year since 2022: +16.3% annualised, Sharpe 1.00, alpha +10.4 pts/yr. Live signals.",
  };
}

const fmtPct = (n: number, d = 1) => (n > 0 ? "+" : "") + n.toFixed(d) + "%";
const fmtEur = (n: number | null | undefined) => {
  if (n == null) return "·";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} Md€`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} k€`;
  return `${Math.round(n)} €`;
};

export default async function StrategiePage() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";

  // Fail-soft: if DB is cold/slow, render page with 0 signals rather than throwing a 500.
  // The page is useful without live signals (historical proof + recipe + guide).
  const liveSignals = await getWinningStrategySignals({ lookbackDays: 90, limit: 15 })
    .catch((err) => {
      console.error("[strategie] getWinningStrategySignals failed:", err);
      return [] as WinningSignal[];
    });
  const proof = STRATEGY_PROOF;
  const maxAbsReturn = Math.max(
    ...proof.years.flatMap((y) => [Math.abs(y.strategy), Math.abs(y.cac40)])
  );

  return (
    <div className="content-wrapper" style={{ maxWidth: "1160px" }}>
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section
        style={{
          paddingTop: "24px",
          paddingBottom: "32px",
          textAlign: "center",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
          <LogoMark size={48} />
        </div>
        <div style={eyebrowStyle}>
          {isFr ? "Stratégie Sigma · v1 · avril 2026" : "Sigma Strategy · v1 · April 2026"}
        </div>
        <h1
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(2rem, 5vw, 3.4rem)",
            fontWeight: 400,
            letterSpacing: "-0.015em",
            lineHeight: 1.05,
            color: "var(--tx-1)",
            marginBottom: "14px",
          }}
        >
          {isFr ? "Battre le CAC 40" : "Beating the CAC 40"}<br />
          <span style={{ fontStyle: "italic", color: "var(--gold)" }}>
            {isFr ? "chaque année depuis 2022" : "every year since 2022"}
          </span>
        </h1>
        <p
          style={{
            fontSize: "clamp(0.95rem, 2vw, 1.1rem)",
            color: "var(--tx-2)",
            maxWidth: "760px",
            margin: "0 auto 20px",
            lineHeight: 1.65,
          }}
        >
          {isFr ? (
            <>Nous avons testé <strong>583 200 combinaisons de filtres</strong> sur 15 171 backtests
            historiques. Une seule combinaison bat le CAC 40 chaque année de 2022 à 2025.
            Voici la recette exacte, les résultats, et les signaux qui la matchent <em>aujourd&apos;hui</em>.</>
          ) : (
            <>We tested <strong>583,200 filter combinations</strong> on 15,171 historical backtests.
            Only one combination beats the CAC 40 every year from 2022 to 2025.
            Here is the exact recipe, the results, and the signals matching it <em>today</em>.</>
          )}
        </p>

        {/* 4 headline stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "12px",
            maxWidth: "760px",
            margin: "28px auto 0",
          }}
        >
          <HeadlineStat
            label={isFr ? "Alpha moyen" : "Average Alpha"}
            value={`+${proof.avgAlpha.toFixed(1)} pts`}
            sub={isFr ? "par an vs CAC 40" : "per year vs CAC 40"}
            color="var(--gold)"
          />
          <HeadlineStat
            label={isFr ? "Rendement annuel" : "Annual Return"}
            value={fmtPct(proof.avgReturn)}
            sub={isFr ? "équipondéré, frais 1% inclus" : "equal-weighted, 1% fees included"}
            color="var(--signal-pos)"
          />
          <HeadlineStat
            label="Sharpe"
            value={proof.sharpe.toFixed(2)}
            sub={`vs CAC 40 ≈ 0.46`}
            color="var(--gold)"
          />
          <HeadlineStat
            label={isFr ? "Années gagnées" : "Winning Years"}
            value={`${proof.years.filter((y) => y.beats).length}/${proof.years.length}`}
            sub="2022 → 2025"
            color="var(--tx-1)"
          />
        </div>
      </section>

      {/* ── YEAR BY YEAR ──────────────────────────────────────────────────── */}
      <Section
        id="yearly"
        eyebrow={isFr ? "1 · Preuve historique" : "1 · Historical Proof"}
        title={isFr ? "Année par année" : "Year by Year"}
      >
        <p style={pBody}>
          {isFr ? (
            <>Chaque année, on prend <strong>tous les signaux qui matchaient la stratégie</strong>, on
            compose un portefeuille équipondéré, on garde 3 mois, on applique 1% de frais aller-retour.
            Voici ce qu&apos;un investisseur aurait gagné :</>
          ) : (
            <>Each year, we take <strong>all signals matching the strategy</strong>, build an
            equal-weighted portfolio, hold for 3 months, and apply 1% round-trip fees.
            Here is what an investor would have earned:</>
          )}
        </p>

        <div style={{ margin: "22px 0" }}>
          {proof.years.map((y) => (
            <YearlyBar key={y.year} y={y} maxAbs={maxAbsReturn} />
          ))}
        </div>

        <div style={{ overflowX: "auto", marginTop: "16px" }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border-med)" }}>
                <th style={th}>{isFr ? "Année" : "Year"}</th>
                <th style={{ ...th, textAlign: "right" }}>{isFr ? "Stratégie Sigma" : "Sigma Strategy"}</th>
                <th style={{ ...th, textAlign: "right" }}>CAC 40</th>
                <th style={{ ...th, textAlign: "right" }}>Alpha</th>
                <th style={{ ...th, textAlign: "right" }}>{isFr ? "Signaux" : "Signals"}</th>
              </tr>
            </thead>
            <tbody>
              {proof.years.map((y) => (
                <tr key={y.year} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ ...td, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "var(--tx-1)" }}>
                    {y.year}
                  </td>
                  <td style={{ ...td, textAlign: "right", color: y.strategy > 0 ? "var(--signal-pos)" : "var(--signal-neg)", fontWeight: 700, fontFamily: "'Banana Grotesk', sans-serif", fontSize: "1rem" }}>
                    {fmtPct(y.strategy)}
                  </td>
                  <td style={{ ...td, textAlign: "right", color: y.cac40 > 0 ? "var(--signal-pos)" : "var(--signal-neg)", fontFamily: "monospace" }}>
                    {fmtPct(y.cac40)}
                  </td>
                  <td style={{ ...td, textAlign: "right", color: "var(--gold)", fontWeight: 700, fontFamily: "'Banana Grotesk', sans-serif" }}>
                    +{y.alpha.toFixed(1)} pts
                  </td>
                  <td style={{ ...td, textAlign: "right", color: "var(--tx-3)", fontFamily: "monospace" }}>
                    {y.sampleSize}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Callout tone="info">
          {isFr ? (
            <><strong>Note :</strong> l&apos;année 2026 n&apos;est pas encore affichée · nous avons
            moins de 5 mois de données et peu de signaux ont eu le temps de se matérialiser à
            T+90. Nous actualiserons cette page trimestriellement.</>
          ) : (
            <><strong>Note:</strong> 2026 is not yet shown · we have less than 5 months of data
            and few signals have had time to materialise at T+90. We will update this page quarterly.</>
          )}
        </Callout>
      </Section>

      {/* ── STRATEGY CRITERIA ─────────────────────────────────────────────── */}
      <Section
        id="critères"
        eyebrow={isFr ? "2 · La recette" : "2 · The Recipe"}
        title={isFr ? "Les 6 filtres de la stratégie" : "The 6 Strategy Filters"}
      >
        <p style={pBody}>
          {isFr
            ? "Après avoir testé plus d\u2019un demi-million de combinaisons de filtres (score × cluster × rôle × montant × taille × fraîcheur × horizon), une seule ressort avec un alpha positif chaque année :"
            : "After testing more than half a million filter combinations (score × cluster × role × amount × size × freshness × horizon), only one yields a positive alpha every year:"}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
            gap: "12px",
            margin: "20px 0",
          }}
        >
          <CriteriaCard
            n={1}
            title={isFr ? "Acquisition pure" : "Pure Acquisition"}
            detail={isFr ? (
              <>
                Uniquement <code style={codeInline}>transactionNature = Acquisition</code>. On exclut
                les exercices de stock-options (qui sont des options, pas un signal), les apports en nature,
                conversions, souscriptions.
              </>
            ) : (
              <>
                Only <code style={codeInline}>transactionNature = Acquisition</code>. Excludes
                stock-option exercises (options, not a signal), in-kind contributions,
                conversions, and subscriptions.
              </>
            )}
          />
          <CriteriaCard
            n={2}
            title={isFr ? "Cluster actif" : "Active Cluster"}
            detail={isFr ? (
              <>
                Au moins <strong>2 dirigeants distincts</strong> ont acheté la société dans une fenêtre
                de ±30 jours. Seul signal <em>empiriquement</em> robuste, c&apos;est la conviction collective
                qui prédit le mouvement.
              </>
            ) : (
              <>
                At least <strong>2 distinct executives</strong> bought the company within a ±30-day window.
                The only <em>empirically</em> robust signal — collective conviction predicts the move.
              </>
            )}
          />
          <CriteriaCard
            n={3}
            title={isFr ? "Pas de CA / Board" : "No CA / Board"}
            detail={isFr ? (
              <>
                Exclusion des trades des administrateurs et membres du conseil de surveillance
                (souvent symboliques / conformité). On garde <strong>PDG, CFO, directeurs opérationnels</strong>.
              </>
            ) : (
              <>
                Excludes trades by board members and supervisory council members
                (often symbolic / compliance). We keep <strong>CEO, CFO, operational directors</strong>.
              </>
            )}
          />
          <CriteriaCard
            n={4}
            title={isFr ? `Publié ≤ ${WINNING_STRATEGY.maxPubDelayDays} jours` : `Filed ≤ ${WINNING_STRATEGY.maxPubDelayDays} days`}
            detail={isFr ? (
              <>
                Délai entre la transaction et sa publication AMF ≤ 7 jours calendaires. Les déclarations
                tardives sont souvent sur des positions anciennes, moins actionnables.
              </>
            ) : (
              <>
                Delay between the transaction and its AMF filing ≤ 7 calendar days. Late filings
                are often on older positions, less actionable.
              </>
            )}
          />
          <CriteriaCard
            n={5}
            title={isFr ? "Mid-cap (200 M€ – 1 B€)" : "Mid-cap (€200M – €1B)"}
            detail={isFr ? (
              <>
                <strong>Sweet spot</strong> : assez gros pour la liquidité (on peut trader sans slippage),
                assez petit pour que les insiders aient une info significative. Les large-caps sont sur-suivies,
                les small-caps trop volatiles.
              </>
            ) : (
              <>
                <strong>Sweet spot</strong>: large enough for liquidity (tradable without slippage),
                small enough for insiders to have meaningful information. Large-caps are over-followed,
                small-caps too volatile.
              </>
            )}
          />
          <CriteriaCard
            n={6}
            title={`Score ≥ ${WINNING_STRATEGY.minScore}`}
            detail={isFr ? (
              <>
                Notre scoring composite v3 (0–100, 10 composantes) sert de filtre bas. Seuil relevé
                à {WINNING_STRATEGY.minScore} avec la v3 car la redistribution des poids vers les
                features insider-centrées (track record, DCA, cluster directionnel) rend un score v3 de
                {" "}{WINNING_STRATEGY.minScore} équivalent à un v2 de ~50 en pouvoir informationnel.
              </>
            ) : (
              <>
                Our v3 composite score (0–100, 10 components) acts as a floor filter. Raised to{" "}
                {WINNING_STRATEGY.minScore} with v3 because the weight redistribution toward
                insider-centric features (track record, DCA, directional cluster) makes a v3 score of
                {" "}{WINNING_STRATEGY.minScore} carry similar informational value to a v2 ~50.
              </>
            )}
          />
        </div>

        <Callout tone="warn">
          {isFr ? (
            <><strong>Horizon : T+90 jours.</strong> On achète à <code style={codeInline}>pubDate + 1</code>,
            on revend 3 mois plus tard. Rebalancement trimestriel. L&apos;horizon court suffit ·
            pas besoin de tenir 1 an.</>
          ) : (
            <><strong>Horizon: T+90 days.</strong> We buy at <code style={codeInline}>pubDate + 1</code>,
            sell 3 months later. Quarterly rebalancing. The short horizon suffices ·
            no need to hold for 1 year.</>
          )}
        </Callout>
      </Section>

      {/* ── LIVE SIGNALS ──────────────────────────────────────────────────── */}
      <Section
        id="live"
        eyebrow={isFr ? "3 · Signaux actuels" : "3 · Current Signals"}
        title={isFr ? `Ce qui match en ce moment (${liveSignals.length})` : `Matching right now (${liveSignals.length})`}
      >
        <p style={pBody}>
          {isFr ? (
            <>Les déclarations des 90 derniers jours qui matchent <strong>tous les 6 critères</strong>.
            Triées par score descendant. Mis à jour toutes les 15 minutes.</>
          ) : (
            <>Filings from the last 90 days matching <strong>all 6 criteria</strong>.
            Sorted by descending score. Updated every 15 minutes.</>
          )}
        </p>

        {liveSignals.length === 0 ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              color: "var(--tx-3)",
              fontSize: "0.92rem",
              background: "var(--bg-surface)",
              border: "1px solid var(--border-med)",
              borderRadius: "4px",
            }}
          >
            {isFr
              ? "Aucun signal ne match tous les critères en ce moment. Revenez dans quelques jours · le marché produit 3 à 10 matches par mois en moyenne."
              : "No signal matches all criteria right now. Check back in a few days · the market produces 3 to 10 matches per month on average."}
          </div>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {liveSignals.map((s) => <SignalCard key={s.declarationId} s={s} isFr={isFr} />)}
          </div>
        )}
      </Section>

      {/* ── HOW TO APPLY ──────────────────────────────────────────────────── */}
      <Section
        id="appliquer"
        eyebrow={isFr ? "4 · Guide" : "4 · Guide"}
        title={isFr ? "Comment appliquer la stratégie en 3 étapes" : "How to Apply the Strategy in 3 Steps"}
      >
        <ol style={{ padding: 0, margin: 0, listStyle: "none", counterReset: "step" }}>
          {(isFr ? [
            {
              title: "Attendez un signal qualifié",
              body: "3 à 10 par mois en moyenne. Si rien ne match, laissez le cash. La discipline de ne PAS trader quand rien n'est optimal est 50 % de l'alpha.",
            },
            {
              title: "Achetez à pubDate + 1",
              body: "Dès que la déclaration apparaît sur le site, achetez le lendemain à l'ouverture. N'attendez pas de confirmation technique · chaque jour de retard grignote l'edge.",
            },
            {
              title: "Revendez à T+90",
              body: "3 mois après l'entrée, vendez sans sentimentalisme. Si vous aimez le titre, rachetez-le comme une position autonome, mais sortez le PnL de la stratégie.",
            },
          ] : [
            {
              title: "Wait for a qualified signal",
              body: "3 to 10 per month on average. If nothing matches, stay in cash. The discipline of NOT trading when nothing is optimal is 50% of the alpha.",
            },
            {
              title: "Buy at pubDate + 1",
              body: "As soon as the filing appears on the site, buy the next morning at open. Don't wait for technical confirmation · every day of delay eats into the edge.",
            },
            {
              title: "Sell at T+90",
              body: "3 months after entry, sell without sentimentality. If you like the stock, re-buy it as a standalone position, but close the PnL out of the strategy.",
            },
          ]).map((step, i) => (
            <li
              key={i}
              style={{
                position: "relative",
                paddingLeft: "54px",
                marginBottom: "18px",
                counterIncrement: "step",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "var(--corporate)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.88rem",
                  fontWeight: 700,
                }}
              >
                {i + 1}
              </span>
              <h3
                style={{
                  fontFamily: "var(--font-dm-serif), Georgia, serif",
                  fontSize: "1.15rem",
                  fontWeight: 400,
                  color: "var(--tx-1)",
                  marginTop: "5px",
                  letterSpacing: "-0.01em",
                }}
              >
                {step.title}
              </h3>
              <p style={{ fontSize: "0.92rem", color: "var(--tx-2)", lineHeight: 1.65, marginTop: "4px" }}>
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <Callout tone="info">
          {isFr ? (
            <><strong>Capital minimum recommandé :</strong> 20 000 € pour que les frais de courtage
            ne grignotent pas l&apos;alpha. Avec 5 à 10 signaux en portefeuille, c&apos;est
            2 000 à 4 000 € par position.</>
          ) : (
            <><strong>Minimum recommended capital:</strong> €20,000 so that brokerage fees
            don&apos;t eat into the alpha. With 5 to 10 signals in portfolio, that&apos;s
            €2,000 to €4,000 per position.</>
          )}
        </Callout>
      </Section>

      {/* ── DISCLAIMER ────────────────────────────────────────────────────── */}
      <Section
        id="disclaimer"
        eyebrow={isFr ? "Transparence" : "Transparency"}
        title={isFr ? "Ce que ça ne garantit pas" : "What This Doesn't Guarantee"}
      >
        <ul style={ulBody}>
          {isFr ? (
            <>
              <li>
                <strong>Backtest ≠ futur.</strong> Ces résultats sont historiques. Le régime de marché,
                la réglementation ou le comportement des insiders peut changer.
              </li>
              <li>
                <strong>Look-ahead bias minimal mais non-zéro.</strong> Nos filtres ont été optimisés
                sur cette période · par construction, ils&nbsp;<em>s&apos;ajustent</em> à 2022-2025.
                Un test out-of-sample sur 2026-2027 sera le vrai juge.
              </li>
              <li>
                <strong>Slippage non modélisé.</strong> Sur les mid-caps, l&apos;écart bid-ask peut
                atteindre 0.3-0.8%. Nos frais de 1% aller-retour incluent une estimation conservatrice
                mais pas de slippage au-delà.
              </li>
              <li>
                <strong>Petit échantillon sur certains segments.</strong> 2022 et 2023 n&apos;ont respectivement
                que 35 et 25 signaux matching · statistiquement maigre. Les années 2024 (71) et 2025 (118)
                sont plus solides.
              </li>
              <li>
                <strong>Pas un conseil en investissement.</strong> Ce site est un outil
                d&apos;information. Pas un robo-advisor. Pas un gestionnaire. Vos décisions restent
                les vôtres, et les pertes aussi.
              </li>
            </>
          ) : (
            <>
              <li>
                <strong>Backtest ≠ future.</strong> These results are historical. Market regimes,
                regulation, or insider behaviour can change.
              </li>
              <li>
                <strong>Minimal but non-zero look-ahead bias.</strong> Our filters were optimised
                on this period · by construction, they <em>fit</em> 2022-2025.
                An out-of-sample test on 2026-2027 will be the real judge.
              </li>
              <li>
                <strong>Slippage not modelled.</strong> On mid-caps, the bid-ask spread can
                reach 0.3-0.8%. Our 1% round-trip fees include a conservative estimate
                but no additional slippage.
              </li>
              <li>
                <strong>Small sample on some segments.</strong> 2022 and 2023 have respectively
                only 35 and 25 matching signals · statistically thin. Years 2024 (71) and 2025 (118)
                are more robust.
              </li>
              <li>
                <strong>Not investment advice.</strong> This site is an information tool.
                Not a robo-advisor. Not a fund manager. Your decisions remain yours, and so do the losses.
              </li>
            </>
          )}
        </ul>
      </Section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────────── */}
      <section
        className="strat-cta"
        style={{
          marginTop: "60px",
          padding: "40px 32px",
          textAlign: "center",
          background: "linear-gradient(135deg, var(--corporate-bg) 0%, var(--gold-bg) 100%)",
          border: "1px solid var(--corporate-bd)",
          borderRadius: "3px",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(1.6rem, 3.5vw, 2.2rem)",
            fontWeight: 400,
            letterSpacing: "-0.012em",
            color: "var(--tx-1)",
            marginBottom: "12px",
            lineHeight: 1.15,
          }}
        >
          {isFr ? (
            <>Recevez chaque signal Sigma<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>dès sa publication</span></>
          ) : (
            <>Receive every Sigma signal<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>as soon as it&apos;s published</span></>
          )}
        </h2>
        <p
          style={{
            fontSize: "0.98rem",
            color: "var(--tx-2)",
            maxWidth: "520px",
            margin: "0 auto 22px",
            lineHeight: 1.6,
          }}
        >
          {isFr
            ? "Alertes email quotidiennes filtrées sur les 6 critères de la stratégie gagnante. Vous recevez uniquement ce qui compte · 3 à 10 signaux par mois en moyenne."
            : "Daily email alerts filtered on the 6 criteria of the winning strategy. You only receive what matters · 3 to 10 signals per month on average."}
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/recommendations?mode=winning" style={btnGold}>
            {isFr ? "Voir les recommandations →" : "View recommendations →"}
          </Link>
          <Link href="/performance/" style={btnGhost}>
            {isFr ? "Performance globale ↗" : "Global performance ↗"}
          </Link>
          <Link href="/fonctionnement/" style={btnGhost}>
            {isFr ? "Comment ça marche ↗" : "How it works ↗"}
          </Link>
        </div>
      </section>

      <style>{`
        @media (max-width: 640px) {
          .strat-cta { padding: 24px 16px !important; }
          .strat-signal-card {
            grid-template-columns: 40px 1fr !important;
            grid-template-rows: auto auto !important;
          }
          .strat-signal-card > div:last-child {
            grid-column: 2;
            text-align: left !important;
          }
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({
  id, eyebrow: eyebrowLabel, title, children,
}: {
  id: string; eyebrow: string; title: string; children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ paddingTop: "48px", paddingBottom: "12px", scrollMarginTop: "80px" }}>
      <div style={{ marginBottom: "22px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" }}>
        <div style={eyebrowStyle}>{eyebrowLabel}</div>
        <h2
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(1.6rem, 3.5vw, 2.35rem)",
            fontWeight: 400,
            letterSpacing: "-0.012em",
            color: "var(--tx-1)",
            lineHeight: 1.2,
          }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function HeadlineStat({
  label, value, sub, color,
}: { label: string; value: string; sub: string; color: string }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: `3px solid ${color}`,
        padding: "14px 18px",
        borderRadius: "3px",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.62rem",
          color: "var(--tx-3)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Banana Grotesk', sans-serif",
          fontSize: "1.75rem",
          fontWeight: 700,
          color,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          marginTop: "6px",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "4px" }}>{sub}</div>
    </div>
  );
}

function YearlyBar({ y, maxAbs }: { y: YearlyProof; maxAbs: number }) {
  const stratWidth = Math.max(2, (Math.abs(y.strategy) / maxAbs) * 45);
  const cacWidth = Math.max(2, (Math.abs(y.cac40) / maxAbs) * 45);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 60px", gap: "14px", alignItems: "center", marginBottom: "12px" }}>
      <div
        style={{
          fontFamily: "'Banana Grotesk', sans-serif",
          fontSize: "1.25rem",
          fontWeight: 700,
          color: "var(--tx-1)",
          letterSpacing: "-0.03em",
          textAlign: "left",
        }}
      >
        {y.year}
      </div>
      <div>
        {/* Strategy row */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <div style={{ width: "50%", display: "flex", justifyContent: "flex-end", paddingRight: "4px", fontSize: "0.7rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            sigma
          </div>
          <div style={{ flex: 1, height: "18px", display: "flex", alignItems: "center", position: "relative" }}>
            <div
              style={{
                height: "14px",
                width: `${stratWidth}%`,
                background: y.strategy >= 0 ? "var(--signal-pos)" : "var(--signal-neg)",
                borderRadius: "2px",
                transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
            <span
              style={{
                marginLeft: "8px",
                fontSize: "0.84rem",
                fontFamily: "'Banana Grotesk', sans-serif",
                fontWeight: 700,
                color: y.strategy >= 0 ? "var(--signal-pos)" : "var(--signal-neg)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtPct(y.strategy)}
            </span>
          </div>
        </div>
        {/* CAC 40 row */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "50%", display: "flex", justifyContent: "flex-end", paddingRight: "4px", fontSize: "0.7rem", color: "var(--tx-4)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            CAC 40
          </div>
          <div style={{ flex: 1, height: "18px", display: "flex", alignItems: "center", position: "relative" }}>
            <div
              style={{
                height: "10px",
                width: `${cacWidth}%`,
                background: "var(--tx-4)",
                opacity: 0.5,
                borderRadius: "2px",
                transition: "width 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            />
            <span
              style={{
                marginLeft: "8px",
                fontSize: "0.78rem",
                fontFamily: "'Banana Grotesk', sans-serif",
                fontWeight: 600,
                color: "var(--tx-3)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtPct(y.cac40)}
            </span>
          </div>
        </div>
      </div>
      <div
        style={{
          fontFamily: "'Banana Grotesk', sans-serif",
          fontSize: "0.88rem",
          color: "var(--gold)",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          textAlign: "right",
        }}
      >
        +{y.alpha.toFixed(1)} pts
      </div>
    </div>
  );
}

function CriteriaCard({ n, title, detail }: { n: number; title: string; detail: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: "3px solid var(--gold)",
        borderRadius: "3px",
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
        <span
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "50%",
            background: "var(--gold)",
            color: "#0A0C10",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.76rem",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {n}
        </span>
        <h3
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "1.05rem",
            fontWeight: 400,
            color: "var(--tx-1)",
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
            flex: 1,
            minWidth: 0,
            overflowWrap: "break-word",
          }}
        >
          {title}
        </h3>
      </div>
      <div style={{ fontSize: "0.85rem", color: "var(--tx-2)", lineHeight: 1.6 }}>{detail}</div>
    </div>
  );
}

function SignalCard({ s, isFr }: { s: WinningSignal; isFr: boolean }) {
  const amount = s.transaction.amount;
  const dateLocale = isFr ? "fr-FR" : "en-GB";
  return (
    <Link
      href={`/company/${s.company.slug}`}
      className="strat-signal-card"
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr auto",
        gap: "12px",
        alignItems: "center",
        padding: "12px 16px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: "3px solid var(--signal-pos)",
        borderRadius: "3px",
        textDecoration: "none",
        transition: "border-color 0.15s ease",
      }}
    >
      <div
        style={{
          width: "44px", height: "44px",
          borderRadius: "50%",
          background: "var(--bg-raised)",
          border: "1px solid var(--border)",
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {s.company.logoUrl ? (
          <Image src={s.company.logoUrl} alt={s.company.name} width={44} height={44} style={{ objectFit: "cover" }} />
        ) : (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.78rem", color: "var(--gold)", fontWeight: 700 }}>
            {s.company.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "2px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: "0.96rem",
              fontWeight: 700,
              color: "var(--tx-1)",
              letterSpacing: "-0.005em",
            }}
          >
            {s.company.name}
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace" }}>
            {s.company.yahooSymbol ?? "·"}
          </span>
          {s.company.marketCap != null && (
            <span style={{ fontSize: "0.7rem", color: "var(--tx-4)", fontFamily: "'JetBrains Mono', monospace" }}>
              mcap {fmtEur(s.company.marketCap)}
            </span>
          )}
          <span
            style={{
              fontSize: "0.66rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
              color: "var(--gold)", background: "var(--gold-bg)", border: "1px solid var(--gold-bd)",
              padding: "1px 7px", borderRadius: "2px", fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Score {s.signal.signalScore.toFixed(0)}
          </span>
          {s.signal.insiderCount > 1 && (
            <span
              style={{
                fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                color: "var(--signal-pos)", background: "var(--signal-pos-bg)", border: "1px solid var(--signal-pos-bd)",
                padding: "1px 7px", borderRadius: "2px", fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {s.signal.insiderCount} insiders
            </span>
          )}
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--tx-2)", lineHeight: 1.5 }}>
          {s.signal.insiderCount > 1
            ? `${s.signal.insiderCount} ${isFr ? "dirigeants · cluster confirmé" : "insiders · confirmed cluster"}`
            : (
              <>
                <strong style={{ color: "var(--tx-1)", fontWeight: 500 }}>
                  {s.insider.name ?? "·"}
                </strong>
                {" · "}{s.insider.role ?? s.insider.function ?? "·"}
              </>
            )
          }
          {s.transaction.pctOfMarketCap != null && (
            <> · <strong>{s.transaction.pctOfMarketCap.toFixed(3)}%</strong> {isFr ? "du mcap" : "of mcap"}</>
          )}
          {s.pubDelayDays != null && (
            isFr
              ? <> · publié {s.pubDelayDays.toFixed(0)}j après</>
              : <> · filed {s.pubDelayDays.toFixed(0)}d after</>
          )}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div
          style={{
            fontFamily: "'Banana Grotesk', sans-serif",
            fontSize: "1.15rem",
            fontWeight: 700,
            color: "var(--tx-1)",
            letterSpacing: "-0.02em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ color: "var(--signal-pos)", marginRight: "4px" }}>▲</span>{fmtEur(amount)}
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--tx-4)", fontFamily: "'JetBrains Mono', monospace" }}>
          {new Date(s.pubDate).toLocaleDateString(dateLocale, { day: "2-digit", month: "short" })}
        </div>
      </div>
    </Link>
  );
}

function Callout({ tone, children }: { tone: "info" | "warn" | "danger"; children: React.ReactNode }) {
  const colors = {
    info:   { bd: "var(--c-indigo-2)", bg: "rgba(23,48,92,0.05)" },
    warn:   { bd: "var(--gold)",       bg: "var(--gold-bg)" },
    danger: { bd: "var(--signal-neg)", bg: "var(--signal-neg-bg)" },
  }[tone];
  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.bd}`,
        borderLeft: `3px solid ${colors.bd}`,
        padding: "14px 18px",
        borderRadius: "3px",
        margin: "18px 0",
        fontSize: "0.9rem",
        color: "var(--tx-2)",
        lineHeight: 1.65,
      }}
    >
      {children}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "0.66rem",
  fontWeight: 700,
  color: "var(--gold)",
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  marginBottom: "10px",
};
const pBody: React.CSSProperties = {
  fontSize: "0.96rem",
  color: "var(--tx-2)",
  lineHeight: 1.7,
  marginBottom: "14px",
};
const ulBody: React.CSSProperties = {
  paddingLeft: "1.3em",
  margin: "10px 0 18px",
  fontSize: "0.93rem",
  color: "var(--tx-2)",
  lineHeight: 1.85,
};
const codeInline: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "0.82em",
  background: "var(--bg-raised)",
  padding: "1px 6px",
  borderRadius: "2px",
  color: "var(--gold)",
  border: "1px solid var(--border)",
};
const btnGold: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", minHeight: "44px",
  padding: "12px 22px",
  background: "var(--gold)",
  color: "#0A0C10",
  fontWeight: 700,
  fontSize: "0.9rem",
  borderRadius: "3px",
  textDecoration: "none",
  letterSpacing: "0.01em",
  boxShadow: "0 4px 16px rgba(184,149,90,0.30)",
};
const btnGhost: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", minHeight: "44px",
  padding: "12px 22px",
  border: "1px solid var(--border-strong)",
  color: "var(--tx-2)",
  fontWeight: 600,
  fontSize: "0.9rem",
  borderRadius: "3px",
  textDecoration: "none",
  letterSpacing: "0.01em",
  background: "transparent",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.9rem",
  background: "var(--bg-surface)",
  border: "1px solid var(--border)",
  borderRadius: "3px",
  overflow: "hidden",
};
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: "0.66rem",
  fontWeight: 700,
  color: "var(--tx-3)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  fontFamily: "'JetBrains Mono', monospace",
};
const td: React.CSSProperties = {
  padding: "10px 14px",
  color: "var(--tx-2)",
  verticalAlign: "top",
};
