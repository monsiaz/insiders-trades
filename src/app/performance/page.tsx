/**
 * /performance · Public transparency page.
 *
 * Honest disclosure of what our signals actually deliver, with a clear guide
 * for small retail investors on how to apply the signals given their
 * constraints (< 20 positions, 10k-100k € capital, ~1% roundtrip fees).
 *
 * DA Sigma: editorial tear-sheet, gold accents, DM Serif headings.
 * Revalidates every hour (ISR) to keep numbers fresh.
 */

import { headers } from "next/headers";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { computePerformanceData, type StrategyResult } from "@/lib/performance-data";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const hdrs = await headers();
  const isFr = (hdrs.get("x-locale") ?? "en") === "fr";
  return isFr ? {
    title: "Performance & transparence · Insiders Trades Sigma",
    description: "Transparence complète sur la performance réelle de notre système. Backtest 4 ans sur 21 000 trades, comparaison vs CAC 40, stratégie recommandée pour petit investisseur.",
  } : {
    title: "Performance & Transparency · Insiders Trades Sigma",
    description: "Full transparency on the real performance of our system. 4-year backtest on 21,000 trades, comparison vs CAC 40, recommended strategy for the retail investor.",
  };
}

const fmt = {
  pct: (n: number | null | undefined, decimals = 2): string => {
    if (n == null) return "·";
    const s = n.toFixed(decimals);
    return (n > 0 ? "+" : "") + s + "%";
  },
  num: (n: number | null | undefined, locale = "fr-FR"): string => n?.toLocaleString(locale) ?? "·",
  sharpe: (n: number | null | undefined): string => n?.toFixed(2) ?? "·",
  days: (n: number | null | undefined, d = 1, suffix = " j"): string => n != null ? n.toFixed(d) + suffix : "·",
};

export default async function PerformancePage() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";
  const numLocale = isFr ? "fr-FR" : "en-US";
  const daysSuffix = isFr ? " j" : "d";
  const dateLocale = isFr ? "fr-FR" : "en-GB";

  const d = await computePerformanceData();
  const startYear = d.universe.periodStart.slice(0, 4);
  const endYear = d.universe.periodEnd.slice(0, 4);

  const reco = d.strategies[d.strategies.length - 1]; // the "★ Stratégie Sigma"

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
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "18px" }}>
          <LogoMark size={48} />
        </div>
        <Eyebrow>{isFr ? "Performance & transparence" : "Performance & transparency"}</Eyebrow>
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
          {isFr ? "Ce que nos signaux" : "What our signals"}<br />
          <span style={{ fontStyle: "italic", color: "var(--gold)" }}>
            {isFr ? "valent vraiment" : "are really worth"}
          </span>
        </h1>
        <p
          style={{
            fontSize: "clamp(0.95rem, 2vw, 1.1rem)",
            color: "var(--tx-2)",
            maxWidth: "720px",
            margin: "0 auto 18px",
            lineHeight: 1.65,
          }}
        >
          {isFr ? (
            <>Backtest indépendant sur <strong>{fmt.num(d.universe.retailEnrichedBacktests, numLocale)}</strong> trades
            de dirigeants entre {startYear} et {endYear}, frais de courtage inclus,
            du point de vue d&apos;un investisseur retail qui voit le signal <em>après</em> sa publication AMF.</>
          ) : (
            <>Independent backtest on <strong>{fmt.num(d.universe.retailEnrichedBacktests, numLocale)}</strong> executive trades
            between {startYear} and {endYear}, brokerage fees included,
            from the perspective of a retail investor who sees the signal <em>after</em> its AMF filing.</>
          )}
        </p>
        <p style={{ fontSize: "0.82rem", color: "var(--tx-3)", marginTop: "10px" }}>
          {isFr ? "Dernière mise à jour : " : "Last updated: "}
          {new Date(d.generatedAt).toLocaleDateString(dateLocale, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          {" · "}
          {isFr ? "Période étudiée : " : "Period covered: "}
          {fmt.num(d.cacBenchmark.monthsCovered, numLocale)} {isFr ? "mois" : "months"}
        </p>
      </section>

      {/* ── KEY TAKEAWAYS ──────────────────────────────────────────────── */}
      <Section id="tldr" eyebrow={isFr ? "Résumé exécutif" : "Executive Summary"} title={isFr ? "À retenir en 30 secondes" : "30-Second Takeaways"}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "12px",
            marginBottom: "24px",
          }}
        >
          <TakeawayCard
            label={isFr ? "Délai moyen publication" : "Avg. filing delay"}
            value={fmt.days(d.freshness.median, 1, daysSuffix)}
            sub={isFr
              ? `${d.freshness.withinMarPct.toFixed(0)}% des déclarations dans les 3j (MAR)`
              : `${d.freshness.withinMarPct.toFixed(0)}% of filings within 3d (MAR)`}
            color="var(--gold)"
          />
          <TakeawayCard
            label={isFr ? "Fuite d'info avant publication" : "Pre-publication info leak"}
            value={`${d.leak.leakRatioPct.toFixed(0)}%`}
            sub={isFr
              ? "du retour T+90 se fait AVANT que vous voyiez le signal"
              : "of the T+90 return happens BEFORE you see the signal"}
            color={Math.abs(d.leak.leakRatioPct) < 15 ? "var(--gold)" : "var(--signal-neg)"}
          />
          <TakeawayCard
            label={isFr ? "CAGR stratégie recommandée" : "Recommended strategy CAGR"}
            value={fmt.pct(reco?.cagr, 1)}
            sub={`vs CAC 40 +${d.cacBenchmark.cagrPct.toFixed(1)}% · ${reco?.sharpe != null ? `Sharpe ${reco.sharpe.toFixed(2)}` : "·"}`}
            color={(reco?.cagr ?? 0) > 0 ? "var(--signal-pos)" : "var(--signal-neg)"}
          />
        </div>

        <Callout tone="info">
          {isFr ? (
            <><strong>À quoi sert Sigma, concrètement.</strong> Le système n&apos;est pas conçu pour
            remplacer un ETF indiciel, c&apos;est un <strong>outil de pré-filtrage</strong> qui transforme
            585 sociétés en 10 à 15 dossiers par semaine méritant une vraie lecture. Sur la période
            2021-2026 (CAC à ses plus hauts historiques), notre meilleure stratégie filtrée dégage
            {" "}<strong>{fmt.pct(reco?.cagr, 1)} CAGR net de frais</strong> avec un Max DD de{" "}
            <strong>{reco?.maxDDPct?.toFixed(0) ?? "·"}%</strong>, face à un indice à{" "}
            +{d.cacBenchmark.cagrPct.toFixed(1)}%. L&apos;alpha absolu n&apos;est pas au rendez-vous sur
            ce cycle particulièrement haussier ; en revanche le signal garde son utilité première :
            identifier les sociétés où les dirigeants eux-mêmes prennent position, pour orienter
            votre recherche fondamentale.</>
          ) : (
            <><strong>What Sigma is for, concretely.</strong> The system is not designed to
            replace an index ETF — it&apos;s a <strong>pre-screening tool</strong> that turns
            585 companies into 10 to 15 files per week worth a real look. Over the period
            2021-2026 (CAC at all-time highs), our best filtered strategy delivers{" "}
            <strong>{fmt.pct(reco?.cagr, 1)} CAGR net of fees</strong> with a Max DD of{" "}
            <strong>{reco?.maxDDPct?.toFixed(0) ?? "·"}%</strong>, against an index at{" "}
            +{d.cacBenchmark.cagrPct.toFixed(1)}%. Absolute alpha isn&apos;t there on this
            particularly bullish cycle; the signal&apos;s primary value remains: identifying companies
            where executives themselves are taking positions, to guide your fundamental research.</>
          )}
        </Callout>
      </Section>

      {/* ── FRESHNESS ─────────────────────────────────────────────────── */}
      <Section
        id="freshness"
        eyebrow={isFr ? "Partie 1 · fraîcheur" : "Part 1 · freshness"}
        title={isFr ? "Combien de temps entre le trade et sa publication ?" : "How long between the trade and its filing?"}
      >
        <p style={pBody}>
          {isFr ? (
            <>La réglementation européenne <strong>MAR 596/2014</strong> oblige les dirigeants à déclarer
            leurs transactions à l&apos;AMF dans un délai de 3 jours ouvrés. Mais respectent-ils cette
            règle ? Sur notre échantillon de <strong>{fmt.num(d.freshness.sampleSize, numLocale)}</strong> déclarations :</>
          ) : (
            <>European regulation <strong>MAR 596/2014</strong> requires executives to file their
            transactions with the AMF within 3 business days. But do they comply?
            On our sample of <strong>{fmt.num(d.freshness.sampleSize, numLocale)}</strong> filings:</>
          )}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "12px",
            margin: "18px 0",
          }}
        >
          <MetricCell label={isFr ? "Médiane" : "Median"} value={fmt.days(d.freshness.median, 1, daysSuffix)} />
          <MetricCell label="p25" value={fmt.days(d.freshness.p25, 1, daysSuffix)} />
          <MetricCell label="p75" value={fmt.days(d.freshness.p75, 1, daysSuffix)} />
          <MetricCell label="p90" value={fmt.days(d.freshness.p90, 1, daysSuffix)} />
          <MetricCell label={isFr ? "≤ 3j (MAR)" : "≤ 3d (MAR)"} value={`${d.freshness.withinMarPct.toFixed(0)}%`} />
        </div>

        <p style={pBody}>
          {isFr ? (
            <><strong>Conclusion :</strong> la majorité ({d.freshness.withinMarPct.toFixed(0)}%) sont
            dans les clous MAR. La médiane est à {d.freshness.median.toFixed(1)} jours, ce qui veut dire que
            quand vous voyez un signal sur le site, la transaction a déjà eu lieu il y a <strong>
            {d.freshness.median.toFixed(1)} jours en moyenne</strong>. Le marché a eu le temps de pricer
            l&apos;information.</>
          ) : (
            <><strong>Conclusion:</strong> the majority ({d.freshness.withinMarPct.toFixed(0)}%) comply with MAR.
            The median is {d.freshness.median.toFixed(1)} days, meaning that when you see a signal
            on the site, the transaction already occurred <strong>
            {d.freshness.median.toFixed(1)} days ago on average</strong>. The market has had time to price
            the information.</>
          )}
        </p>
      </Section>

      {/* ── LEAK ──────────────────────────────────────────────────────── */}
      <Section
        id="leak"
        eyebrow={isFr ? "Partie 2 · information leak" : "Part 2 · information leak"}
        title={isFr ? "Le marché a-t-il déjà bougé avant la publication ?" : "Has the market already moved before the filing?"}
      >
        <p style={pBody}>
          {isFr ? (
            <>Question clé pour un investisseur retail : <em>combien du retour total de l&apos;action
            se fait entre le trade insider et la publication AMF</em> (leak) vs. après (exploitable
            par vous) ? Nous avons mesuré le prix Yahoo à la transactionDate, à pubDate+1, et à tx+90j
            pour <strong>{fmt.num(d.leak.sampleSize, numLocale)}</strong> trades.</>
          ) : (
            <>Key question for a retail investor: <em>how much of the stock&apos;s total return
            happens between the insider trade and the AMF filing</em> (leak) vs. after (exploitable
            by you)? We measured the Yahoo price at transactionDate, at pubDate+1, and at tx+90d
            for <strong>{fmt.num(d.leak.sampleSize, numLocale)}</strong> trades.</>
          )}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
            margin: "18px 0",
          }}
        >
          <Breakdown
            label={isFr ? "Retour total T+90 (vue insider)" : "Total T+90 return (insider view)"}
            value={fmt.pct(d.leak.totalReturn90dPct, 2)}
            sub={isFr
              ? "Ce que l'insider aurait capturé s'il avait acheté et revendu pile le jour."
              : "What the insider would have captured buying and selling on the exact day."}
            color={d.leak.totalReturn90dPct > 0 ? "var(--signal-pos)" : "var(--signal-neg)"}
          />
          <Breakdown
            label={isFr ? "Leak tx → pubDate" : "Leak tx → pubDate"}
            value={fmt.pct(d.leak.leakReturnPct, 2)}
            sub={isFr
              ? `Le marché bouge déjà sans vous. Sur notre échantillon : ${d.leak.leakRatioPct.toFixed(0)}% du retour total.`
              : `The market moves without you. On our sample: ${d.leak.leakRatioPct.toFixed(0)}% of total return.`}
            color="var(--gold)"
          />
          <Breakdown
            label={isFr ? "Retail T+90 (vue de vous)" : "Retail T+90 (your view)"}
            value={fmt.pct(d.leak.retailReturnPct, 2)}
            sub={isFr
              ? "Ce que VOUS capturez en entrant à pubDate+1 et tenant 90j."
              : "What YOU capture entering at pubDate+1 and holding 90d."}
            color={d.leak.retailReturnPct > 0 ? "var(--signal-pos)" : "var(--signal-neg)"}
          />
        </div>

        <Callout tone="info">
          {isFr ? (
            <><strong>Bonne nouvelle :</strong> la fuite d&apos;information est <strong>modérée ({d.leak.leakRatioPct.toFixed(0)}% du retour total)</strong>.
            Vous ne perdez pas grand-chose en attendant la publication. Le retour retail (pubDate+1 → pubDate+90j)
            est quasi identique au retour insider. Le vrai problème n&apos;est pas la fraîcheur,
            c&apos;est la <strong>sélection des signaux</strong> (voir partie 3).</>
          ) : (
            <><strong>Good news:</strong> the information leak is <strong>moderate ({d.leak.leakRatioPct.toFixed(0)}% of total return)</strong>.
            You don&apos;t lose much by waiting for the filing. The retail return (pubDate+1 → pubDate+90d)
            is nearly identical to the insider return. The real problem isn&apos;t freshness —
            it&apos;s <strong>signal selection</strong> (see part 3).</>
          )}
        </Callout>
      </Section>

      {/* ── STRATEGIES ────────────────────────────────────────────────── */}
      <Section
        id="strategies"
        eyebrow={isFr ? "Partie 3 · sélection" : "Part 3 · selection"}
        title={isFr ? "Quelles stratégies marchent vraiment ?" : "Which strategies actually work?"}
      >
        <p style={pBody}>
          {isFr
            ? "Nous avons testé 6 stratégies sur le même univers, avec les mêmes règles :"
            : "We tested 6 strategies on the same universe, with the same rules:"}
        </p>
        <ul style={ulBody}>
          {isFr ? (
            <>
              <li>Portefeuille top-20 · on achète les 20 meilleurs signaux du mois précédent, score-triés.</li>
              <li>Rebalancement mensuel · on sort les anciens, on prend les nouveaux.</li>
              <li>Holding 3 mois par position (correspond à la fenêtre T+90 du backtest).</li>
              <li>Frais de courtage <strong>1% aller-retour</strong> (prix retail en France).</li>
              <li>Entrée à <code style={codeInline}>pubDate+1</code> (le lendemain de la publication AMF).</li>
            </>
          ) : (
            <>
              <li>Top-20 portfolio · we buy the 20 best signals from the previous month, sorted by score.</li>
              <li>Monthly rebalancing · old positions out, new ones in.</li>
              <li>3-month hold per position (matches the T+90 backtest window).</li>
              <li>Brokerage fees <strong>1% round-trip</strong> (French retail price).</li>
              <li>Entry at <code style={codeInline}>pubDate+1</code> (the day after the AMF filing).</li>
            </>
          )}
        </ul>

        <div
          style={{
            marginTop: "18px",
            overflowX: "auto",
            border: "1px solid var(--border-med)",
            borderRadius: "3px",
            background: "var(--bg-surface)",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border-med)" }}>
                {[
                  isFr ? "Stratégie" : "Strategy",
                  isFr ? "Signaux" : "Signals",
                  "CAGR",
                  "Sharpe",
                  "Max DD",
                  "Win %",
                  isFr ? "Bat CAC" : "Beats CAC",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 12px",
                      textAlign: "left",
                      fontSize: "0.66rem",
                      fontWeight: 700,
                      color: "var(--tx-3)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      fontFamily: "'JetBrains Mono', monospace",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.strategies.map((s, i) => (
                <StrategyRow key={i} s={s} isBest={s === d.bestBySharpe} numLocale={numLocale} isFr={isFr} />
              ))}
              <tr style={{ borderTop: "2px solid var(--gold)", background: "var(--gold-bg)" }}>
                <td style={{ padding: "10px 12px", color: "var(--tx-1)", fontWeight: 700 }}>
                  CAC 40 (buy &amp; hold)
                </td>
                <td style={{ padding: "10px 12px", color: "var(--tx-3)", fontFamily: "monospace" }}>
                  {isFr ? "passif" : "passive"}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--gold)", fontFamily: "monospace", fontWeight: 700 }}>
                  {fmt.pct(d.cacBenchmark.cagrPct, 2)}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--tx-2)", fontFamily: "monospace" }}>
                  {fmt.sharpe(d.cacBenchmark.sharpe)}
                </td>
                <td style={{ padding: "10px 12px", color: "var(--tx-3)", fontFamily: "monospace" }}>·</td>
                <td style={{ padding: "10px 12px", color: "var(--tx-3)", fontFamily: "monospace" }}>·</td>
                <td style={{ padding: "10px 12px", color: "var(--tx-3)", fontFamily: "monospace" }}>·</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p style={{ ...pBody, marginTop: "14px", fontSize: "0.82rem", color: "var(--tx-3)", fontStyle: "italic" }}>
          {isFr ? (
            <>Lecture du tableau : la colonne <strong>Signaux</strong> indique combien de trades correspondaient au filtre
            sur toute la période. <strong>Sharpe</strong> = ratio rendement/risque annualisé.
            <strong>Max DD</strong> = pire perte cumulée subie pendant la simulation.
            <strong>Bat CAC</strong> = % de mois où la stratégie a fait mieux que le CAC 40.</>
          ) : (
            <>Reading the table: the <strong>Signals</strong> column shows how many trades matched the filter
            over the full period. <strong>Sharpe</strong> = annualised return/risk ratio.
            <strong>Max DD</strong> = worst cumulative loss during the simulation.
            <strong>Beats CAC</strong> = % of months the strategy outperformed the CAC 40.</>
          )}
        </p>

        <Callout tone="info">
          {isFr ? (
            <><strong>Lecture :</strong> sur 2021-2026, période où le CAC 40 a atteint ses plus hauts
            historiques (+{d.cacBenchmark.cagrPct.toFixed(1)}% annualisé), la stratégie &laquo; ★ Sigma &raquo;
            dégage <strong>+{reco?.cagr?.toFixed(1)}% CAGR net</strong> avec un{" "}
            <strong>Max DD de {reco?.maxDDPct?.toFixed(0) ?? "·"}%</strong> et{" "}
            <strong>{reco?.beatCacPct?.toFixed(0) ?? "·"}% de mois</strong> qui battent l&apos;indice.
            Les stratégies filtrées servent de socle de sélection, leur intérêt se mesure surtout
            en période de repli où les signaux insiders historiquement résistent mieux.</>
          ) : (
            <><strong>Reading:</strong> over 2021-2026, a period when the CAC 40 reached all-time
            highs (+{d.cacBenchmark.cagrPct.toFixed(1)}% annualised), the ★ Sigma strategy
            delivers <strong>+{reco?.cagr?.toFixed(1)}% net CAGR</strong> with a{" "}
            <strong>Max DD of {reco?.maxDDPct?.toFixed(0) ?? "·"}%</strong> and{" "}
            <strong>{reco?.beatCacPct?.toFixed(0) ?? "·"}% of months</strong> beating the index.
            Filtered strategies serve as a selection foundation; their value shows most clearly
            during drawdowns where insider signals have historically held up better.</>
          )}
        </Callout>
      </Section>

      {/* ── PETIT INVESTISSEUR ──────────────────────────────────────── */}
      <Section
        id="small-investor"
        eyebrow={isFr ? "Partie 4 · guide pratique" : "Part 4 · practical guide"}
        title={isFr ? "Vous avez 20 positions max ? Voici comment utiliser Sigma" : "Max 20 positions? Here's how to use Sigma"}
      >
        <p style={pBody}>
          {isFr ? (
            <><strong>Non, il ne faut PAS détenir les 585 sociétés</strong> pour tirer de la valeur du système.
            Tout est question de <em>sélection</em> et de <em>discipline</em>. Voici notre recommandation
            pour un investisseur avec <strong>20 positions maximum</strong> et un capital entre
            10&nbsp;000 € et 100&nbsp;000 €.</>
          ) : (
            <><strong>No, you do NOT need to hold all 585 companies</strong> to extract value from the system.
            It&apos;s all about <em>selection</em> and <em>discipline</em>. Here is our recommendation
            for an investor with <strong>20 positions maximum</strong> and capital between
            €10,000 and €100,000.</>
          )}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
            gap: "12px",
            margin: "22px 0",
          }}
        >
          <PlaybookStep
            n="1"
            title={isFr ? "Utilisez Sigma comme filtre, pas comme stratégie" : "Use Sigma as a filter, not a strategy"}
            body={isFr ? (
              <>
                Le système Sigma n&apos;est <strong>pas une machine à battre le marché</strong>.
                C&apos;est un outil de <em>pré-tri</em> : au lieu de scanner 585 sociétés à la main,
                vous avez 3 à 10 signaux forts par semaine à étudier. Sigma fait 90% du travail
                d&apos;identification, vous faites l&apos;analyse qualitative restante.
              </>
            ) : (
              <>
                The Sigma system is <strong>not a market-beating machine</strong>.
                It&apos;s a <em>pre-screening</em> tool: instead of manually scanning 585 companies,
                you have 3 to 10 strong signals per week to study. Sigma does 90% of the
                identification work; you do the remaining qualitative analysis.
              </>
            )}
          />
          <PlaybookStep
            n="2"
            title={isFr ? "Privilégiez les clusters" : "Prioritise clusters"}
            body={isFr ? (
              <>
                <strong>Quand ≥ 2 dirigeants achètent la même société dans les 30 jours</strong>, le signal
                est robuste, c&apos;est le seul qui a généré un alpha positif constant dans nos backtests
                ({d.strategies[2]?.cagr != null ? fmt.pct(d.strategies[2].cagr, 1) : "·"} vs CAC +{d.cacBenchmark.cagrPct.toFixed(1)}%).
                Un achat isolé peut être du bruit ; plusieurs achats coordonnés, c&apos;est une vraie conviction collective.
              </>
            ) : (
              <>
                <strong>When ≥ 2 executives buy the same company within 30 days</strong>, the signal
                is robust — the only one that generated consistent positive alpha in our backtests
                ({d.strategies[2]?.cagr != null ? fmt.pct(d.strategies[2].cagr, 1) : "·"} vs CAC +{d.cacBenchmark.cagrPct.toFixed(1)}%).
                An isolated buy can be noise; coordinated buys from multiple insiders signal real collective conviction.
              </>
            )}
          />
          <PlaybookStep
            n="3"
            title={isFr ? "Filtrez par fonction et montant" : "Filter by role and amount"}
            body={isFr ? (
              <>
                Les trades de <strong>PDG et CFO</strong> sont plus prédictifs que ceux des administrateurs
                ou membres du CS. Préférez aussi les montants <strong>≥ 100 000 €</strong>, un achat
                de 5 k€ par un administrateur est symbolique, un achat de 500 k€ par un PDG est une conviction matérielle.
              </>
            ) : (
              <>
                Trades by <strong>CEOs and CFOs</strong> are more predictive than those of board members
                or supervisory council members. Also prefer amounts <strong>≥ €100,000</strong> — a €5k buy
                by a board member is symbolic; a €500k buy by a CEO is a material conviction.
              </>
            )}
          />
          <PlaybookStep
            n="4"
            title={isFr ? "Adoptez un horizon long" : "Adopt a long horizon"}
            body={isFr ? (
              <>
                Les signaux insiders fonctionnent mieux sur <strong>6-12 mois</strong> que sur 3 mois.
                Si vous achetez une position Sigma, prévoyez de la tenir au moins 6 mois, sinon les
                frais de transaction (1% aller-retour en FR) grignotent tout l&apos;alpha potentiel.
              </>
            ) : (
              <>
                Insider signals work better over <strong>6-12 months</strong> than over 3 months.
                If you buy a Sigma position, plan to hold it for at least 6 months, otherwise
                transaction costs (1% round-trip in France) eat all the potential alpha.
              </>
            )}
          />
          <PlaybookStep
            n="5"
            title={isFr ? "Limitez la concentration" : "Limit concentration"}
            body={isFr ? (
              <>
                Même si un signal est très fort, <strong>pas plus de 5% du portefeuille</strong> sur une
                même position. Les small-caps françaises sont peu liquides et peuvent perdre 30-50%
                rapidement. Sur 20 positions de 5% chacune, vous êtes dans l&apos;optimum de
                diversification Markowitz.
              </>
            ) : (
              <>
                Even if a signal is very strong, <strong>no more than 5% of portfolio</strong> on any
                single position. French small-caps are illiquid and can drop 30-50% rapidly.
                With 20 positions at 5% each, you are at the Markowitz diversification optimum.
              </>
            )}
          />
          <PlaybookStep
            n="6"
            title={isFr ? "Diversifiez avec un ETF" : "Diversify with an ETF"}
            body={isFr ? (
              <>
                <strong>Notre recommandation honnête :</strong> 60% de votre portefeuille en ETF large
                (CAC 40 ou MSCI World), 40% sur des convictions Sigma. Le noyau ETF capte la performance
                passive du marché. Les 40% Sigma sont votre &ldquo;edge&rdquo;, et s&apos;ils sous-performent, vous
                n&apos;avez pas tout perdu.
              </>
            ) : (
              <>
                <strong>Our honest recommendation:</strong> 60% of your portfolio in a broad ETF
                (CAC 40 or MSCI World), 40% in Sigma convictions. The ETF core captures passive market
                performance. The 40% Sigma is your &ldquo;edge&rdquo; — and if it underperforms, you haven&apos;t lost everything.
              </>
            )}
          />
        </div>

        <Callout tone="info">
          {isFr ? (
            <><strong>Exemple concret :</strong> avec 50 000 € de capital, allouez 30 000 € sur un ETF
            CAC 40 (performance attendue ≈ +{d.cacBenchmark.cagrPct.toFixed(1)}%/an) et 20 000 € sur 4 à 5
            convictions Sigma à 4 000-5 000 € chacune. Vous gardez le socle marché ET vous testez
            votre capacité à sélectionner les bons signaux. Si vos picks battent le CAC sur 2 ans,
            vous pouvez augmenter la poche Sigma.</>
          ) : (
            <><strong>Concrete example:</strong> with €50,000 of capital, allocate €30,000 to a
            CAC 40 ETF (expected return ≈ +{d.cacBenchmark.cagrPct.toFixed(1)}%/yr) and €20,000 across 4 to 5
            Sigma convictions at €4,000-5,000 each. You keep the market base AND test
            your ability to select the right signals. If your picks beat the CAC over 2 years,
            increase your Sigma allocation.</>
          )}
        </Callout>
      </Section>

      {/* ── LIMITATIONS ──────────────────────────────────────────────── */}
      <Section
        id="limitations"
        eyebrow={isFr ? "Partie 5 · transparence" : "Part 5 · transparency"}
        title={isFr ? "Limites et biais à connaître" : "Limits and Biases to Know"}
      >
        <ul style={ulBody}>
          {isFr ? (
            <>
              <li>
                <strong>Backtest ≠ futur.</strong> Nos +{reco?.cagr?.toFixed(1)}% sont historiques sur 4 ans.
                Les marchés et les comportements d&apos;initiés évoluent. Le futur peut être meilleur… ou pire.
              </li>
              <li>
                <strong>Survivorship bias.</strong> Notre base contient les sociétés encore cotées. Les radiées
                ou en faillite ne sont pas comptées, ce qui pourrait surestimer la performance réelle de 0.5 à 1 point.
              </li>
              <li>
                <strong>Slippage non modélisé.</strong> Sur les small-caps françaises, l&apos;écart bid-ask
                peut atteindre 1-3%. Nos backtests supposent exécution au prix de clôture. En réalité,
                vous paierez l&apos;ask et vendrez au bid → -1 à -2% de retour supplémentaire à retirer.
              </li>
              <li>
                <strong>Liquidité limitante.</strong> Certaines small-caps ont un volume quotidien
                {" "}&lt; 100 k€. Mettre 5 k€ sur un signal sur un micro-cap peut déplacer le marché.
                Sigma n&apos;a aucune valeur sur ces titres pour un investisseur &gt; 500 k€.
              </li>
              <li>
                <strong>Horizon de backtest court.</strong> 4 ans est insuffisant pour juger
                un système d&apos;investissement. Les académiques exigent typiquement 10-15 ans. Nous
                enrichissons la base en continu pour atteindre 10 ans d&apos;ici 2029.
              </li>
              <li>
                <strong>Période favorable au CAC.</strong> 2021-2025 a été particulièrement haussier pour
                le CAC 40 (ATH en 2024). Sur un cycle baissier, nos signaux à faible drawdown pourraient
                rattraper le benchmark, mais nous n&apos;avons pas encore la donnée pour le prouver.
              </li>
              <li>
                <strong>Pas un conseil en investissement.</strong> Ce site est un outil
                d&apos;information. Il n&apos;est ni un robo-advisor ni un gestionnaire de fonds.
                Vos décisions sont les vôtres, nous ne sommes pas responsables des pertes.
              </li>
            </>
          ) : (
            <>
              <li>
                <strong>Backtest ≠ future.</strong> Our +{reco?.cagr?.toFixed(1)}% are historical over 4 years.
                Markets and insider behaviours evolve. The future can be better… or worse.
              </li>
              <li>
                <strong>Survivorship bias.</strong> Our database contains companies still listed. Delisted
                or bankrupt ones are not counted, which could overstate real performance by 0.5 to 1 point.
              </li>
              <li>
                <strong>Slippage not modelled.</strong> On French small-caps, the bid-ask spread
                can reach 1-3%. Our backtests assume execution at closing price. In practice,
                you will pay the ask and sell at the bid → subtract an extra -1 to -2% from returns.
              </li>
              <li>
                <strong>Limiting liquidity.</strong> Some small-caps have daily volume
                {" "}&lt; €100k. Putting €5k into a micro-cap signal can move the market.
                Sigma has no value on these stocks for investors &gt; €500k.
              </li>
              <li>
                <strong>Short backtest horizon.</strong> 4 years is insufficient to judge
                an investment system. Academics typically require 10-15 years. We
                continuously enrich the database to reach 10 years by 2029.
              </li>
              <li>
                <strong>Favourable CAC period.</strong> 2021-2025 was particularly bullish for
                the CAC 40 (ATH in 2024). In a bear cycle, our low-drawdown signals could
                catch up with the benchmark, but we don&apos;t yet have the data to prove it.
              </li>
              <li>
                <strong>Not investment advice.</strong> This site is an information tool.
                It is neither a robo-advisor nor a fund manager.
                Your decisions are yours; we are not responsible for losses.
              </li>
            </>
          )}
        </ul>
      </Section>

      {/* ── IMPROVEMENTS ─────────────────────────────────────────────── */}
      <Section
        id="roadmap"
        eyebrow={isFr ? "Amélioration continue" : "Continuous improvement"}
        title={isFr ? "Ce que nous faisons pour améliorer" : "What we're doing to improve"}
      >
        <ul style={ulBody}>
          {isFr ? (
            <>
              <li>
                <strong>Scoring v3 déployé (avril 2026).</strong> Refonte après audit méthodologique :
                cluster désormais strictement directionnel, ajout du <em>track record dirigeant</em> (shrinkage
                bayésien), du bonus <em>DCA</em> et du signal <em>analyst-contrarian</em>. Pénalité de staleness
                sortie du score stocké (appliquée à l&apos;affichage seulement). Poids redistribué de l&apos;information
                publique (fondamentaux, composite) vers les signaux propres à l&apos;insider.
              </li>
              <li>
                <strong>Shrinkage bayésien sur les recos.</strong> Les buckets sous-échantillonnés (role × taille)
                sont désormais tirés vers la moyenne globale avec un prior k=20. Plus aucune promotion structurelle
                des buckets à faible n sur du bruit. La demi-vie de récence passe de 21 à 45 jours (alignée sur le
                hold T+90).
              </li>
              <li>
                <strong>Bucket &quot;Sweet spot&quot; (300M-1B€).</strong> Split du bucket Mid pour isoler la zone
                où le grid-search a trouvé la concentration d&apos;alpha (liquide, sous-couvert). Taxonomie en
                6 tailles désormais : Micro / Small / Sweet / Mid / Large / Mega.
              </li>
              <li>
                <strong>Retours retail-réels stockés.</strong> Chaque backtest contient désormais
                <code style={codeInline}>returnFromPub30d/90d/365d</code> (entrée à pubDate+1) en plus des
                retours insider-view (transactionDate). Les backtests futurs seront plus honnêtes par défaut.
              </li>
              <li>
                <strong>Backtest mensuel automatisé.</strong> Tous les dimanches à 5h UTC, nous recomputons
                300 backtests manquants. Le système devient plus précis chaque semaine.
              </li>
              <li>
                <strong>Expansion historique.</strong> Remontée aux déclarations 2015-2020 en cours
                (disponible aujourd&apos;hui : {startYear} → {endYear}).
              </li>
              <li>
                <strong>Signaux de vente.</strong> Notre engine supporte BUY et SELL, utile
                pour la gestion de position sur un titre détenu.
              </li>
            </>
          ) : (
            <>
              <li>
                <strong>Scoring v3 deployed (April 2026).</strong> Methodology overhaul after audit:
                cluster detection is now strictly directional, added <em>insider track record</em> (Bayesian
                shrinkage), <em>DCA</em> bonus and <em>analyst-contrarian</em> signal. Staleness penalty
                removed from the stored score (applied at display time only). Weight redistributed from public
                information (fundamentals, composite) toward insider-specific signals.
              </li>
              <li>
                <strong>Bayesian shrinkage on recommendations.</strong> Under-sampled buckets (role × size) are
                now pulled toward the global mean with a k=20 prior. No more structural over-ranking of low-n
                buckets on noise. The recency half-life was raised from 21 to 45 days (aligned with the 90-day hold).
              </li>
              <li>
                <strong>New &quot;Sweet spot&quot; bucket (€300M-€1B).</strong> Split from Mid to isolate the
                zone where the grid search found alpha concentrates (liquid, under-covered). Taxonomy now in
                6 sizes: Micro / Small / Sweet / Mid / Large / Mega.
              </li>
              <li>
                <strong>Real retail returns stored.</strong> Each backtest now contains
                <code style={codeInline}>returnFromPub30d/90d/365d</code> (entry at pubDate+1) in addition to
                insider-view returns (transactionDate). Future backtests will be more honest by default.
              </li>
              <li>
                <strong>Automated monthly backtest.</strong> Every Sunday at 5h UTC, we recompute
                300 missing backtests. The system becomes more accurate each week.
              </li>
              <li>
                <strong>Historical expansion.</strong> Back-filling filings 2015-2020 in progress
                (currently available: {startYear} → {endYear}).
              </li>
              <li>
                <strong>Sell signals.</strong> Our engine supports BUY and SELL, useful
                for position management on a held stock.
              </li>
            </>
          )}
        </ul>
      </Section>

      {/* ── FINAL CTA ────────────────────────────────────────────────── */}
      <section
        className="perf-cta"
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
            <>Utilisez Sigma pour ce qu&apos;il est :<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>
              un outil d&apos;analyse, pas une baguette magique
            </span></>
          ) : (
            <>Use Sigma for what it is:<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>
              an analysis tool, not a magic wand
            </span></>
          )}
        </h2>
        <p
          style={{
            fontSize: "0.98rem",
            color: "var(--tx-2)",
            maxWidth: "560px",
            margin: "0 auto 22px",
            lineHeight: 1.6,
          }}
        >
          {isFr
            ? "585 sociétés passées au crible, 25 500 déclarations scorées, 22 000 backtests. Utilisez-le pour pré-filtrer votre univers et concentrer votre analyse sur les 10-20 sociétés qui méritent vraiment votre attention cette semaine."
            : "585 companies screened, 25,500 scored filings, 22,000 backtests. Use it to pre-filter your universe and focus your analysis on the 10-20 companies that truly deserve your attention this week."}
        </p>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/recommendations/" style={btnGold}>
            {isFr ? "Voir les recommandations actuelles →" : "View current recommendations →"}
          </Link>
          <Link href="/methodologie/" style={btnGhost}>
            {isFr ? "Méthodologie détaillée ↗" : "Detailed methodology ↗"}
          </Link>
          <Link href="/fonctionnement/" style={btnGhost}>
            {isFr ? "Comment ça marche ↗" : "How it works ↗"}
          </Link>
        </div>
      </section>

      <style>{`
        @media (max-width: 640px) {
          .perf-cta { padding: 24px 16px !important; }
        }
      `}</style>
    </div>
  );
}

// ── Components ──────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.66rem",
        fontWeight: 700,
        color: "var(--gold)",
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        marginBottom: "10px",
      }}
    >
      {children}
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} style={{ paddingTop: "48px", paddingBottom: "12px", scrollMarginTop: "80px" }}>
      <div style={{ marginBottom: "22px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" }}>
        <Eyebrow>{eyebrow}</Eyebrow>
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

function TakeawayCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: `3px solid ${color}`,
        borderRadius: "3px",
        padding: "16px 20px",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.66rem",
          color: "var(--tx-3)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Banana Grotesk', sans-serif",
          fontSize: "2rem",
          fontWeight: 700,
          color,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          marginBottom: "6px",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--tx-3)", lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        padding: "10px 14px",
        borderRadius: "3px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.62rem",
          color: "var(--tx-3)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Banana Grotesk', sans-serif",
          fontSize: "1.3rem",
          fontWeight: 700,
          color: "var(--tx-1)",
          fontVariantNumeric: "tabular-nums",
          marginTop: "2px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Breakdown({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        padding: "14px 18px",
        borderRadius: "3px",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.66rem",
          color: "var(--tx-3)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 600,
          marginBottom: "4px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "1.6rem",
          fontFamily: "'Banana Grotesk', sans-serif",
          fontWeight: 700,
          color,
          letterSpacing: "-0.025em",
          fontVariantNumeric: "tabular-nums",
          marginBottom: "6px",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "0.82rem", color: "var(--tx-3)", lineHeight: 1.55 }}>{sub}</div>
    </div>
  );
}

function PlaybookStep({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: "3px solid var(--gold)",
        padding: "16px 18px",
        borderRadius: "3px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "8px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "var(--corporate)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.78rem",
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
            lineHeight: 1.25,
            flex: 1,
            minWidth: 0,
            overflowWrap: "break-word",
          }}
        >
          {title}
        </h3>
      </div>
      <div style={{ fontSize: "0.88rem", color: "var(--tx-2)", lineHeight: 1.65 }}>{body}</div>
    </div>
  );
}

function StrategyRow({ s, isBest, numLocale, isFr = true }: { s: StrategyResult; isBest: boolean; numLocale: string; isFr?: boolean }) {
  const cagrColor = (s.cagr ?? 0) > 0 ? "var(--signal-pos)" : (s.cagr ?? 0) < 0 ? "var(--signal-neg)" : "var(--tx-2)";
  return (
    <tr
      style={{
        borderBottom: "1px solid var(--border)",
        background: isBest ? "var(--gold-bg)" : "transparent",
      }}
    >
      <td style={{ padding: "10px 12px", color: "var(--tx-1)", fontWeight: isBest ? 700 : 500 }}>
        <div>{isFr ? s.label : (s.labelEn ?? s.label)}</div>
        <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: "2px", lineHeight: 1.4 }}>
          {isFr ? s.description : (s.descriptionEn ?? s.description)}
        </div>
      </td>
      <td style={{ padding: "10px 12px", color: "var(--tx-2)", fontFamily: "monospace", verticalAlign: "top" }}>
        {fmt.num(s.matching, numLocale)}
      </td>
      <td style={{ padding: "10px 12px", color: cagrColor, fontFamily: "'Banana Grotesk', sans-serif", fontWeight: 700, fontSize: "1rem", verticalAlign: "top", fontVariantNumeric: "tabular-nums" }}>
        {fmt.pct(s.cagr, 2)}
      </td>
      <td style={{ padding: "10px 12px", color: "var(--tx-1)", fontFamily: "monospace", verticalAlign: "top" }}>
        {fmt.sharpe(s.sharpe)}
      </td>
      <td style={{ padding: "10px 12px", color: "var(--signal-neg)", fontFamily: "monospace", verticalAlign: "top" }}>
        {s.maxDDPct != null ? s.maxDDPct.toFixed(1) + "%" : "·"}
      </td>
      <td style={{ padding: "10px 12px", color: "var(--tx-2)", fontFamily: "monospace", verticalAlign: "top" }}>
        {s.winRatePct != null ? s.winRatePct.toFixed(0) + "%" : "·"}
      </td>
      <td style={{ padding: "10px 12px", color: "var(--tx-2)", fontFamily: "monospace", verticalAlign: "top" }}>
        {s.beatCacPct != null ? s.beatCacPct.toFixed(0) + "%" : "·"}
      </td>
    </tr>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "info" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const colors = {
    info:   { bd: "var(--c-indigo-2)", bg: "rgba(23,48,92,0.05)" },
    warn:   { bd: "var(--gold)",       bg: "var(--gold-bg)" },
    danger: { bd: "var(--c-crimson)",  bg: "var(--c-crimson-bg)" },
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

// ── Inline styles ───────────────────────────────────────────────────────────

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
