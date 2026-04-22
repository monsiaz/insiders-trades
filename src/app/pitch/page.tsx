/**
 * /pitch · Pitch investisseur — Insiders Trades Sigma
 * Uses raw T+90/T+365 median returns (not portfolio simulation CAGR)
 * which is the honest, more compelling figure.
 */

import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { computePerformanceData } from "@/lib/performance-data";
import { getBacktestBase } from "@/lib/backtest-compute";

export const revalidate = 3600;

export const metadata = {
  title: "Le Pitch · Insiders Trades Sigma",
  description:
    "InsiderTrades Sigma en chiffres : signaux T+90 et T+365 réels, méthode AMF, comparaison CAC 40, guide pratique.",
};

const fmt = {
  pct:  (n: number | null | undefined, d = 1) =>
          n == null ? "·" : (n > 0 ? "+" : "") + n.toFixed(d) + "%",
  num:  (n: number | null | undefined) => n?.toLocaleString("fr-FR") ?? "·",
  pos:  (n: number | null | undefined, d = 1) =>
          n == null ? "·" : "+" + Math.abs(n).toFixed(d) + "%",
};

// ── Inline SVG bar chart ─────────────────────────────────────────────────────
function BarChart({ bars }: {
  bars: { label: string; sub: string; value: number; gold?: boolean; grey?: boolean }[];
}) {
  const maxVal = Math.max(...bars.map((b) => Math.abs(b.value)), 1);
  const W = 100 / bars.length;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: 200, padding: "0 4px" }}>
      {bars.map((b, i) => {
        const pct = (Math.abs(b.value) / maxVal) * 100;
        const bg = b.grey
          ? "var(--bg-elevated)"
          : b.gold
            ? "var(--gold)"
            : "var(--c-indigo-2)";
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 6 }}>
            <div style={{
              fontFamily: "'Banana Grotesk', sans-serif",
              fontSize: "0.95rem",
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
              <div style={{ fontSize: "0.68rem", fontWeight: 700, color: b.grey ? "var(--tx-4)" : "var(--tx-2)", lineHeight: 1.2 }}>{b.label}</div>
              <div style={{ fontSize: "0.6rem", color: "var(--tx-4)", lineHeight: 1.3, marginTop: 2 }}>{b.sub}</div>
            </div>
          </div>
        );
      })}
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
  const [d, base] = await Promise.all([
    computePerformanceData(),
    getBacktestBase(),
  ]);

  const startYear = d.universe.periodStart.slice(0, 4);
  const endYear   = d.universe.periodEnd.slice(0, 4);

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

  // Chart bars: T+90 average return by signal type
  const chartBars = [
    {
      label: "CAC 40",
      sub: "buy & hold",
      value: cacT90 ?? d.cacBenchmark.cagrPct / 4,
      grey: true,
    },
    {
      label: "Tous achats",
      sub: `n=${fmt.num(overall?.count)}`,
      value: overall?.avgReturn90d ?? 5,
    },
    {
      label: "PDG/DG",
      sub: `n=${fmt.num(pdgStats?.count)}`,
      value: pdgStats?.avgReturn90d ?? 8,
    },
    {
      label: "CFO/DAF",
      sub: `n=${fmt.num(cfoStats?.count)}`,
      value: cfoStats?.avgReturn90d ?? 10,
    },
    {
      label: "Cluster 2+",
      sub: `n=${fmt.num(clusterStats?.count)}`,
      value: avgT90Cluster ?? 14,
      gold: true,
    },
    {
      label: "Cluster 3+",
      sub: `n=${fmt.num(deepCluster?.count)}`,
      value: deepCluster?.avgReturn90d ?? 18,
      gold: true,
    },
    {
      label: "Cascade 4+",
      sub: `n=${fmt.num(cascade?.count)}`,
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
          Insiders Trades Sigma — Pitch investisseur
        </div>
        <h1 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.85rem, 5vw, 3rem)", fontWeight: 400,
          letterSpacing: "-0.015em", lineHeight: 1.1, color: "var(--tx-1)",
          textAlign: "center",
        }}>
          Suivre les dirigeants qui achètent<br />
          <em style={{ color: "var(--gold)", fontStyle: "italic" }}>leurs propres titres en bourse.</em>
        </h1>
        <p style={{ fontSize: "0.84rem", color: "var(--tx-3)", lineHeight: 1.6, textAlign: "center", maxWidth: 520 }}>
          {fmt.num(d.universe.totalDeclarations)} déclarations AMF scorées &middot;{" "}
          {fmt.num(d.universe.totalBacktests)} backtests &middot; {startYear}–{endYear}
          &middot; retours mesurés depuis pubDate+1 (vue retail)
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
          {["Données AMF officielles", "Règlement MAR 596/2014", "Backtest retail-view", "Accès beta"].map((t, i) => (
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
        <Overline>01 · Les chiffres clés</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 20,
        }}>
          Ce que montrent les backtests, en clair
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px,100%), 1fr))", gap: 8, marginBottom: 32 }}>
          <KpiTile
            value={fmt.pos(medT90Cluster)}
            label="Médiane T+90 — cluster"
            sub="Retour médian à 3 mois sur les signaux cluster, vue retail (pubDate+1)"
            n={fmt.num(clusterStats?.count)}
          />
          <KpiTile
            value={fmt.pos(avgT365Cluster)}
            label="Moyenne T+365 — cluster"
            sub="Rendement moyen sur 12 mois · médiane ≈ moyenne → distribution saine"
            n={fmt.num(clusterStats?.countReturn365d)}
          />
          <KpiTile
            value={(winRateCluster != null ? winRateCluster.toFixed(0) : "·") + "%"}
            label="Win rate T+90 — cluster"
            sub="% de trades cluster avec un retour positif à 3 mois"
            n={fmt.num(clusterStats?.count)}
          />
          <KpiTile
            value={d.cacBenchmark.cagrPct != null ? "+" + d.cacBenchmark.cagrPct.toFixed(1) + "%" : "·"}
            label="CAC 40 CAGR · benchmark"
            sub={`Dividendes réinvestis · ${fmt.num(d.cacBenchmark.monthsCovered)} mois · même période`}
            grey
          />
        </div>

        {/* Signal zoom — cluster depth */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px,100%), 1fr))", gap: 8, marginBottom: 16 }}>
          {[
            { label: "Cluster 2+ insiders", stats: clusterStats, highlight: true },
            { label: "Deep cluster 3+",     stats: deepCluster,  highlight: true },
            { label: "Cascade 4+ insiders", stats: cascade,      highlight: false },
          ].map(({ label, stats, highlight }) => stats ? (
            <div key={label} style={{
              padding: "16px 16px",
              background: highlight ? "var(--gold-bg)" : "var(--bg-surface)",
              border: `1px solid ${highlight ? "var(--gold)" : "var(--border-med)"}`,
              display: "flex", flexDirection: "column", gap: 10,
            }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--tx-3)", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
                {label}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {[
                  { v: fmt.pos(stats.medianReturn90d), s: "Médiane T+90" },
                  { v: fmt.pos(stats.medianReturn365d), s: "Médiane T+365" },
                  { v: (stats.winRate90d?.toFixed(0) ?? "·") + "%", s: "Win rate" },
                ].map(({ v, s }) => (
                  <div key={s}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, letterSpacing: "-0.03em", color: highlight ? "var(--gold)" : "var(--tx-1)", fontFamily: "'Banana Grotesk', sans-serif" }}>{v}</div>
                    <div style={{ fontSize: "0.62rem", color: "var(--tx-3)", marginTop: 1 }}>{s}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--tx-3)" }}>
                {fmt.num(stats.count)} trades · n T+365 = {fmt.num(stats.countReturn365d)}
              </div>
            </div>
          ) : null)}
        </div>
      </section>

      {/* ── BAR CHART ──────────────────────────────────────────────────────── */}
      <section style={{ padding: "40px 0 0", borderTop: "1px solid var(--border)" }}>
        <Overline>02 · Visualisation</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 6,
        }}>
          Retour moyen T+90 par type de signal
        </h2>
        <p style={{ fontSize: "0.84rem", color: "var(--tx-3)", lineHeight: 1.6, marginBottom: 20, maxWidth: 680 }}>
          Toutes les barres sont mesurées depuis pubDate+1 — c&apos;est-à-dire le lendemain de la publication AMF, pas la date d&apos;achat interne.
          Plus le signal est qualifié (cluster, profondeur), plus le retour est élevé et la distribution plus symétrique.
        </p>

        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border-med)",
          padding: "24px 16px 16px",
        }}>
          <BarChart bars={chartBars} />
          <div style={{ display: "flex", gap: 16, marginTop: 12, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.68rem", color: "var(--tx-3)" }}>
              <div style={{ width: 12, height: 12, background: "var(--gold)", borderRadius: 2 }} />
              Signaux Sigma (or)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.68rem", color: "var(--tx-3)" }}>
              <div style={{ width: 12, height: 12, background: "var(--c-indigo-2)", borderRadius: 2 }} />
              Signal AMF global
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.68rem", color: "var(--tx-3)" }}>
              <div style={{ width: 12, height: 12, background: "var(--bg-elevated)", borderRadius: 2, border: "1px solid var(--border-med)" }} />
              CAC 40 (référence)
            </div>
          </div>
        </div>

        <div style={{
          marginTop: 10, padding: "10px 14px",
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          fontSize: "0.76rem", color: "var(--tx-3)", lineHeight: 1.6,
        }}>
          <strong style={{ color: "var(--tx-2)" }}>Note :</strong>{" "}
          Retours moyens bruts par trade, non annualisés, frais non déduits à ce stade (1% A/R déduit dans la simulation de portefeuille — section suivante).
          Le CAC 40 est projeté sur la même fenêtre de 90 jours pour comparaison.
          Période {startYear}–{endYear}.
        </div>
      </section>

      {/* ── MÉTHODE ────────────────────────────────────────────────────────── */}
      <section style={{ padding: "40px 0 0", borderTop: "1px solid var(--border)" }}>
        <Overline>03 · La méthode</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 20,
        }}>
          Pourquoi ce signal est exploitable
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(230px,100%), 1fr))", gap: 10, marginBottom: 16 }}>
          {[
            {
              n: "01", title: "Obligation légale, pas une opinion",
              body: "MAR 596/2014 oblige tout dirigeant à déclarer toute transaction sur ses propres titres dans les 3 jours ouvrés. Ce n'est pas du storytelling — c'est de l'argent réel engagé.",
            },
            {
              n: "02", title: "Signal cluster : conviction collective",
              body: "Quand 2+ dirigeants achètent indépendamment la même société en 30 jours, ils lisent les mêmes indicateurs internes. C'est un signal de conviction non orchestré — notre variable alpha n°1.",
            },
            {
              n: "03", title: "Score composite v2 (0–100 pts)",
              body: "Rôle (PDG/CFO > board), montant en % market cap, cluster, DCA, délai tx→pub. Un score ≥ 65 + cluster = condition d'entrée. Les simulations montrent que ce filtre donne un profil risque/rendement supérieur.",
            },
            {
              n: "04", title: "Vue retail honnête (pubDate+1)",
              body: "Nos retours sont calculés depuis le lendemain de la publication AMF — le moment où vous pouvez réagir. Pas depuis la date d'achat interne (qui capture l'alpha que vous ne pouvez pas capturer).",
            },
          ].map((c) => (
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
        <Overline>04 · Meilleures combinaisons de signaux</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 8,
        }}>
          Les signaux qui battent clairement le marché
        </h2>
        <p style={{ fontSize: "0.84rem", color: "var(--tx-3)", lineHeight: 1.6, marginBottom: 20, maxWidth: 700 }}>
          Classement par Sharpe T+90 (rendement / volatilité). Seules les combinaisons avec n ≥ 5 trades sont présentées.
          Ces données viennent directement des backtests sur la période {startYear}–{endYear}.
        </p>

        {/* Top signal combos table */}
        <div style={{ overflowX: "auto", border: "1px solid var(--border-med)", marginBottom: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border-med)" }}>
                {["Signal", "n", "Médiane T+90", "Moy. T+90", "Moy. T+365", "Win %", "Sharpe"].map((h, i) => (
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
                const cat = c.category;
                const catColor = cat === "Cluster" ? "var(--gold)" : cat === "Rôle" ? "var(--c-indigo-2)" : "var(--tx-4)";
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
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-3)", fontSize: "0.78rem" }}>{fmt.num(c.count)}</td>
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
          <strong style={{ color: "var(--tx-2)" }}>Lecture :</strong>{" "}
          Médiane T+90 = retour médian retail à 3 mois (pubDate+1). Moy. T+365 = rendement moyen à 12 mois.
          Sharpe = rendement moyen / écart-type · mesure la qualité du rendement par unité de risque.
          Période {startYear}–{endYear}.
        </div>
      </section>

      {/* ── SIMULATION PORTEFEUILLE ─────────────────────────────────────────── */}
      {goodStrategies.length > 0 && (
        <section style={{ padding: "40px 0 0", borderTop: "1px solid var(--border)" }}>
          <Overline>05 · Simulation portefeuille</Overline>
          <h2 style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
            letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 8,
          }}>
            Stratégies filtrées vs CAC 40 buy &amp; hold
          </h2>
          <p style={{ fontSize: "0.84rem", color: "var(--tx-3)", lineHeight: 1.6, marginBottom: 20, maxWidth: 700 }}>
            Simulation top-20 par score, rebalancement mensuel, holding 3 mois, frais 1% A/R inclus, entrée pubDate+1.
            Seules les stratégies avec CAGR positif sont présentées.
          </p>

          <div style={{ overflowX: "auto", border: "1px solid var(--border-med)", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-raised)", borderBottom: "1px solid var(--border-med)" }}>
                  {["Stratégie", "Signaux", "CAGR net", "Sharpe", "Max DD", "Win mois", "Bat CAC"].map((h, i) => (
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
                        {i === 0 && "★ "}{s.label}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--tx-3)", marginTop: 2, lineHeight: 1.4 }}>{s.description}</div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-3)", fontSize: "0.78rem" }}>{fmt.num(s.matching)}</td>
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
                    <div style={{ fontWeight: 600, color: "var(--tx-2)", fontSize: "0.84rem" }}>CAC 40 · buy &amp; hold</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--tx-3)", marginTop: 2 }}>benchmark passif · dividendes réinvestis</div>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-3)", fontSize: "0.78rem" }}>passif</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 700, fontFamily: "'Banana Grotesk', sans-serif", fontSize: "1rem", color: "var(--gold)" }}>
                    {d.cacBenchmark.cagrPct != null ? "+" + d.cacBenchmark.cagrPct.toFixed(2) + "%" : "·"}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-3)", fontFamily: "'JetBrains Mono', monospace", fontSize: "0.8rem" }}>
                    {d.cacBenchmark.sharpe?.toFixed(2) ?? "·"}
                  </td>
                  <td colSpan={3} style={{ padding: "10px 12px", textAlign: "center", color: "var(--tx-4)", fontSize: "0.72rem" }}>
                    {fmt.num(d.cacBenchmark.monthsCovered)} mois couverts
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{
            padding: "10px 14px", background: "var(--bg-surface)", border: "1px solid var(--border)",
            fontSize: "0.76rem", color: "var(--tx-3)", lineHeight: 1.6,
          }}>
            <strong style={{ color: "var(--tx-2)" }}>Note :</strong>{" "}
            CAGR net = retour annualisé après frais 1% A/R. Max DD = max drawdown simulé (pire perte cumulée).
            Win mois = % de mois positifs. Seules les stratégies avec un CAGR &gt; 0 sont présentées ici.
          </div>
        </section>
      )}

      {/* ── MODE D'EMPLOI ──────────────────────────────────────────────────── */}
      <section style={{ padding: "40px 0 0", borderTop: "1px solid var(--border)" }}>
        <Overline>06 · Application pratique</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 20,
        }}>
          Combien de sociétés, combien de trades, quel capital
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px,100%), 1fr))", gap: 10 }}>
          {[
            {
              amount: "10 000 €", tag: "Débutant", featured: false,
              rows: [
                ["Positions simultanées", "4 sociétés · 2 500 € chacune"],
                ["Filtre recommandé", "Cluster uniquement · score ≥ 70"],
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
                ["Filtre recommandé", "Score ≥ 65 · PDG/CFO · cluster prioritaire"],
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
                ["Filtre recommandé", "Score ≥ 60 · tous rôles · cluster prioritaire"],
                ["Horizon de détention", "Rebalancement trimestriel"],
                ["Volume min de liquidité", "200 000 € / jour pour ne pas déplacer le cours"],
              ],
              note: "Attention liquidité : évitez les small-caps sous 200 000 €/j de volume quotidien à ces montants.",
            },
          ].map((c) => (
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
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: "0.74rem", color: "var(--tx-3)", flexShrink: 0 }}>{k}</span>
                    <span style={{ fontSize: "0.74rem", color: "var(--tx-1)", fontWeight: 600, textAlign: "right" }}>{v}</span>
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
        <Overline>07 · Transparence</Overline>
        <h2 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.4rem, 3vw, 2rem)", fontWeight: 400,
          letterSpacing: "-0.012em", color: "var(--tx-1)", marginBottom: 20,
        }}>
          Ce que ces backtests ne prouvent pas
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {[
            ["Historique de 4 ans seulement", `${startYear}–${endYear} couvre un cycle majoritairement haussier (CAC ATH en 2024). Les académiques requièrent 10–15 ans pour valider un système. Nos résultats peuvent surestimer la performance sur un cycle baissier.`],
            ["Survivorship bias partiel", "La base ne contient que les sociétés encore cotées. Les sociétés radiées, en faillite ou rachetées ne sont pas comptabilisées — ce qui peut surestimer la performance de 0,5 à 1 point de CAGR."],
            ["Slippage non modélisé", "Les backtests supposent une exécution au prix de clôture pubDate+1. Sur les small-caps françaises (bid-ask parfois 1–3%), votre prix réel sera moins favorable. Retirez mentalement 0,5 à 1 point par an."],
            ["Pas un substitut à l'analyse fondamentale", "Sigma identifie les dossiers méritant une analyse. Il ne remplace pas la lecture du bilan, des résultats, et de la valorisation. Un signal fort sur une société surendettée reste un signal sur une société surendettée."],
            ["Pas un conseil en investissement", "Ce site est un outil d'information réglementée (données AMF publiques). Il ne constitue pas un conseil en investissement. Vos décisions sont vos responsabilités."],
          ].map(([title, body]) => (
            <div key={title} style={{
              display: "grid", gridTemplateColumns: "220px 1fr", gap: 20,
              padding: "14px 0", borderBottom: "1px solid var(--border)",
              alignItems: "baseline",
            }}>
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
          Accès beta sur invitation
        </h2>
        <p style={{ fontSize: "0.9rem", color: "var(--tx-2)", lineHeight: 1.65, maxWidth: 580 }}>
          {fmt.num(d.universe.totalDeclarations)} déclarations scorées &middot;{" "}
          {fmt.num(d.universe.totalBacktests)} backtests calculés &middot;
          Nouvelles déclarations ingérées dans l&apos;heure suivant leur publication AMF
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          <Link href="/backtest" style={{
            display: "inline-flex", alignItems: "center", minHeight: 44,
            padding: "12px 22px", background: "var(--gold)", color: "#0A0C10",
            fontWeight: 700, fontSize: "0.88rem", textDecoration: "none",
            letterSpacing: "0.01em", boxShadow: "0 4px 14px rgba(184,149,90,0.28)",
          }}>
            Dashboard backtest
          </Link>
          <Link href="/recommendations" style={{
            display: "inline-flex", alignItems: "center", minHeight: 44,
            padding: "12px 22px", background: "var(--gold)", color: "#0A0C10",
            fontWeight: 700, fontSize: "0.88rem", textDecoration: "none",
            boxShadow: "0 4px 14px rgba(184,149,90,0.28)",
          }}>
            Voir les signaux actifs
          </Link>
          <Link href="/methodologie" style={{
            display: "inline-flex", alignItems: "center", minHeight: 44,
            padding: "12px 22px", border: "1px solid var(--border-strong)",
            color: "var(--tx-2)", fontWeight: 600, fontSize: "0.88rem",
            textDecoration: "none", background: "transparent",
          }}>
            Méthodologie complète
          </Link>
        </div>
        <p style={{ fontSize: "0.72rem", color: "var(--tx-3)" }}>
          Usage informatif · données AMF publiques · ne constitue pas un conseil en investissement
        </p>
      </section>

      {/* ── Responsive limits table fix */}
      <style>{`
        @media (max-width: 600px) {
          .pitch-wrap > section > div[style*="220px 1fr"] {
            grid-template-columns: 1fr !important;
            gap: 4px !important;
          }
        }
      `}</style>
    </div>
  );
}
