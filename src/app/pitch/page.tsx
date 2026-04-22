/**
 * /pitch · Investor pitch for Insiders Trades Sigma.
 * No emojis. Methodology first. All backtest strategies detailed.
 */

import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { computePerformanceData } from "@/lib/performance-data";

export const revalidate = 3600;

export const metadata = {
  title: "Le Pitch · Insiders Trades Sigma",
  description:
    "Insiders Trades Sigma en chiffres : méthode, backtests complets sur 6 stratégies, guide pratique par capital. Données AMF officielles.",
};

const f = {
  pct: (n: number | null | undefined, d = 1) =>
    n == null ? "·" : (n > 0 ? "+" : "") + n.toFixed(d) + "%",
  num: (n: number | null | undefined) => n?.toLocaleString("fr-FR") ?? "·",
  sharpe: (n: number | null | undefined) => n?.toFixed(2) ?? "·",
  dd: (n: number | null | undefined) => n == null ? "·" : n.toFixed(1) + "%",
};

function pctColor(v: number | null | undefined) {
  if (v == null) return "var(--tx-3)";
  if (v > 5) return "var(--signal-pos)";
  if (v > 0) return "var(--tx-1)";
  return "var(--signal-neg)";
}

export default async function PitchPage() {
  const d = await computePerformanceData();
  const sigma    = d.strategies[d.strategies.length - 1];
  const cluster  = d.strategies[2];
  const ceo_cfo  = d.strategies[3];
  const bigClust = d.strategies[4];
  const startYear = d.universe.periodStart.slice(0, 4);
  const endYear   = d.universe.periodEnd.slice(0, 4);

  return (
    <div className="content-wrapper pitch-wrap" style={{ maxWidth: 1060 }}>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="pitch-hero">
        <LogoMark size={44} />
        <div className="pitch-overline">Insiders Trades Sigma — Pitch investisseur</div>
        <h1 className="pitch-h1">
          Suivre les achats de dirigeants sur leurs propres titres.<br />
          <em className="pitch-em">Une méthode réglementée, backtestée, publique.</em>
        </h1>
        <p className="pitch-subtitle">
          {f.num(d.universe.totalDeclarations)} déclarations AMF scorées &middot;{" "}
          {f.num(d.universe.totalBacktests)} backtests &middot; {startYear}&ndash;{endYear} &middot; frais de courtage inclus
        </p>
        <div className="pitch-hero-tags">
          <span className="pitch-tag">Données AMF officielles</span>
          <span className="pitch-tag">Règlement MAR 596/2014</span>
          <span className="pitch-tag">Backtest retail-view (pubDate+1)</span>
          <span className="pitch-tag pitch-tag-gold">Accès beta</span>
        </div>
      </section>

      {/* ── LA MÉTHODE ───────────────────────────────────────────────── */}
      <section className="pitch-section">
        <Overline>01 · Fondements</Overline>
        <h2 className="pitch-h2">Pourquoi les déclarations de dirigeants sont un signal exploitable</h2>

        <p className="pitch-body">
          Le règlement européen <strong>MAR 596/2014</strong> oblige tout dirigeant à déclarer à l&apos;AMF toute transaction sur les titres de sa société dans les <strong>3 jours ouvrés</strong>. Ces déclarations sont publiques, structurées, et horodatées. Elles représentent l&apos;un des rares signaux où un acteur informé engage son propre capital sur la base d&apos;une conviction — contrairement aux rapports d&apos;analystes, aux recommendations de brokers, ou aux prévisions de management.
        </p>

        <div className="pitch-method-grid">
          <div className="pitch-method-card">
            <div className="pitch-method-num">01</div>
            <div className="pitch-method-title">Obligation légale, pas une opinion</div>
            <div className="pitch-method-body">
              La déclaration AMF n&apos;est pas volontaire. Elle suit un achat ou une vente réel, sur le marché. Le dirigeant engage son propre argent avant que vous puissiez réagir — c&apos;est sa conviction, pas sa communication.
            </div>
          </div>
          <div className="pitch-method-card">
            <div className="pitch-method-num">02</div>
            <div className="pitch-method-title">Score composite v2 (0–100)</div>
            <div className="pitch-method-body">
              Chaque déclaration reçoit un score calculé sur : rôle de l&apos;insider (PDG = 40 pts, CFO = 35 pts, administrateur = 10 pts), montant en valeur absolue, % de la market cap, présence d&apos;un cluster, délai tx→pub, et historique DCA de l&apos;insider. Un score ≥ 65 est considéré comme fort.
            </div>
          </div>
          <div className="pitch-method-card">
            <div className="pitch-method-num">03</div>
            <div className="pitch-method-title">Cluster : la variable clé</div>
            <div className="pitch-method-body">
              Quand au moins 2 dirigeants distincts achètent la même société dans une fenêtre de 30 jours, le signal est classé <em>cluster</em>. C&apos;est la variable qui apporte le plus d&apos;alpha dans nos backtests — un achat coordonné est moins probabiliste qu&apos;un achat isolé.
            </div>
          </div>
          <div className="pitch-method-card">
            <div className="pitch-method-num">04</div>
            <div className="pitch-method-title">Backtest retail-réel</div>
            <div className="pitch-method-body">
              Les retours sont calculés depuis <code style={{ fontFamily: "monospace", fontSize: "0.88em", background: "var(--bg-raised)", padding: "1px 4px", borderRadius: 2 }}>pubDate+1</code> (le lendemain de la publication AMF), pas depuis la date de transaction de l&apos;insider. C&apos;est la vue réaliste : vous entrez après que l&apos;information est publique. Frais de courtage à 1% aller-retour déduits.
            </div>
          </div>
        </div>
      </section>

      {/* ── L'ENTONNOIR ──────────────────────────────────────────────── */}
      <section className="pitch-section">
        <Overline>02 · Filtrage</Overline>
        <h2 className="pitch-h2">De {f.num(d.universe.totalDeclarations)} déclarations à 5 convictions par semaine</h2>
        <p className="pitch-body">
          Le marché français compte 585 sociétés cotées sur Euronext Paris. Sigma les surveille toutes en temps réel. L&apos;entonnoir ci-dessous montre comment on passe de l&apos;univers complet aux signaux actionnables.
        </p>

        <div className="pitch-funnel-h">
          {[
            { n: "585",   label: "sociétés surveillées",          sub: "tout Euronext Paris" },
            { n: f.num(d.universe.totalDeclarations), label: "déclarations scorées", sub: `depuis ${startYear} · mise à jour quotidienne` },
            { n: f.num(d.universe.retailEnrichedBacktests), label: "backtests retail-view",  sub: "avec prix pubDate+1 vérifiable sur Yahoo" },
            { n: "5–15",  label: "signaux actionnables / semaine", sub: "score ≥ 65 · PDG/CFO · cluster prioritaire", gold: true },
          ].map((s, i, arr) => (
            <div key={i} className="pitch-funnel-h-wrap">
              <div className={`pitch-funnel-h-step${s.gold ? " pitch-funnel-h-gold" : ""}`}>
                <div className="pitch-funnel-h-n">{s.n}</div>
                <div className="pitch-funnel-h-label">{s.label}</div>
                <div className="pitch-funnel-h-sub">{s.sub}</div>
              </div>
              {i < arr.length - 1 && <div className="pitch-funnel-h-arrow">&#8594;</div>}
            </div>
          ))}
        </div>
      </section>

      {/* ── BACKTEST COMPLET ─────────────────────────────────────────── */}
      <section className="pitch-section">
        <Overline>03 · Résultats</Overline>
        <h2 className="pitch-h2">6 stratégies testées sur la même période {startYear}&ndash;{endYear}</h2>
        <p className="pitch-body">
          Toutes les stratégies utilisent les mêmes règles : portefeuille top-20 par score, rebalancement mensuel, holding 3 mois, frais de courtage 1% A/R, entrée à pubDate+1. La différence vient uniquement du <strong>filtre appliqué</strong> — ce qui montre l&apos;impact direct de la sélection.
        </p>

        <div className="pitch-table-wrap">
          <table className="pitch-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Stratégie</th>
                <th>Signaux</th>
                <th>CAGR net</th>
                <th>Sharpe</th>
                <th>Max DD</th>
                <th>Win %</th>
                <th>Bat CAC</th>
              </tr>
            </thead>
            <tbody>
              {d.strategies.map((s, i) => {
                const isSigma = i === d.strategies.length - 1;
                const isBest  = s === d.bestBySharpe;
                return (
                  <tr key={i} className={isSigma ? "pitch-table-sigma" : isBest ? "pitch-table-best" : ""}>
                    <td className="pitch-table-name">
                      <div style={{ fontWeight: isSigma ? 700 : 500, color: "var(--tx-1)" }}>
                        {isSigma ? "★ " : ""}{s.label}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: 2, lineHeight: 1.4 }}>
                        {s.description}
                      </div>
                    </td>
                    <td className="pitch-table-num">{f.num(s.matching)}</td>
                    <td className="pitch-table-num" style={{ fontWeight: 700, color: pctColor(s.cagr), fontSize: "1rem" }}>
                      {f.pct(s.cagr, 2)}
                    </td>
                    <td className="pitch-table-num">{f.sharpe(s.sharpe)}</td>
                    <td className="pitch-table-num" style={{ color: "var(--signal-neg)" }}>
                      {s.maxDDPct != null ? "-" + f.dd(s.maxDDPct) : "·"}
                    </td>
                    <td className="pitch-table-num" style={{ color: (s.winRatePct ?? 0) > 55 ? "var(--signal-pos)" : "var(--tx-2)" }}>
                      {s.winRatePct != null ? s.winRatePct.toFixed(0) + "%" : "·"}
                    </td>
                    <td className="pitch-table-num">
                      {s.beatCacPct != null ? s.beatCacPct.toFixed(0) + "%" : "·"}
                    </td>
                  </tr>
                );
              })}
              <tr className="pitch-table-cac">
                <td className="pitch-table-name">
                  <div style={{ fontWeight: 600, color: "var(--tx-2)" }}>CAC 40 · buy &amp; hold</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--tx-3)", marginTop: 2 }}>benchmark passif · dividendes réinvestis</div>
                </td>
                <td className="pitch-table-num" style={{ color: "var(--tx-3)" }}>passif</td>
                <td className="pitch-table-num" style={{ fontWeight: 700, color: "var(--gold)", fontSize: "1rem" }}>
                  {f.pct(d.cacBenchmark.cagrPct, 2)}
                </td>
                <td className="pitch-table-num">{f.sharpe(d.cacBenchmark.sharpe)}</td>
                <td className="pitch-table-num" style={{ color: "var(--tx-3)" }}>·</td>
                <td className="pitch-table-num" style={{ color: "var(--tx-3)" }}>·</td>
                <td className="pitch-table-num" style={{ color: "var(--tx-3)" }}>·</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="pitch-table-note">
          <strong>Lecture :</strong> CAGR net = retour annualisé après frais 1% A/R. Sharpe = rendement mensuel moyen / écart-type mensuel × √12.
          Max DD = pire perte cumulée simulée. Win % = % de mois positifs. Bat CAC = % de mois où la stratégie surperforme le CAC 40.
          Période CAC 40 utilisée : {f.num(d.cacBenchmark.monthsCovered)} mois.
        </p>
      </section>

      {/* ── SIGNAL ZOOM ──────────────────────────────────────────────── */}
      <section className="pitch-section">
        <Overline>04 · Signaux clés</Overline>
        <h2 className="pitch-h2">Ce qui fait la différence dans les backtests</h2>
        <p className="pitch-body">
          Trois variables ressortent statistiquement comme les plus déterminantes sur notre panel {startYear}&ndash;{endYear}. Les autres variables (DCA, saison, secteur) apportent un signal secondaire mais sont corrélées à celles-ci.
        </p>

        <div className="pitch-signal-grid">
          {[
            {
              rank: "01",
              title: "Cluster : 2+ dirigeants",
              stat: cluster?.cagr != null ? f.pct(cluster.cagr, 2) : "·",
              statLabel: `CAGR · ${f.num(cluster?.matching)} trades`,
              sharpe: cluster?.sharpe,
              body: "La variable la plus discriminante. Quand plusieurs dirigeants d'une même société achètent dans un intervalle court (30 jours), ils ne se coordonnent pas — ils lisent les mêmes signaux internes indépendamment. C'est une conviction collective non orchestrée.",
            },
            {
              rank: "02",
              title: "Fonction : PDG & CFO uniquement",
              stat: ceo_cfo?.cagr != null ? f.pct(ceo_cfo.cagr, 2) : "·",
              statLabel: `CAGR · ${f.num(ceo_cfo?.matching)} trades`,
              sharpe: ceo_cfo?.sharpe,
              body: "Le PDG connaît son pipeline commercial. Le CFO connaît sa trésorerie et ses résultats futurs. Les administrateurs et membres du conseil d'administration ont moins accès à l'information opérationnelle — leur signal est plus faible historiquement.",
            },
            {
              rank: "03",
              title: "Conviction élevée : trade ≥ 500k€ + cluster",
              stat: bigClust?.cagr != null ? f.pct(bigClust.cagr, 2) : "·",
              statLabel: `CAGR · ${f.num(bigClust?.matching)} trades`,
              sharpe: bigClust?.sharpe,
              body: "Un achat de 500 000 € ou plus par un dirigeant dans un cluster est statistiquement rare et représente la conviction la plus matérielle. Moins de signaux, mais les plus significatifs en termes de risque/rendement.",
            },
          ].map((s) => (
            <div key={s.rank} className="pitch-signal-card">
              <div className="pitch-signal-rank">{s.rank}</div>
              <div className="pitch-signal-title">{s.title}</div>
              <div className="pitch-signal-stat-row">
                <span className="pitch-signal-stat">{s.stat}</span>
                <span className="pitch-signal-stat-label">{s.statLabel}</span>
                {s.sharpe != null && (
                  <span className="pitch-signal-sharpe">Sharpe {f.sharpe(s.sharpe)}</span>
                )}
              </div>
              <div className="pitch-signal-body">{s.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── MODE D'EMPLOI ────────────────────────────────────────────── */}
      <section className="pitch-section">
        <Overline>05 · Application pratique</Overline>
        <h2 className="pitch-h2">Combien de sociétés, combien de trades, quel capital</h2>

        <div className="pitch-capital-grid">
          {[
            {
              amount: "10 000 €",
              tag: "Débutant",
              featured: false,
              rows: [
                ["Positions simultanées", "4 sociétés · 2 500 € chacune"],
                ["Filtre recommandé", "Cluster uniquement · score ≥ 70"],
                ["Horizon de détention", "6 à 12 mois par position"],
                ["Signaux étudiés / an", "~20–30 évalués · 4–6 retenus"],
                ["Frais A/R estimés", "~200 € / an (1% × 4 positions × 2)"],
              ],
              note: "À ce capital, les frais de courtage ont un impact significatif. Concentrez-vous sur les 4 signaux les plus forts par an, pas sur la fréquence.",
            },
            {
              amount: "50 000 €",
              tag: "Sweet spot",
              featured: true,
              rows: [
                ["Allocation recommandée", "30 000 € ETF · 20 000 € Sigma"],
                ["Positions Sigma", "5 sociétés · 4 000 € chacune"],
                ["Filtre recommandé", "Score ≥ 65 · PDG/CFO · cluster prioritaire"],
                ["Horizon de détention", "6 mois min · 12 mois si conviction forte"],
                ["Signaux étudiés / an", "~50–80 évalués · 5–10 retenus"],
              ],
              note: "Le noyau ETF (60 %) capture la performance indicielle. Les 40 % Sigma sont la poche d'alpha. Si elle sous-performe 2 ans, vous n'avez pas tout perdu — la logique asymétrique est la bonne.",
            },
            {
              amount: "200 000 €",
              tag: "Avancé",
              featured: false,
              rows: [
                ["Allocation recommandée", "120 000 € multi-ETF · 80 000 € Sigma"],
                ["Positions Sigma", "15–20 sociétés · 4–5 000 € chacune"],
                ["Filtre recommandé", "Score ≥ 60 · tous rôles · cluster prioritaire"],
                ["Horizon de détention", "Rebalancement trimestriel"],
                ["Signaux étudiés / an", "~80–120 évalués · 15–20 retenus"],
              ],
              note: "Attention à la liquidité. Évitez les titres avec un volume quotidien inférieur à 200 000 € pour ne pas impacter le prix à l'entrée ou à la sortie.",
            },
          ].map((c) => (
            <div key={c.amount} className={`pitch-cap-card${c.featured ? " pitch-cap-featured" : ""}`}>
              <div className="pitch-cap-header">
                <span className="pitch-cap-amount">{c.amount}</span>
                <span className={`pitch-cap-tag${c.featured ? " pitch-cap-tag-gold" : ""}`}>{c.tag}</span>
              </div>
              <div className="pitch-cap-rows">
                {c.rows.map(([k, v]) => (
                  <div key={k} className="pitch-cap-row">
                    <span className="pitch-cap-key">{k}</span>
                    <span className="pitch-cap-val">{v}</span>
                  </div>
                ))}
              </div>
              <div className={`pitch-cap-note${c.featured ? " pitch-cap-note-gold" : ""}`}>{c.note}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── LIMITES ──────────────────────────────────────────────────── */}
      <section className="pitch-section">
        <Overline>06 · Transparence</Overline>
        <h2 className="pitch-h2">Limites et biais à connaître avant d&apos;utiliser Sigma</h2>
        <div className="pitch-limits">
          {[
            ["Backtest sur 4 ans uniquement", `${startYear}–${endYear} est insuffisant pour valider un système sur un cycle complet. Les académiques requièrent 10–15 ans. Nous enrichissons la base continuellement. Nos résultats sur cycle haussier (CAC 40 ATH en 2024) peuvent surestimer la performance.`],
            ["Survivorship bias partiel", "Notre base ne contient que les sociétés encore cotées. Les sociétés radiées, en faillite ou rachetées ne sont pas comptées, ce qui peut surestimer la performance de 0,5 à 1 point de CAGR."],
            ["Slippage non modélisé", "Les backtests supposent une exécution au prix de clôture pubDate+1. En réalité, sur les small-caps françaises (bid-ask parfois 1–3%), votre prix réel sera moins favorable. Retirez mentalement 0,5 à 1 point par an sur les small-caps."],
            ["Liquidité sur micro et small-caps", "Certaines sociétés ont un volume quotidien inférieur à 100 000 €. Sigma n'est pas adapté à des capitaux supérieurs à 500 000 € sur ces titres — vous déplacerez le marché et réduirez votre propre alpha."],
            ["Non substituable à l'analyse fondamentale", "Sigma identifie les sociétés méritant une analyse. Il ne remplace pas la lecture du bilan, des résultats, et de la valorisation. Un signal fort sur une société surendettée reste un signal sur une société surendettée."],
            ["Pas un conseil en investissement", "Ce site est un outil d'information réglementée (données AMF publiques). Il ne constitue pas un conseil en investissement. Vos décisions sont vos responsabilités."],
          ].map(([title, body]) => (
            <div key={title} className="pitch-limit-row">
              <div className="pitch-limit-title">{title}</div>
              <div className="pitch-limit-body">{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="pitch-cta">
        <LogoMark size={36} />
        <h2 className="pitch-cta-title">
          Accès beta sur invitation
        </h2>
        <p className="pitch-cta-body">
          {f.num(d.universe.totalDeclarations)} déclarations scorées &middot; {f.num(d.universe.totalBacktests)} backtests calculés
          &middot; Nouvelles déclarations ingérées dans l&apos;heure suivant leur publication AMF
          &middot; Mise à jour quotidienne des cours et scores
        </p>
        <div className="pitch-cta-actions">
          <Link href="/backtest" className="pitch-btn-gold">Voir le dashboard backtest</Link>
          <Link href="/performance" className="pitch-btn-ghost">Performance complète &uarr;</Link>
          <Link href="/methodologie" className="pitch-btn-ghost">Méthodologie détaillée &uarr;</Link>
        </div>
        <p className="pitch-cta-legal">
          Usage informatif · données AMF publiques · ne constitue pas un conseil en investissement
        </p>
      </section>

      <style>{`
        .pitch-wrap { padding-bottom: 80px; }

        /* Hero */
        .pitch-hero {
          display: flex; flex-direction: column; align-items: center; text-align: center;
          padding: 40px 0 44px; gap: 16px;
          border-bottom: 1px solid var(--border);
        }
        .pitch-overline {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.62rem; font-weight: 700; letter-spacing: 0.18em;
          text-transform: uppercase; color: var(--gold);
        }
        .pitch-h1 {
          font-family: var(--font-dm-serif), Georgia, serif;
          font-size: clamp(1.85rem, 5vw, 3rem); font-weight: 400;
          letter-spacing: -0.015em; line-height: 1.1; color: var(--tx-1);
        }
        .pitch-em { color: var(--gold); font-style: italic; }
        .pitch-subtitle { font-size: 0.84rem; color: var(--tx-3); line-height: 1.6; }
        .pitch-hero-tags { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
        .pitch-tag {
          padding: 4px 11px; border-radius: 3px;
          font-size: 0.7rem; font-weight: 600; letter-spacing: 0.03em;
          border: 1px solid var(--border-med); color: var(--tx-3); background: var(--bg-surface);
        }
        .pitch-tag-gold { border-color: var(--gold); color: var(--gold); background: var(--gold-bg); }

        /* Sections */
        .pitch-section { padding: 52px 0 4px; border-bottom: 1px solid var(--border); }
        .pitch-h2 {
          font-family: var(--font-dm-serif), Georgia, serif;
          font-size: clamp(1.5rem, 3.5vw, 2.15rem); font-weight: 400;
          letter-spacing: -0.012em; color: var(--tx-1);
          margin-bottom: 20px; line-height: 1.2;
        }
        .pitch-body {
          font-size: 0.94rem; color: var(--tx-2); line-height: 1.75;
          margin-bottom: 22px; max-width: 820px;
        }

        /* Overline */
        .pitch-overline-el {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.6rem; font-weight: 700; letter-spacing: 0.16em;
          text-transform: uppercase; color: var(--gold); margin-bottom: 10px;
          display: block;
        }

        /* Method grid */
        .pitch-method-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(230px,100%), 1fr)); gap: 10px; }
        .pitch-method-card {
          background: var(--bg-surface); border: 1px solid var(--border-med);
          border-top: 2px solid var(--gold); padding: 18px 16px;
        }
        .pitch-method-num {
          font-family: 'JetBrains Mono', monospace; font-size: 0.6rem;
          color: var(--gold); font-weight: 700; letter-spacing: 0.1em; margin-bottom: 8px;
        }
        .pitch-method-title { font-weight: 700; font-size: 0.88rem; color: var(--tx-1); margin-bottom: 8px; line-height: 1.35; }
        .pitch-method-body { font-size: 0.82rem; color: var(--tx-2); line-height: 1.65; }

        /* Funnel horizontal */
        .pitch-funnel-h {
          display: flex; flex-wrap: wrap; align-items: flex-start;
          gap: 0; margin: 24px 0;
        }
        .pitch-funnel-h-wrap { display: flex; align-items: center; flex: 1 1 160px; }
        .pitch-funnel-h-step {
          flex: 1; padding: 20px 16px; text-align: center;
          background: var(--bg-surface); border: 1px solid var(--border-med);
        }
        .pitch-funnel-h-gold { background: var(--gold-bg); border-color: var(--gold); border-width: 2px; }
        .pitch-funnel-h-n {
          font-family: 'Banana Grotesk', sans-serif; font-size: 1.9rem; font-weight: 800;
          letter-spacing: -0.04em; color: var(--tx-1); line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .pitch-funnel-h-gold .pitch-funnel-h-n { color: var(--gold); }
        .pitch-funnel-h-label { font-size: 0.8rem; font-weight: 600; color: var(--tx-1); margin-top: 4px; }
        .pitch-funnel-h-sub { font-size: 0.68rem; color: var(--tx-3); margin-top: 3px; line-height: 1.4; }
        .pitch-funnel-h-arrow { font-size: 1rem; color: var(--tx-3); padding: 0 8px; flex-shrink: 0; }

        /* Strategy table */
        .pitch-table-wrap {
          overflow-x: auto; border: 1px solid var(--border-med);
          margin-bottom: 12px;
        }
        .pitch-table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
        .pitch-table thead tr {
          background: var(--bg-raised); border-bottom: 1px solid var(--border-med);
        }
        .pitch-table th {
          padding: 10px 12px; font-size: 0.62rem; font-weight: 700;
          color: var(--tx-3); letter-spacing: 0.08em; text-transform: uppercase;
          font-family: 'JetBrains Mono', monospace; white-space: nowrap;
          text-align: center;
        }
        .pitch-table th:first-child { text-align: left; }
        .pitch-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
        .pitch-table-name { min-width: 260px; }
        .pitch-table-num { text-align: center; font-family: 'Banana Grotesk', monospace; white-space: nowrap; font-size: 0.88rem; }
        .pitch-table-sigma { background: var(--gold-bg) !important; }
        .pitch-table-sigma td { border-bottom-color: var(--gold) !important; }
        .pitch-table-best { background: rgba(23,48,92,0.04); }
        .pitch-table-cac { background: var(--bg-raised); border-top: 2px solid var(--border-med); }
        .pitch-table-note {
          font-size: 0.78rem; color: var(--tx-3); line-height: 1.65;
          padding: 10px 14px; background: var(--bg-surface); border: 1px solid var(--border);
        }

        /* Signal zoom */
        .pitch-signal-grid { display: flex; flex-direction: column; gap: 10px; }
        .pitch-signal-card {
          display: grid; grid-template-columns: 48px 1fr 1fr;
          grid-template-rows: auto auto auto;
          gap: 0 16px; padding: 20px 18px;
          background: var(--bg-surface); border: 1px solid var(--border-med);
          border-left: 3px solid var(--gold);
        }
        .pitch-signal-rank {
          grid-column: 1; grid-row: 1 / 4;
          font-family: 'JetBrains Mono', monospace; font-size: 1.4rem; font-weight: 700;
          color: var(--gold); opacity: 0.4; align-self: center;
        }
        .pitch-signal-title { grid-column: 2; grid-row: 1; font-weight: 700; font-size: 0.92rem; color: var(--tx-1); margin-bottom: 6px; }
        .pitch-signal-stat-row { grid-column: 3; grid-row: 1 / 3; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
        .pitch-signal-stat {
          font-family: 'Banana Grotesk', sans-serif; font-size: 1.6rem; font-weight: 800;
          letter-spacing: -0.04em; color: var(--signal-pos); line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .pitch-signal-stat-label { font-size: 0.68rem; color: var(--tx-3); text-align: right; line-height: 1.3; }
        .pitch-signal-sharpe {
          font-size: 0.7rem; font-family: 'JetBrains Mono', monospace;
          color: var(--c-indigo-2); padding: 2px 7px;
          background: rgba(23,48,92,0.08); border-radius: 3px;
        }
        .pitch-signal-body { grid-column: 2 / 4; grid-row: 3; font-size: 0.83rem; color: var(--tx-2); line-height: 1.65; margin-top: 6px; }

        /* Capital cards */
        .pitch-capital-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px,100%), 1fr)); gap: 10px; }
        .pitch-cap-card { background: var(--bg-surface); border: 1px solid var(--border-med); padding: 20px 18px; }
        .pitch-cap-featured { border-color: var(--gold); border-width: 2px; background: var(--gold-bg); }
        .pitch-cap-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .pitch-cap-amount {
          font-family: 'Banana Grotesk', sans-serif; font-size: 1.5rem; font-weight: 800;
          letter-spacing: -0.03em; color: var(--tx-1);
        }
        .pitch-cap-tag {
          font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
          padding: 4px 9px; background: var(--bg-raised); color: var(--tx-3); border: 1px solid var(--border-med);
        }
        .pitch-cap-tag-gold { background: var(--gold); color: #0A0C10; border-color: transparent; }
        .pitch-cap-rows { display: flex; flex-direction: column; }
        .pitch-cap-row { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--border); }
        .pitch-cap-row:last-child { border-bottom: none; }
        .pitch-cap-key { font-size: 0.74rem; color: var(--tx-3); flex-shrink: 0; }
        .pitch-cap-val { font-size: 0.74rem; color: var(--tx-1); font-weight: 600; text-align: right; }
        .pitch-cap-note { margin-top: 14px; padding: 10px 12px; background: var(--bg-raised); font-size: 0.77rem; color: var(--tx-2); line-height: 1.6; }
        .pitch-cap-note-gold { background: rgba(184,149,90,0.1); border: 1px solid rgba(184,149,90,0.2); }

        /* Limits */
        .pitch-limits { display: flex; flex-direction: column; gap: 1px; }
        .pitch-limit-row {
          display: grid; grid-template-columns: 220px 1fr; gap: 20px;
          padding: 14px 0; border-bottom: 1px solid var(--border);
          align-items: baseline;
        }
        .pitch-limit-title { font-weight: 700; font-size: 0.85rem; color: var(--tx-1); }
        .pitch-limit-body { font-size: 0.84rem; color: var(--tx-2); line-height: 1.65; }

        /* CTA */
        .pitch-cta {
          margin-top: 60px; padding: 44px 32px; text-align: center;
          background: linear-gradient(135deg, var(--corporate-bg) 0%, var(--gold-bg) 100%);
          border: 1px solid var(--corporate-bd);
          display: flex; flex-direction: column; align-items: center; gap: 14px;
        }
        .pitch-cta-title {
          font-family: var(--font-dm-serif), Georgia, serif;
          font-size: clamp(1.6rem, 3.5vw, 2.3rem); font-weight: 400;
          letter-spacing: -0.015em; color: var(--tx-1); line-height: 1.1;
        }
        .pitch-cta-body { font-size: 0.9rem; color: var(--tx-2); line-height: 1.65; max-width: 580px; }
        .pitch-cta-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .pitch-btn-gold {
          display: inline-flex; align-items: center; min-height: 44px;
          padding: 12px 22px; background: var(--gold); color: #0A0C10;
          font-weight: 700; font-size: 0.88rem; text-decoration: none;
          letter-spacing: 0.01em; box-shadow: 0 4px 14px rgba(184,149,90,0.28);
        }
        .pitch-btn-ghost {
          display: inline-flex; align-items: center; min-height: 44px;
          padding: 12px 22px; border: 1px solid var(--border-strong);
          color: var(--tx-2); font-weight: 600; font-size: 0.88rem;
          text-decoration: none; background: transparent;
        }
        .pitch-cta-legal { font-size: 0.72rem; color: var(--tx-3); }

        /* Responsive */
        @media (max-width: 700px) {
          .pitch-signal-card { grid-template-columns: 1fr; grid-template-rows: auto; }
          .pitch-signal-rank { display: none; }
          .pitch-signal-stat-row { align-items: flex-start; flex-direction: row; align-items: center; gap: 10px; }
          .pitch-signal-stat-label { text-align: left; }
          .pitch-signal-body { grid-column: 1; grid-row: auto; }
          .pitch-limit-row { grid-template-columns: 1fr; gap: 4px; }
          .pitch-cta { padding: 28px 16px; }
          .pitch-funnel-h-arrow { transform: rotate(90deg); padding: 4px 0; }
          .pitch-funnel-h-wrap { flex-direction: column; flex: 1 1 100%; }
        }
      `}</style>
    </div>
  );
}

function Overline({ children }: { children: React.ReactNode }) {
  return <div className="pitch-overline-el">{children}</div>;
}
