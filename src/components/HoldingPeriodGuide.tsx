/**
 * HoldingPeriodGuide
 *
 * Explains why insider signals work best at short / medium-term horizons.
 * Used on: /strategie · /performance · /methodologie
 *
 * DA: Sigma gold + tx vars, JetBrains Mono labels, responsive grid via hpg-* classes.
 */

import React from "react";

/* ── data ──────────────────────────────────────────────────────────────────── */

const ROWS = {
  fr: [
    { horizon: "T+30 j",   dot: "var(--tx-4)",       action: "Conserver",         actionColor: "var(--tx-3)",      why: "Le signal n'est pas encore pricé — trop tôt pour sortir." },
    { horizon: "T+60–90 j",dot: "var(--signal-pos)",  action: "Prise de profits ★", actionColor: "var(--signal-pos)", why: "Zone optimale selon les backtests : alpha maximal, win rate au pic." },
    { horizon: "T+180 j",  dot: "var(--gold)",        action: "Réévaluer",          actionColor: "var(--gold)",      why: "Vérifier si un nouveau signal actif renforce la thèse, sinon réduire." },
    { horizon: "T+365 j+", dot: "var(--signal-neg)",  action: "Sortir",             actionColor: "var(--signal-neg)", why: "Signal épuisé ; la macro et le bruit sectoriel dominent désormais." },
  ],
  en: [
    { horizon: "T+30 d",   dot: "var(--tx-4)",       action: "Hold",               actionColor: "var(--tx-3)",      why: "Signal not yet priced by the market — too early to exit." },
    { horizon: "T+60–90 d",dot: "var(--signal-pos)",  action: "Take profits ★",     actionColor: "var(--signal-pos)", why: "Optimal window per backtests: peak alpha, highest win rate." },
    { horizon: "T+180 d",  dot: "var(--gold)",        action: "Reassess",           actionColor: "var(--gold)",      why: "Check if a new active signal reinforces the thesis; otherwise trim." },
    { horizon: "T+365 d+", dot: "var(--signal-neg)",  action: "Exit",               actionColor: "var(--signal-neg)", why: "Insider signal is spent; macro and sector noise now dominate." },
  ],
};

const REASONS = {
  fr: [
    { icon: "⚡", title: "Fenêtre d'information temporaire",  body: "Quand un dirigeant achète, il agit sur un avantage informationnel (résultats, contrat, acquisition…). Cette information est publiée dans les 30–90 jours — après, l'avantage disparaît." },
    { icon: "📉", title: "Le signal se dilue dans le temps",   body: "À T+365, d'autres facteurs (macro, secteur, marchés globaux) écrasent progressivement le signal insider. L'alpha mesuré chute significativement au-delà de 180 jours." },
    { icon: "💸", title: "Coût d'opportunité",                 body: "Rester investi trop longtemps immobilise du capital qui ne travaille plus. Chaque semaine d'attente est une semaine sans capturer le prochain signal fort." },
    { icon: "🔄", title: "Les initiés eux-mêmes sortent",      body: "Les données AMF montrent que les dirigeants sont souvent des traders tactiques : entrée courte, sortie 6–18 mois plus tard pour des raisons fiscales ou personnelles." },
  ],
  en: [
    { icon: "⚡", title: "Information window is temporary",    body: "When an insider buys, they act on a private edge (earnings, contract, acquisition…). That information gets published within 30–90 days — the edge disappears after that." },
    { icon: "📉", title: "Signal fades over time",             body: "Beyond T+365, macro, sector, and global market factors progressively overwhelm the insider signal. Measured alpha drops sharply after 180 days." },
    { icon: "💸", title: "Opportunity cost",                   body: "Staying invested too long ties up capital that stops working. Every week on hold is a week you can't deploy on the next strong signal." },
    { icon: "🔄", title: "Insiders exit too",                  body: "AMF data shows insiders are often tactical traders: short entry window, selling 6–18 months later for tax or personal reasons." },
  ],
};

const COPY = {
  fr: {
    eyebrow:    "Gestion de position",
    title:      "Pourquoi vendre à horizon court / moyen terme ?",
    intro:      "Les signaux d'initiés ont un avantage informationnel fort, mais temporaire. Le respecter, c'est maximiser les rendements et limiter les risques exogènes.",
    thHeaders:  ["Horizon", "Action recommandée", "Pourquoi"],
    alertTitle: "Règle pratique",
    alertBody:  "Visez une sortie entre T+60 et T+90 jours après la date de publication AMF. Si un nouveau signal actif sur la même valeur apparaît avant T+90, réévaluez avant de vendre.",
    whyLabel:   "Les 4 raisons clés",
  },
  en: {
    eyebrow:    "Position management",
    title:      "Why sell at short / medium-term horizon?",
    intro:      "Insider signals carry a strong but time-limited informational edge. Respecting that window maximises returns and limits exogenous risk.",
    thHeaders:  ["Horizon", "Recommended action", "Why"],
    alertTitle: "Practical rule",
    alertBody:  "Target an exit between T+60 and T+90 days after the AMF publication date. If a new active signal on the same stock appears before T+90, reassess before selling.",
    whyLabel:   "The 4 key reasons",
  },
};

/* ── component ─────────────────────────────────────────────────────────────── */

export function HoldingPeriodGuide({ locale = "fr" }: { locale?: "fr" | "en" }) {
  const isFr = locale === "fr";
  const lang    = isFr ? "fr" : "en";
  const rows    = ROWS[lang];
  const reasons = REASONS[lang];
  const c       = COPY[lang];

  return (
    <section className="hpg-section" aria-labelledby="hpg-title">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <p className="hpg-eyebrow">{c.eyebrow}</p>
      <h2 id="hpg-title" className="hpg-title">{c.title}</h2>
      <p className="hpg-intro">{c.intro}</p>

      {/* ── Timeline table ────────────────────────────────────────────────── */}
      <div className="hpg-table-wrap">
        <div className="hpg-thead">
          {c.thHeaders.map((h) => (
            <div key={h} className="hpg-th">{h}</div>
          ))}
        </div>

        {rows.map((row, i) => (
          <div key={row.horizon} className="hpg-row" style={{ borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none" }}>
            {/* Horizon */}
            <div className="hpg-cell hpg-cell-horizon">
              <span className="hpg-dot" style={{ background: row.dot }} />
              <span className="hpg-mono">{row.horizon}</span>
            </div>
            {/* Action */}
            <div className="hpg-cell hpg-cell-action" style={{ color: row.actionColor }}>
              {row.action}
            </div>
            {/* Why */}
            <div className="hpg-cell hpg-cell-why">{row.why}</div>
          </div>
        ))}
      </div>

      {/* ── Gold alert banner ─────────────────────────────────────────────── */}
      <div className="hpg-alert">
        <span className="hpg-alert-star" aria-hidden="true">★</span>
        <div>
          <p className="hpg-alert-title">{c.alertTitle}</p>
          <p className="hpg-alert-body">{c.alertBody}</p>
        </div>
      </div>

      {/* ── 4-reason grid ─────────────────────────────────────────────────── */}
      <p className="hpg-why-label">{c.whyLabel}</p>
      <div className="hpg-reasons">
        {reasons.map((r) => (
          <div key={r.title} className="hpg-reason-card">
            <div className="hpg-reason-header">
              <span className="hpg-reason-icon">{r.icon}</span>
              <span className="hpg-reason-title">{r.title}</span>
            </div>
            <p className="hpg-reason-body">{r.body}</p>
          </div>
        ))}
      </div>

    </section>
  );
}
