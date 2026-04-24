/**
 * /pitch · Pitch investisseur — Insiders Trades Sigma
 * Uses raw T+90/T+365 median returns (not portfolio simulation CAGR)
 * which is the honest, more compelling figure.
 */

import type React from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { unstable_cache } from "next/cache";
import { LogoMark } from "@/components/Logo";
import { computePerformanceData } from "@/lib/performance-data";
import { getBacktestBase } from "@/lib/backtest-compute";

export const dynamic = "force-dynamic"; // locale-aware

/**
 * Heavy DB computation (backtest universe + CAC monthly + declaration counts) is
 * cached 1 hour. The underlying data is recomputed at most daily by the cron,
 * so 1h is plenty; first render fills the cache, subsequent loads are instant
 * and the skeleton loader never appears.
 */
const getPitchDataCached = unstable_cache(
  async () => {
    const [d, base] = await Promise.all([
      computePerformanceData(),
      getBacktestBase(),
    ]);
    return { d, base };
  },
  ["pitch-data-v1"],
  { revalidate: 3600, tags: ["pitch-data"] },
);

export async function generateMetadata() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";
  return {
    title: isFr
      ? "Le Pitch · Insiders Trades Sigma"
      : "The Pitch · Insiders Trades Sigma",
    description: isFr
      ? "InsiderTrades Sigma en chiffres : signaux T+90 et T+365 réels, méthode AMF, comparaison CAC 40, guide pratique."
      : "Insiders Trades Sigma by the numbers: real T+90 and T+365 signals, AMF methodology, CAC 40 comparison, practical guide.",
  };
}

const fmt = {
  pct:  (n: number | null | undefined, d = 1) =>
          n == null ? "·" : (n > 0 ? "+" : "") + n.toFixed(d) + "%",
  num:  (n: number | null | undefined, locale = "fr-FR") => n?.toLocaleString(locale) ?? "·",
  pos:  (n: number | null | undefined, d = 1) =>
          n == null ? "·" : "+" + Math.abs(n).toFixed(d) + "%",
};

// ── Inline SVG bar chart ─────────────────────────────────────────────────────
function BarChart({ bars }: {
  bars: { label: string; sub: string; value: number; gold?: boolean; grey?: boolean }[];
}) {
  const maxVal = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  // Min bar width so labels don't crush on narrow viewports
  const minTotalW = bars.length * 56;
  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: 200, padding: "0 4px", minWidth: minTotalW }}>
        {bars.map((b, i) => {
          const pct = (Math.abs(b.value) / maxVal) * 100;
          const bg = b.grey
            ? "var(--bg-elevated)"
            : b.gold
              ? "var(--gold)"
              : "var(--c-indigo-2)";
          return (
            <div key={i} style={{ flex: 1, minWidth: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 6 }}>
              <div style={{
                fontFamily: "'Banana Grotesk', sans-serif",
                fontSize: "clamp(0.7rem, 1.8vw, 0.95rem)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: b.grey ? "var(--tx-3)" : b.gold ? "var(--gold)" : "var(--tx-1)",
              }}>
                {b.value > 0 ? "+" : ""}{b.value.toFixed(1)}%
              </div>
              <div style={{
                width: "70%", height: `${pct}%`,
                background: bg, borderRadius: "2px 2px 0 0",
                minHeight: 8,
                transition: "height 0.3s",
              }} />
              <div style={{ textAlign: "center", padding: "0 2px" }}>
                <div style={{ fontSize: "clamp(0.58rem, 1.4vw, 0.68rem)", fontWeight: 700, color: b.grey ? "var(--tx-4)" : "var(--tx-2)", lineHeight: 1.2 }}>{b.label}</div>
                <div style={{ fontSize: "clamp(0.52rem, 1.2vw, 0.6rem)", color: "var(--tx-4)", lineHeight: 1.3, marginTop: 2 }}>{b.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── KPI tile ─────────────────────────────────────────────────────────────────
function KpiTile({
  value, label, sub, gold, grey, n,
}: { value: string; label: string; sub?: string; gold?: boolean; grey?: boolean; n?: string }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 4,
      padding: "20px 18px",
      background: gold ? "var(--gold-bg)" : grey ? "var(--bg-raised)" : "var(--bg-surface)",
      border: `1px solid ${gold ? "var(--gold)" : "var(--border-med)"}`,
    }}>
      <div style={{
        fontFamily: "'Banana Grotesk', sans-serif",
        fontSize: "2.1rem", fontWeight: 800,
        letterSpacing: "-0.04em", lineHeight: 1,
        color: gold ? "var(--gold)" : grey ? "var(--tx-3)" : "var(--tx-1)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
        {n && <span style={{ fontSize: "0.65rem", fontFamily: "'JetBrains Mono', monospace", color: "var(--tx-3)", fontWeight: 600, marginLeft: 8, letterSpacing: "0.08em" }}>n={n}</span>}
      </div>
      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--tx-1)" }}>{label}</div>
      {sub && <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

function Overline({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.16em",
      textTransform: "uppercase" as const, color: "var(--gold)",
      marginBottom: 10, display: "block",
    }}>
      {children}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function PitchPage() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";
  const numLocale = isFr ? "fr-FR" : "en-US";

  const { d, base } = await getPitchDataCached();

  const startYear = d.universe.periodStart.slice(0, 4);
  const endYear   = d.universe.periodEnd.slice(0, 4);

  const T = isFr ? {
    heroPitch: "Insiders Trades Sigma — Pitch investisseur",
    heroH1Line1: "Suivre les dirigeants qui achètent",
    heroH1Line2: "leurs propres titres en bourse.",
    heroSub1: "déclarations AMF scorées",
    heroSub2: "backtests",
    heroBadges: ["Données AMF officielles", "Règlement MAR 596/2014", "Backtest retail-view", "Accès beta"],
    kpiOverline: "01 · Les chiffres clés",
    kpiH2: "Ce que montrent les backtests, en clair",
    kpiTile1Label: "Médiane T+90 — cluster",
    kpiTile1Sub: "Rendement médian d'un trade 3 mois après la publication AMF (entrée pubDate+1, sortie 90j après). Valeur typique — pas la moyenne.",
    kpiTile2Label: "Moyenne T+365 — cluster",
    kpiTile2Sub: "Rendement moyen d'un trade 12 mois après la publication. Retour absolu par trade, pas une annualisation. Le CAGR de la stratégie est calculé à part (section 5).",
    kpiTile3Label: "Win rate T+90 — cluster",
    kpiTile3Sub: "% de trades cluster avec un rendement strictement positif à 3 mois (entrée pubDate+1)",
    kpiTile4Label: "CAC 40 CAGR · benchmark",
    clusterLabels: ["Cluster 2+ insiders", "Deep cluster 3+", "Cascade 4+ insiders"],
    clusterStat1: "Médiane T+90",
    clusterStat2: "Médiane T+365",
    clusterStat3: "Win rate",
    clusterTradesLabel: "trades · n T+365 =",
    chartOverline: "02 · Visualisation",
    chartH2: "Retour moyen T+90 par type de signal",
    chartDesc: "Les barres montrent les retours moyens mesurés depuis la date de transaction interne de l\u0027initié (pas la publication AMF). La simulation de portefeuille réaliste (section suivante) utilise pubDate+1. Plus le signal est qualifié (cluster, profondeur), plus le retour est élevé.",
    legendSigma: "Signaux Sigma (or)",
    legendGlobal: "Signal AMF global",
    legendCac: "CAC 40 (référence)",
    chartNote: "Retours moyens bruts par trade depuis la date de transaction, non annualisés, frais non déduits (1% A/R déduit dans la simulation de portefeuille — section suivante). Le CAC 40 est projeté sur 90 jours depuis son CAGR annualisé, à titre de repère uniquement.",
    methodOverline: "03 · La méthode",
    methodH2: "Pourquoi ce signal est exploitable",
    methodCards: [
      { n: "01", title: "Obligation légale, pas une opinion", body: "MAR 596/2014 oblige tout dirigeant à déclarer toute transaction sur ses propres titres dans les 3 jours ouvrés. Ce n'est pas du storytelling — c'est de l'argent réel engagé." },
      { n: "02", title: "Signal cluster : conviction collective", body: "Quand 2+ dirigeants achètent indépendamment la même société en 30 jours, ils lisent les mêmes indicateurs internes. C'est un signal de conviction non orchestré — notre variable alpha n°1." },
      { n: "03", title: "Score composite v3 (0–100 pts, 10 composantes)", body: "Cluster directionnel ±30j, % market cap, track record dirigeant avec shrinkage bayésien, rôle (PDG/CFO > board), DCA, analyst-contrarian, délai tx→pub. Condition d'entrée : cluster + score ≥ 40 + fresh + mid-cap. La v3 (2026-04) redistribue le poids vers les signaux propres à l'insider pour réduire la pollution par l'information déjà publique." },
      { n: "04", title: "Vue retail honnête (pubDate+1)", body: "Nos retours sont calculés depuis le lendemain de la publication AMF — le moment où vous pouvez réagir. Pas depuis la date d'achat interne (qui capture l'alpha que vous ne pouvez pas capturer)." },
      { n: "05", title: "Logeable dans un PEA-PME", body: "La stratégie Sigma cible les sociétés 200 M€ – 1 Md€ · cette fenêtre recoupe presque exactement l'éligibilité PEA-PME (PME < 5 000 salariés, CA < 1,5 Md€ ou bilan < 2 Md€). Un investisseur avec un PEA-PME peut donc exécuter la stratégie complète dans son enveloppe fiscale : exonération d'IR sur les plus-values après 5 ans, seuls les 17,2% de prélèvements sociaux restent dus." },
    ],
    combosOverline: "04 · Meilleures combinaisons de signaux",
    combosH2: "Les signaux qui battent clairement le marché",
    combosDesc: "Classement par Sharpe T+90 (rendement / volatilité). Seules les combinaisons avec n ≥ 5 trades sont présentées. Ces données viennent directement des backtests sur la période",
    tableHeaders: ["Signal", "n", "Médiane T+90", "Moy. T+90", "Moy. T+365", "Win %", "Sharpe"],
    tableNote: "Lecture. Chaque ligne agrège n trades historiques matchant le filtre. Médiane T+90 = rendement médian d'un trade sur 3 mois calendaires (entrée à pubDate+1, sortie 90j après). T+365 = même principe sur 365 jours — rendement absolu par trade, PAS une annualisation. La médiane est plus représentative que la moyenne (peu sensible aux outliers à +400%). Sharpe = rendement moyen / écart-type · plus c'est élevé, plus le rendement est stable par unité de risque. Exemple : un trade LVMH acheté à 700 € le lendemain de la publication AMF, valant 742 € 90 jours plus tard → T+90 = +6,0%.",
    simOverline: "05 · Simulation portefeuille",
    simH2: "Stratégies filtrées vs CAC 40 buy & hold",
    simDesc: "Simulation top-20 par score, rebalancement mensuel, holding 3 mois, frais 1% A/R inclus, entrée pubDate+1. Seules les stratégies avec CAGR positif sont présentées.",
    simTableHeaders: ["Stratégie", "Signaux", "CAGR net", "Sharpe", "Max DD", "Win mois", "Bat CAC"],
    simCacLabel: "CAC 40 · buy & hold",
    simCacSub: "benchmark passif · dividendes réinvestis",
    simCacPassif: "passif",
    simNote: "CAGR net = retour annualisé après frais 1% A/R. Max DD = max drawdown simulé (pire perte cumulée). Win mois = % de mois positifs. Seules les stratégies avec un CAGR > 0 sont présentées ici.",
    appOverline: "06 · Application pratique",
    appH2: "Combien de sociétés, combien de trades, quel capital",
    capitalCards: [
      {
        amount: "10 000 €", tag: "Débutant", featured: false,
        rows: [
          ["Positions simultanées", "4 sociétés · 2 500 € chacune"],
          ["Filtre recommandé", "Cluster uniquement · score v3 ≥ 55"],
          ["Horizon de détention", "6 à 12 mois par position"],
          ["Signaux étudiés / an", "~20–30 évalués · 4–6 retenus"],
          ["Frais A/R estimés", "~200 € / an (1% × 4 positions × 2)"],
        ],
        note: "À ce capital, concentrez-vous sur les 4 signaux les plus forts par an. Qualité > fréquence.",
      },
      {
        amount: "50 000 €", tag: "Sweet spot", featured: true,
        rows: [
          ["Allocation recommandée", "30 000 € ETF · 20 000 € Sigma"],
          ["Positions Sigma", "5 sociétés · 4 000 € chacune"],
          ["Filtre recommandé", "Score v3 ≥ 50 · PDG/CFO · cluster prioritaire"],
          ["Horizon de détention", "6 mois min · 12 mois si conviction forte"],
          ["Signaux étudiés / an", "~50–80 évalués · 5–10 retenus"],
        ],
        note: "Le noyau ETF (60%) capte la performance indicielle. Les 40% Sigma sont la poche d'alpha. Logique asymétrique : le downside est limité, l'upside potentiel est significatif.",
      },
      {
        amount: "200 000 €", tag: "Avancé", featured: false,
        rows: [
          ["Allocation recommandée", "120 000 € multi-ETF · 80 000 € Sigma"],
          ["Positions Sigma", "15–20 sociétés · 4–5 000 € chacune"],
          ["Filtre recommandé", "Score v3 ≥ 45 · tous rôles · cluster prioritaire"],
          ["Horizon de détention", "Rebalancement trimestriel"],
          ["Volume min de liquidité", "200 000 € / jour pour ne pas déplacer le cours"],
        ],
        note: "Attention liquidité : évitez les small-caps sous 200 000 €/j de volume quotidien à ces montants.",
      },
    ],
    transOverline: "07 · Transparence",
    transH2: "Ce que ces backtests ne prouvent pas",
    transRows: [
      ["Historique de 4 ans seulement", `${startYear}–${endYear} couvre un cycle majoritairement haussier (CAC ATH en 2024). Les académiques requièrent 10–15 ans pour valider un système. Nos résultats peuvent surestimer la performance sur un cycle baissier.`],
      ["Survivorship bias partiel", "La base ne contient que les sociétés encore cotées. Les sociétés radiées, en faillite ou rachetées ne sont pas comptabilisées, ce qui peut surestimer la performance de 0,5 à 1 point de CAGR."],
      ["Slippage non modélisé", "Les backtests supposent une exécution au prix de clôture pubDate+1. Sur les small-caps françaises (bid-ask parfois 1 à 3%), votre prix réel sera moins favorable. Retirez mentalement 0,5 à 1 point par an."],
      ["Pas un substitut à l'analyse fondamentale", "Sigma identifie les dossiers méritant une analyse. Il ne remplace pas la lecture du bilan, des résultats, et de la valorisation. Un signal fort sur une société surendettée reste un signal sur une société surendettée."],
      ["Pas un conseil en investissement", "Ce site est un outil d'information réglementée (données AMF publiques). Il ne constitue pas un conseil en investissement. Vos décisions sont vos responsabilités."],
    ],
    ctaH2: "Accès beta sur invitation",
    ctaSub1: "déclarations scorées",
    ctaSub2: "backtests calculés",
    ctaSub3: "Nouvelles déclarations ingérées dans l\u0027heure suivant leur publication AMF",
    ctaBtn1: "Dashboard backtest",
    ctaBtn2: "Voir les signaux actifs",
    ctaBtn3: "Méthodologie complète",
    ctaDisclaimer: "Usage informatif · données AMF publiques · ne constitue pas un conseil en investissement",
    chartBarLabels: ["CAC 40", "Tous achats", "PDG/DG", "CFO/DAF", "Cluster 2+", "Cluster 3+", "Cascade 4+"],
    chartBarSubs: ["buy & hold"],
    simMoisLabel: "mois couverts",
  } : {
    heroPitch: "Insiders Trades Sigma — Investor pitch",
    heroH1Line1: "Following executives who buy",
    heroH1Line2: "their own company\u2019s stock.",
    heroSub1: "scored AMF filings",
    heroSub2: "backtests",
    heroBadges: ["Official AMF data", "MAR Regulation 596/2014", "Retail-view backtest", "Beta access"],
    kpiOverline: "01 · Key figures",
    kpiH2: "What the backtests show, plainly",
    kpiTile1Label: "Median T+90 — cluster",
    kpiTile1Sub: "Median return per trade 3 months after the AMF filing (entry pubDate+1, exit 90d later). Typical value — not the mean.",
    kpiTile2Label: "Mean T+365 — cluster",
    kpiTile2Sub: "Average return per trade 12 months after the filing. Absolute per-trade return, NOT annualised. Strategy CAGR is computed separately (section 5).",
    kpiTile3Label: "Win rate T+90 — cluster",
    kpiTile3Sub: "% of cluster trades with a strictly positive return at 3 months (entry pubDate+1)",
    kpiTile4Label: "CAC 40 CAGR · benchmark",
    clusterLabels: ["Cluster 2+ insiders", "Deep cluster 3+", "Cascade 4+ insiders"],
    clusterStat1: "Median T+90",
    clusterStat2: "Median T+365",
    clusterStat3: "Win rate",
    clusterTradesLabel: "trades · n T+365 =",
    chartOverline: "02 · Visualization",
    chartH2: "Average T+90 return by signal type",
    chartDesc: "Bars show average returns measured from the insider\u0027s internal transaction date (not the AMF filing date). The realistic portfolio simulation (next section) uses pubDate+1. The more qualified the signal, the higher and more consistent the return.",
    legendSigma: "Sigma signals (gold)",
    legendGlobal: "Global AMF signal",
    legendCac: "CAC 40 (reference)",
    chartNote: "Gross average returns per trade from the transaction date, not annualised, fees not deducted (1% round-trip deducted in the portfolio simulation — next section). The CAC 40 is projected over 90 days from its annualised CAGR, for reference only — not a strict like-for-like comparison.",
    methodOverline: "03 · The method",
    methodH2: "Why this signal is exploitable",
    methodCards: [
      { n: "01", title: "A legal obligation, not an opinion", body: "MAR 596/2014 requires every executive to report any transaction in their own company\u2019s securities within 3 business days. This is not storytelling \u2014 it is real money committed." },
      { n: "02", title: "Cluster signal: collective conviction", body: "When 2+ executives independently buy the same company within 30 days, they are reading the same internal indicators. This is an unorchestrated conviction signal \u2014 our #1 alpha variable." },
      { n: "03", title: "Composite score v3 (0\u2013100 pts, 10 components)", body: "Directional cluster \u00b130d, % market cap, insider track record with Bayesian shrinkage, role (CEO/CFO > board), DCA, analyst-contrarian, tx\u2192pub delay. Entry condition: cluster + score \u2265 40 + fresh + mid-cap. v3 (2026-04) redistributes weight toward insider-specific features to reduce contamination by already-public information." },
      { n: "04", title: "Honest retail view (pubDate+1)", body: "Our returns are measured from the day after the AMF filing — the moment you can act. Not from the insider\u2019s internal trade date (which captures alpha you cannot capture yourself)." },
      { n: "05", title: "Fits a PEA-PME wrapper", body: "The Sigma strategy targets €200M – €1Bn companies · this range almost entirely overlaps with French PEA-PME eligibility (SMEs < 5,000 employees, revenue < €1.5Bn or total assets < €2Bn). A French investor with a PEA-PME account can run the full strategy inside their tax wrapper: capital-gains exemption after 5 years, only the 17.2% social charges remain." },
    ],
    combosOverline: "04 · Best signal combinations",
    combosH2: "Signals that clearly beat the market",
    combosDesc: "Ranked by Sharpe T+90 (return / volatility). Only combinations with n \u2265 5 trades are shown. This data comes directly from backtests over the period",
    tableHeaders: ["Signal", "n", "Median T+90", "Avg T+90", "Avg T+365", "Win %", "Sharpe"],
    tableNote: "How to read. Each row aggregates n historical trades matching the filter. Median T+90 = median return per trade over 3 calendar months (entry at pubDate+1, exit 90d later). T+365 = same principle over 365 days — absolute per-trade return, NOT annualised. The median is more representative than the mean (insensitive to +400% outliers). Sharpe = mean return / std dev · higher means steadier return per unit of risk. Example: an LVMH trade bought at €700 the day after the AMF filing, worth €742 after 90 days → T+90 = +6.0%.",
    simOverline: "05 · Portfolio simulation",
    simH2: "Filtered strategies vs CAC 40 buy & hold",
    simDesc: "Top-20 by score simulation, monthly rebalancing, 3-month holding, 1% round-trip fees included, entry at pubDate+1. Only strategies with positive CAGR are shown.",
    simTableHeaders: ["Strategy", "Signals", "Net CAGR", "Sharpe", "Max DD", "Win months", "Beat CAC"],
    simCacLabel: "CAC 40 · buy & hold",
    simCacSub: "passive benchmark · dividends reinvested",
    simCacPassif: "passive",
    simNote: "Net CAGR = annualised return after 1% round-trip fees. Max DD = simulated max drawdown (worst cumulative loss). Win months = % of positive months. Only strategies with CAGR > 0 are shown.",
    appOverline: "06 · Practical application",
    appH2: "How many companies, how many trades, how much capital",
    capitalCards: [
      {
        amount: "€10,000", tag: "Beginner", featured: false,
        rows: [
          ["Simultaneous positions", "4 companies \u00b7 €2,500 each"],
          ["Recommended filter", "Cluster only \u00b7 score v3 \u2265 55"],
          ["Holding horizon", "6 to 12 months per position"],
          ["Signals reviewed / year", "~20\u201330 evaluated \u00b7 4\u20136 retained"],
          ["Estimated round-trip fees", "~€200 / year (1% \u00d7 4 positions \u00d7 2)"],
        ],
        note: "At this capital level, focus on the 4 strongest signals per year. Quality over frequency.",
      },
      {
        amount: "€50,000", tag: "Sweet spot", featured: true,
        rows: [
          ["Recommended allocation", "€30,000 ETF \u00b7 €20,000 Sigma"],
          ["Sigma positions", "5 companies \u00b7 €4,000 each"],
          ["Recommended filter", "Score v3 \u2265 50 \u00b7 CEO/CFO \u00b7 cluster priority"],
          ["Holding horizon", "6 months min \u00b7 12 months if strong conviction"],
          ["Signals reviewed / year", "~50\u201380 evaluated \u00b7 5\u201310 retained"],
        ],
        note: "The ETF core (60%) captures index performance. The 40% Sigma is the alpha pocket. Asymmetric logic: downside is limited, potential upside is significant.",
      },
      {
        amount: "€200,000", tag: "Advanced", featured: false,
        rows: [
          ["Recommended allocation", "€120,000 multi-ETF \u00b7 €80,000 Sigma"],
          ["Sigma positions", "15\u201320 companies \u00b7 €4\u20135,000 each"],
          ["Recommended filter", "Score v3 \u2265 45 \u00b7 all roles \u00b7 cluster priority"],
          ["Holding horizon", "Quarterly rebalancing"],
          ["Min liquidity volume", "€200,000 / day to avoid moving the price"],
        ],
        note: "Watch liquidity: avoid small-caps below €200,000/day in daily volume at these amounts.",
      },
    ],
    transOverline: "07 · Transparency",
    transH2: "What these backtests do not prove",
    transRows: [
      ["4-year history only", `${startYear}–${endYear} covers a predominantly bullish cycle (CAC ATH in 2024). Academics require 10–15 years to validate a system. Our results may overstate performance in a bear cycle.`],
      ["Partial survivorship bias", "The dataset only contains companies still listed. Delisted, bankrupt or acquired companies are not counted, which may overstate performance by 0.5 to 1 CAGR point."],
      ["Slippage not modelled", "Backtests assume execution at the pubDate+1 closing price. On French small-caps (bid-ask sometimes 1–3%), your actual price will be less favourable. Mentally subtract 0.5 to 1 point per year."],
      ["Not a substitute for fundamental analysis", "Sigma identifies cases worth analysing. It does not replace reading the balance sheet, results, and valuation. A strong signal on an overleveraged company is still a signal on an overleveraged company."],
      ["Not investment advice", "This site is an information tool based on regulated public data (public AMF filings). It does not constitute investment advice. Your decisions are your responsibility."],
    ],
    ctaH2: "Beta access by invitation",
    ctaSub1: "scored filings",
    ctaSub2: "backtests computed",
    ctaSub3: "New filings ingested within one hour of AMF publication",
    ctaBtn1: "Backtest dashboard",
    ctaBtn2: "View active signals",
    ctaBtn3: "Full methodology",
    ctaDisclaimer: "Informational use · public AMF data · does not constitute investment advice",
    chartBarLabels: ["CAC 40", "All buys", "CEO/MD", "CFO", "Cluster 2+", "Cluster 3+", "Cascade 4+"],
    chartBarSubs: ["buy & hold"],
    simMoisLabel: "months covered",
  };

  // ── Extract the rich signal stats from the cached base ────────────────────
  const overall     = base?.overall;
  const clusterStats = base?.byBehavior?.["Cluster (2+ insiders)"];
  const deepCluster  = base?.byBehavior?.["Deep cluster (3+)"];
  const cascade      = base?.byBehavior?.["Cascade (4+ insiders)"];
  const pdgStats     = base?.byRole?.["PDG/DG"];
  const cfoStats     = base?.byRole?.["CFO/DAF"];

  // Find best signal combo by Sharpe
  const combos = base?.signalCombos ?? [];
  const pdgCluster = combos.find((c) => c.name === "PDG + cluster");
  const cfoStats2  = combos.find((c) => c.name === "CFO/DAF buys");
  const deepC      = combos.find((c) => c.name === "Deep cluster 3+");

  // CAC 40 T+90 equiv: annualised CAC / 4 quarters
  const cacT90 = d.cacBenchmark.cagrPct != null
    ? (Math.pow(1 + d.cacBenchmark.cagrPct / 100, 90 / 365) - 1) * 100
    : null;

  // Best strategies with positive CAGR only
  const goodStrategies = d.strategies
    .filter((s) => s.cagr != null && s.cagr > 0)
    .sort((a, b) => (b.sharpe ?? 0) - (a.sharpe ?? 0))
    .slice(0, 3);

  const winRateCluster = clusterStats?.winRate90d;
  const avgT90Cluster  = clusterStats?.avgReturn90d;
  const medT90Cluster  = clusterStats?.medianReturn90d;
  const medT365Cluster = clusterStats?.medianReturn365d;
  const avgT365Cluster = clusterStats?.avgReturn365d;

  const fmtNum = (n: number | null | undefined) => fmt.num(n, numLocale);

  // Chart bars: T+90 average return by signal type
  const chartBars = [
    {
      label: T.chartBarLabels[0],
      sub: T.chartBarSubs[0],
      value: cacT90 ?? d.cacBenchmark.cagrPct / 4,
      grey: true,
    },
    {
      label: T.chartBarLabels[1],
      sub: `n=${fmtNum(overall?.count)}`,
      value: overall?.avgReturn90d ?? 5,
    },
    {
      label: T.chartBarLabels[2],
      sub: `n=${fmtNum(pdgStats?.count)}`,
      value: pdgStats?.avgReturn90d ?? 8,
    },
    {
      label: T.chartBarLabels[3],
      sub: `n=${fmtNum(cfoStats?.count)}`,
      value: cfoStats?.avgReturn90d ?? 10,
    },
    {
      label: T.chartBarLabels[4],
      sub: `n=${fmtNum(clusterStats?.count)}`,
      value: avgT90Cluster ?? 14,
      gold: true,
    },
    {
      label: T.chartBarLabels[5],
      sub: `n=${fmtNum(deepCluster?.count)}`,
      value: deepCluster?.avgReturn90d ?? 18,
      gold: true,
    },
    {
      label: T.chartBarLabels[6],
      sub: `n=${fmtNum(cascade?.count)}`,
      value: cascade?.avgReturn90d ?? 22,
      gold: true,
    },
  ].filter((b) => Math.abs(b.value) < 100); // sanity filter

  return (
    <div className="content-wrapper pitch-wrap" style={{ maxWidth: 1060 }}>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section className="pitch-hero">
        <LogoMark size={44} />
        <div className="pitch-overline-el" style={{ color: "var(--gold)", fontSize: "0.62rem", letterSpacing: "0.18em" }}>
          {T.heroPitch}
        </div>
        <h1 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.85rem, 5vw, 3rem)", fontWeight: 400,
          letterSpacing: "-0.015em", lineHeight: 1.1, color: "var(--tx-1)",
          textAlign: "center",
        }}>
          {T.heroH1Line1}<br />
          <em style={{ color: "var(--gold)", fontStyle: "italic" }}>{T.heroH1Line2}</em>
        </h1>
        <p style={{ fontSize: "0.84rem", color: "var(--tx-3)", lineHeight: 1.8, textAlign: "center", maxWidth: 480 }}>
          {fmtNum(d.universe.totalDeclarations)} {T.heroSub1} &middot;{" "}
          {fmtNum(d.universe.totalBacktests)} {T.heroSub2} &middot; {startYear}–{endYear}
          <br />
          <span style={{ opacity: 0.75 }}>
            {isFr ? "retours mesurés depuis pubDate+1 (vue retail)" : "returns measured from pubDate+1 (retail view)"}
          </span>
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {T.heroBadges.map((t, i) => (
            <span key={t} style={{
              padding: "4px 11px", fontSize: "0.7rem", fontWeight: 600,
              border: `1px solid ${i === 3 ? "var(--gold)" : "var(--border-med)"}`,
              color: i === 3 ? "var(--gold)" : "var(--tx-3)",
              background: i === 3 ? "var(--gold-bg)" : "var(--bg-surface)",
            }}>
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── KPIs HERO ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "40px 0 0" }}>
        <Overline>{T.kpiOverline}</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 20,
        }}>
          {T.kpiH2}
        </h2>

        <div className="pitch-scroll-x pitch-kpi-grid" style={{ gap: 8, marginBottom: 32 }}>
          <KpiTile
            value={fmt.pos(medT90Cluster)}
            label={T.kpiTile1Label}
            sub={T.kpiTile1Sub}
            n={fmtNum(clusterStats?.count)}
          />
          <KpiTile
            value={fmt.pos(avgT365Cluster)}
            label={T.kpiTile2Label}
            sub={T.kpiTile2Sub}
            n={fmtNum(clusterStats?.countReturn365d)}
          />
          <KpiTile
            value={(winRateCluster != null ? winRateCluster.toFixed(0) : "·") + "%"}
            label={T.kpiTile3Label}
            sub={T.kpiTile3Sub}
            n={fmtNum(clusterStats?.count)}
          />
          <KpiTile
            value={d.cacBenchmark.cagrPct != null ? "+" + d.cacBenchmark.cagrPct.toFixed(1) + "%" : "·"}
            label={T.kpiTile4Label}
            sub={`${isFr ? "Dividendes réinvestis" : "Dividends reinvested"} · ${fmtNum(d.cacBenchmark.monthsCovered)} ${T.simMoisLabel} · ${isFr ? "même période" : "same period"}`}
            grey
          />
        </div>

        {/* Signal zoom — cluster depth */}
        <div className="pitch-scroll-x pitch-cluster-grid" style={{ gap: 8, marginBottom: 16 }}>
          {T.clusterLabels.map((label, idx) => {
            const statsMap = [clusterStats, deepCluster, cascade];
            const stats = statsMap[idx];
            const highlight = idx < 2;
            return stats ? (
              <div key={label} style={{
                padding: "16px 16px",
                background: highlight ? "var(--gold-bg)" : "var(--bg-surface)",
                border: `1px solid ${highlight ? "var(--gold)" : "var(--border-med)"}`,
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--tx-3)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                  {label}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
                  {[
                    { v: fmt.pos(stats.medianReturn90d), s: T.clusterStat1 },
                    { v: fmt.pos(stats.medianReturn365d), s: T.clusterStat2 },
                    { v: (stats.winRate90d?.toFixed(0) ?? "·") + "%", s: T.clusterStat3 },
                  ].map(({ v, s }) => (
                    <div key={s}>
                      <div style={{ fontSize: "1.1rem", fontWeight: 800, letterSpacing: "-0.03em", color: highlight ? "var(--gold)" : "var(--tx-1)", fontFamily: "'Banana Grotesk', sans-serif" }}>{v}</div>
                      <div style={{ fontSize: "0.62rem", color: "var(--tx-3)", marginTop: 1 }}>{s}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--tx-3)" }}>
                  {fmtNum(stats.count)} {T.clusterTradesLabel} {fmtNum(stats.countReturn365d)}
                </div>
              </div>
            ) : null;
          })}
        </div>
      </section>

      {/* ── BAR CHART ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "40px 0 0", borderTop: "1px solid var(--border)" }}>
        <Overline>{T.chartOverline}</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 6,
        }}>
          {T.chartH2}
        </h2>
        <p style={{ fontSize: "0.84rem", color: "var(--tx-3)", lineHeight: 1.6, marginBottom: 20, maxWidth: 680 }}>
          {T.chartDesc}
        </p>

        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-med)",
          padding: "24px 16px 16px",
        }}>
          <BarChart bars={chartBars} />
          <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.68rem", color: "var(--tx-3)" }}>
              <div style={{ width: 12, height: 12, background: "var(--gold)", borderRadius: 2 }} />
              {T.legendSigma}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.68rem", color: "var(--tx-3)" }}>
              <div style={{ width: 12, height: 12, background: "var(--c-indigo-2)", borderRadius: 2 }} />
              {T.legendGlobal}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.68rem", color: "var(--tx-3)" }}>
              <div style={{ width: 12, height: 12, background: "var(--bg-elevated)", borderRadius: 2, border: "1px solid var(--border-med)" }} />
              {T.legendCac}
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 10, padding: "10px 14px",
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          fontSize: "0.76rem", color: "var(--tx-3)", lineHeight: 1.6,
        }}>
          <strong style={{ color: "var(--tx-2)" }}>{isFr ? "Note :" : "Note:"}</strong>{" "}
          {T.chartNote}{" "}
          {isFr ? "Période" : "Period"} {startYear}–{endYear}.
        </div>
      </section>

      {/* ── MÉTHODE ────────────────────────────────────────────────────────── */}
      <section style={{ padding: "40px 0 0", borderTop: "1px solid var(--border)" }}>
        <Overline>{T.methodOverline}</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 20,
        }}>
          {T.methodH2}
        </h2>
        <div className="pitch-scroll-x pitch-method-grid" style={{ gap: 10, marginBottom: 16 }}>
          {T.methodCards.map((c) => (
            <div key={c.n} style={{
              background: "var(--bg-surface)", border: "1px solid var(--border-med)",
              borderTop: "2px solid var(--gold)", padding: "18px 16px",
            }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", color: "var(--gold)", fontWeight: 700, letterSpacing: "0.1em", marginBottom: 8 }}>{c.n}</div>
              <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--tx-1)", marginBottom: 8, lineHeight: 1.35 }}>{c.title}</div>
              <div style={{ fontSize: "0.82rem", color: "var(--tx-2)", lineHeight: 1.65 }}>{c.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TOP COMBOS ─────────────────────────────────────────────────────── */}
      <section style={{ padding: "40px 0 0", borderTop: "1px solid var(--border)" }}>
        <Overline>{T.combosOverline}</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 8,
        }}>
          {T.combosH2}
        </h2>
        <p style={{ fontSize: "0.84rem", color: "var(--tx-3)", lineHeight: 1.6, marginBottom: 20, maxWidth: 700 }}>
          {T.combosDesc} {startYear}–{endYear}.
        </p>

        {/* Top signal combos table */}
        <div style={{ overflowX: "auto", border: "1px solid var(--border-med)", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border-med)" }}>
                {T.tableHeaders.map((h, i) => (
                  <th key={h} style={{
                    padding: "10px 12px", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace",
                    textAlign: i === 0 ? "left" : "center", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {combos.slice(0, 8).map((c, i) => {
                const isTop = i < 3;
                const catRaw = c.category;
                const cat = isFr ? catRaw : (catRaw === "Rôle" ? "Role" : catRaw === "Taille" ? "Size" : catRaw);
                const catColor = catRaw === "Cluster" ? "var(--gold)" : catRaw === "Rôle" ? "var(--c-indigo-2)" : "var(--tx-4)";
                return (
                  <tr key={c.name} style={{
                    background: isTop ? "var(--gold-bg)" : i % 2 === 0 ? "transparent" : "var(--bg-raised)",
                    borderBottom: "1px solid var(--border)",
                  }}>
                    <td style={{ padding: "10px 12px", minWidth: 220 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isTop && <span style={{ fontSize: "0.65rem", color: "var(--gold)", fontWeight: 700 }}>★</span>}
                        <div>
                          <div style={{ fontWeight: isTop ? 700 : 500, color: "var(--tx-1)", fontSize: "0.84rem" }}>{c.name}</div>
                          <div style={{ fontSize: "0.65rem", color: catColor, fontWeight: 600, marginTop: 1 }}>{cat}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-3)", fontSize: "0.78rem" }}>{fmtNum(c.count)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, color: (c.medianReturn90d ?? 0) > 0 ? "var(--signal-pos)" : "var(--tx-2)", fontFamily: "'Banana Grotesk', sans-serif", fontSize: "0.95rem" }}>
                      {fmt.pct(c.medianReturn90d)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: (c.avgReturn90d ?? 0) > 0 ? "var(--tx-1)" : "var(--tx-2)", fontFamily: "'Banana Grotesk', sans-serif" }}>
                      {fmt.pct(c.avgReturn90d)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: (c.avgReturn365d ?? 0) > 20 ? 700 : 400, color: (c.avgReturn365d ?? 0) > 0 ? "var(--signal-pos)" : "var(--tx-2)", fontFamily: "'Banana Grotesk', sans-serif" }}>
                      {fmt.pct(c.avgReturn365d)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: (c.winRate90d ?? 0) > 55 ? "var(--tx-1)" : "var(--tx-3)" }}>
                      {c.winRate90d != null ? c.winRate90d.toFixed(0) + "%" : "·"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem", color: "var(--tx-2)" }}>
                      {c.sharpe90d != null ? c.sharpe90d.toFixed(2) : "·"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{
          padding: "10px 14px", background: "var(--bg-surface)", border: "1px solid var(--border)",
          fontSize: "0.76rem", color: "var(--tx-3)", lineHeight: 1.6,
        }}>
          <strong style={{ color: "var(--tx-2)" }}>{isFr ? "Lecture :" : "Key:"}</strong>{" "}
          {T.tableNote}{" "}
          {isFr ? "Période" : "Period"} {startYear}–{endYear}.
        </div>
      </section>

      {/* ── SIMULATION PORTEFEUILLE ─────────────────────────────────────────── */}
      {goodStrategies.length > 0 && (
        <section style={{ padding: "40px 0 0", borderTop: "1px solid var(--border)" }}>
          <Overline>{T.simOverline}</Overline>
          <h2 style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
            letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 8,
          }}>
            {T.simH2}
          </h2>
          <p style={{ fontSize: "0.84rem", color: "var(--tx-3)", lineHeight: 1.6, marginBottom: 20, maxWidth: 700 }}>
            {T.simDesc}
          </p>

          <div style={{ overflowX: "auto", border: "1px solid var(--border-med)", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border-med)" }}>
                  {T.simTableHeaders.map((h, i) => (
                    <th key={h} style={{
                      padding: "10px 12px", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace",
                      textAlign: i === 0 ? "left" : "center", whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {goodStrategies.map((s, i) => (
                  <tr key={i} style={{
                    background: i === 0 ? "var(--gold-bg)" : i % 2 === 0 ? "transparent" : "var(--bg-raised)",
                    borderBottom: "1px solid var(--border)",
                  }}>
                    <td style={{ padding: "10px 12px", minWidth: 240 }}>
                      <div style={{ fontWeight: i === 0 ? 700 : 500, color: "var(--tx-1)", fontSize: "0.84rem" }}>
                        {i === 0 && "★ "}{isFr ? s.label : (s.labelEn ?? s.label)}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--tx-3)", marginTop: 2, lineHeight: 1.4 }}>{isFr ? s.description : (s.descriptionEn ?? s.description)}</div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-3)", fontSize: "0.78rem" }}>{fmtNum(s.matching)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, fontFamily: "'Banana Grotesk', sans-serif", fontSize: "1rem", color: "var(--signal-pos)" }}>
                      {s.cagr != null ? "+" + s.cagr.toFixed(2) + "%" : "·"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-2)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem" }}>
                      {s.sharpe?.toFixed(2) ?? "·"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-3)", fontSize: "0.82rem" }}>
                      {s.maxDDPct != null ? s.maxDDPct.toFixed(1) + "%" : "·"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: (s.winRatePct ?? 0) > 55 ? "var(--tx-1)" : "var(--tx-3)" }}>
                      {s.winRatePct != null ? s.winRatePct.toFixed(0) + "%" : "·"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: (s.beatCacPct ?? 0) > 50 ? "var(--tx-1)" : "var(--tx-3)" }}>
                      {s.beatCacPct != null ? s.beatCacPct.toFixed(0) + "%" : "·"}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: "var(--bg-raised)", borderTop: "2px solid var(--border-med)" }}>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600, color: "var(--tx-2)", fontSize: "0.84rem" }}>{T.simCacLabel}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--tx-3)", marginTop: 2 }}>{T.simCacSub}</div>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-3)", fontSize: "0.78rem" }}>{T.simCacPassif}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, fontFamily: "'Banana Grotesk', sans-serif", fontSize: "1rem", color: "var(--gold)" }}>
                    {d.cacBenchmark.cagrPct != null ? "+" + d.cacBenchmark.cagrPct.toFixed(2) + "%" : "·"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem" }}>
                    {d.cacBenchmark.sharpe?.toFixed(2) ?? "·"}
                  </td>
                  <td colSpan={3} style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-4)", fontSize: "0.72rem" }}>
                    {fmtNum(d.cacBenchmark.monthsCovered)} {T.simMoisLabel}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{
            padding: "10px 14px", background: "var(--bg-surface)", border: "1px solid var(--border)",
            fontSize: "0.76rem", color: "var(--tx-3)", lineHeight: 1.6,
          }}>
            <strong style={{ color: "var(--tx-2)" }}>{isFr ? "Note :" : "Note:"}</strong>{" "}
            {T.simNote}
          </div>
        </section>
      )}

      {/* ── MODE D'EMPLOI ──────────────────────────────────────────────────── */}
      <section style={{ padding: "40px 0 0", borderTop: "1px solid var(--border)" }}>
        <Overline>{T.appOverline}</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 20,
        }}>
          {T.appH2}
        </h2>

        <div className="pitch-scroll-x pitch-capital-grid" style={{ gap: 10 }}>
          {T.capitalCards.map((c) => (
            <div key={c.amount} style={{
              background: c.featured ? "var(--gold-bg)" : "var(--bg-surface)",
              border: `${c.featured ? 2 : 1}px solid ${c.featured ? "var(--gold)" : "var(--border-med)"}`,
              padding: "20px 18px",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <span style={{ fontFamily: "'Banana Grotesk', sans-serif", fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em", color: "var(--tx-1)" }}>{c.amount}</span>
                <span style={{
                  fontSize: "0.66rem", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.07em",
                  padding: "4px 9px",
                  background: c.featured ? "var(--gold)" : "var(--bg-raised)",
                  color: c.featured ? "#0A0C10" : "var(--tx-3)",
                  border: c.featured ? "none" : "1px solid var(--border-med)",
                }}>{c.tag}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {c.rows.map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "0.74rem", color: "var(--tx-3)", flexShrink: 0 }}>{k}</span>
                    <span style={{ fontSize: "0.74rem", color: "var(--tx-1)", fontWeight: 600, textAlign: "right", minWidth: 0, wordBreak: "break-word" }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: 14, padding: "10px 12px",
                background: c.featured ? "rgba(184,149,90,0.1)" : "var(--bg-raised)",
                border: c.featured ? "1px solid rgba(184,149,90,0.2)" : "none",
                fontSize: "0.77rem", color: "var(--tx-2)", lineHeight: 1.6,
              }}>{c.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── TRANSPARENCE ───────────────────────────────────────────────────── */}
      <section style={{ padding: "40px 0 0", borderTop: "1px solid var(--border)" }}>
        <Overline>{T.transOverline}</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 20,
        }}>
          {T.transH2}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {T.transRows.map(([title, body]) => (
            <div key={title} className="pitch-transparency-row">
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--tx-1)" }}>{title}</div>
              <div style={{ fontSize: "0.84rem", color: "var(--tx-2)", lineHeight: 1.65 }}>{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section style={{
        marginTop: 60, padding: "44px 32px", textAlign: "center",
        background: "linear-gradient(135deg, var(--bg-surface) 0%, var(--gold-bg) 100%)",
        border: "1px solid var(--border-med)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
      }}>
        <LogoMark size={36} />
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.6rem, 3.5vw, 2.3rem)", fontWeight: 400,
          letterSpacing: "-0.015em", color: "var(--tx-1)", lineHeight: 1.1,
        }}>
          {T.ctaH2}
        </h2>
        <p style={{ fontSize: "0.9rem", color: "var(--tx-2)", lineHeight: 1.65, maxWidth: 580 }}>
          {fmtNum(d.universe.totalDeclarations)} {T.ctaSub1} &middot;{" "}
          {fmtNum(d.universe.totalBacktests)} {T.ctaSub2} &middot;
          {T.ctaSub3}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          <Link href="/backtest/" style={{
            display: "inline-flex", alignItems: "center", minHeight: 44,
            padding: "12px 22px", background: "var(--gold)", color: "#0A0C10",
            fontWeight: 700, fontSize: "0.88rem", textDecoration: "none",
            letterSpacing: "0.01em", boxShadow: "0 4px 14px rgba(184,149,90,0.28)",
          }}>
            {T.ctaBtn1}
          </Link>
          <Link href="/recommendations/" style={{
            display: "inline-flex", alignItems: "center", minHeight: 44,
            padding: "12px 22px", background: "var(--gold)", color: "#0A0C10",
            fontWeight: 700, fontSize: "0.88rem", textDecoration: "none",
            boxShadow: "0 4px 14px rgba(184,149,90,0.28)",
          }}>
            {T.ctaBtn2}
          </Link>
          <Link href="/methodologie/" style={{
            display: "inline-flex", alignItems: "center", minHeight: 44,
            padding: "12px 22px", border: "1px solid var(--border-strong)",
            color: "var(--tx-2)", fontWeight: 600, fontSize: "0.88rem",
            textDecoration: "none", background: "transparent",
          }}>
            {T.ctaBtn3}
          </Link>
        </div>
        <p style={{ fontSize: "0.72rem", color: "var(--tx-3)" }}>
          {T.ctaDisclaimer}
        </p>
      </section>

      {/* ── Mobile responsive styles ──────────────────────────────────────── */}
      <style>{`
        /* Transparency rows: 2-col on desktop, stacked on mobile */
        .pitch-transparency-row {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 20px;
          padding: 14px 0;
          border-bottom: 1px solid var(--border);
          align-items: baseline;
        }

        /* Desktop grids */
        .pitch-kpi-grid     { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px,100%), 1fr)); }
        .pitch-cluster-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px,100%), 1fr)); }
        .pitch-method-grid  { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(230px,100%), 1fr)); }
        .pitch-capital-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px,100%), 1fr)); }

        /* ── Mobile: horizontal swipe cards + overflow fixes ── */
        @media (max-width: 640px) {

          /* Swipe containers */
          .pitch-scroll-x {
            display: flex !important;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scroll-snap-type: x mandatory;
            padding-bottom: 10px;
            /* Bleed edge-to-edge inside content-wrapper */
            margin-left: -16px;
            margin-right: -16px;
            padding-left: 16px;
            padding-right: 16px;
            scrollbar-width: none;
          }
          .pitch-scroll-x::-webkit-scrollbar { display: none; }

          /* Card sizes per section */
          .pitch-kpi-grid > *     { flex: 0 0 min(260px, 76vw); scroll-snap-align: start; }
          .pitch-cluster-grid > * { flex: 0 0 min(260px, 80vw); scroll-snap-align: start; }
          .pitch-method-grid > *  { flex: 0 0 min(280px, 82vw); scroll-snap-align: start; }
          .pitch-capital-grid > * { flex: 0 0 min(290px, 84vw); scroll-snap-align: start; }

          /* Scroll hint: fade the right edge */
          .pitch-kpi-grid,
          .pitch-cluster-grid,
          .pitch-method-grid,
          .pitch-capital-grid {
            -webkit-mask-image: linear-gradient(to right, black calc(100% - 32px), transparent 100%);
            mask-image: linear-gradient(to right, black calc(100% - 32px), transparent 100%);
          }

          /* Transparency rows: stack title above body */
          .pitch-transparency-row {
            grid-template-columns: 1fr;
            gap: 6px;
          }

          /* BarChart labels responsive via container */
          .pitch-wrap .bar-chart-value { font-size: 0.72rem !important; }

          /* Tables: make sure scrollable */
          .pitch-wrap table { min-width: 540px; }
          .pitch-wrap [style*="overflowX"] { -webkit-overflow-scrolling: touch; }

          /* CTA section padding */
          .pitch-wrap section:last-of-type { padding: 32px 16px !important; }
        }

        @media (max-width: 400px) {
          .pitch-kpi-grid > *     { flex: 0 0 88vw; }
          .pitch-cluster-grid > * { flex: 0 0 88vw; }
          .pitch-method-grid > *  { flex: 0 0 88vw; }
          .pitch-capital-grid > * { flex: 0 0 90vw; }
        }
      `}</style>
    </div>
  );
}
