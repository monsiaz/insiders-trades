/**
 * /fonctionnement · Public marketing + explainer page.
 *
 * Long-form, visually rich, animated (pure SVG/CSS · no canvas) walkthrough
 * of how Insiders Trades Sigma works. Intended to be the landing page
 * linked from the site footer for non-authenticated visitors.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { HowItWorksAnimations } from "@/components/HowItWorksAnimations";
import { LogoMark } from "@/components/Logo";
import { PipelineDiagram } from "./_components/PipelineDiagram";
import { ScoringWheel } from "./_components/ScoringWheel";
import { BacktestCurve } from "./_components/BacktestCurve";
import { SignalRadar } from "./_components/SignalRadar";

export const dynamic = "force-dynamic"; // locale-aware: prevents FR/EN cache conflict on shared internal route

export async function generateMetadata() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";
  return {
    title: isFr
      ? "Comment ça marche · Insiders Trades Sigma"
      : "How it works · Insiders Trades Sigma",
    description: isFr
      ? "Découvrez comment Insiders Trades Sigma transforme les déclarations AMF des dirigeants en signaux d'investissement actionnables. Collecte, scoring, backtest historique, recommandations."
      : "Discover how Insiders Trades Sigma turns executive AMF filings into actionable investment signals. Data collection, scoring, historical backtesting, recommendations.",
  };
}

// ── Shared UI primitives ─────────────────────────────────────────────────────

function Eyebrow({ children, color = "var(--gold)" }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.66rem",
        fontWeight: 700,
        color,
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
  children,
  mt = "clamp(48px, 8vw, 100px)",
}: {
  id?: string;
  children: React.ReactNode;
  mt?: string;
}) {
  return (
    <section id={id} style={{ marginTop: mt }}>
      {children}
    </section>
  );
}

function FeatureCard({
  eyebrow,
  title,
  body,
  accent = "var(--gold)",
}: {
  eyebrow: string;
  title: string;
  body: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: `3px solid ${accent}`,
        padding: "18px 22px",
        borderRadius: "3px",
      }}
    >
      <Eyebrow color={accent}>{eyebrow}</Eyebrow>
      <h3
        style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "1.3rem",
          fontWeight: 400,
          color: "var(--tx-1)",
          letterSpacing: "-0.01em",
          marginBottom: "10px",
          lineHeight: 1.2,
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: "0.92rem", color: "var(--tx-2)", lineHeight: 1.65, margin: 0 }}>
        {body}
      </p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function FonctionnementPage() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";

  const T = isFr ? {
    heroEyebrow: "Comment ça marche",
    heroLine1: "Le signal des initiés,",
    heroLine2: "pour tout le monde",
    ctaBeta: "Accéder à la beta →",
    ctaMethodo: "Méthodologie détaillée ↗",
    whyEyebrow: "Le constat",
    whyH2Line1: "Les initiés en savent plus.",
    whyH2Line2: "Leurs trades sont publics",
    prob1Eyebrow: "Problème · 01",
    prob1Title: "Les PDF AMF sont illisibles",
    prob1Body: "Des milliers de déclarations format texte, sans standardisation, sans tickers, sans ISIN propre. Impossible à traiter manuellement.",
    prob2Eyebrow: "Problème · 02",
    prob2Title: "Aucun contexte financier",
    prob2Body: "Un achat de 100k€ a-t-il du sens sur une société de 10Md€ ? Sans le ratio, le signal est inutile. Les PDF ne contiennent pas la capitalisation.",
    prob3Eyebrow: "Problème · 03",
    prob3Title: "Aucune validation historique",
    prob3Body: "La question clé reste ouverte : quand un PDG achète, le titre monte-t-il vraiment ? Il faut un backtest sur 22 000+ trades historiques pour le dire.",
    pipelineEyebrow: "Pipeline",
    pipelineH2Main: "De la déclaration AMF",
    pipelineH2Italic: "au signal actionnable",
    pipelineBody: "Six étapes automatisées, toutes horodatées et reproductibles. Ce schéma s\u0027anime pour montrer le flux réel des données.",
    stepsEyebrow: "Quatre moments clés",
    stepsBody: "Chaque étape est visualisée ci-dessous avec les vraies données du site.",
    scoringEyebrow: "Scoring composite",
    scoringH2Line1: "Sept composantes",
    scoringH2Line2: "pour un score sur 100",
    scoringBody1: "Chaque déclaration est scorée sur 100 points avec un barème déterministe et transparent. La roue à droite illustre la pondération exacte de chaque composante.",
    scoringLi1Strong: "% capitalisation",
    scoringLi1Tail: ", un achat qui pèse 1% du mcap compte plus qu\u0027un achat symbolique",
    scoringLi2Strong: "% flux de l\u0027insider",
    scoringLi2Tail: " · est-ce son plus gros mouvement sur ce titre ?",
    scoringLi3Strong: "Fonction",
    scoringLi3Tail: " · PDG > CFO > Directeur > Membre du CA",
    scoringLi4Strong: "Cluster",
    scoringLi4Tail: " · plusieurs dirigeants en ±30 jours ?",
    scoringLi5Strong: "Conviction",
    scoringLi5Tail: " · l\u0027insider est-il net-acheteur cumulé ?",
    scoringLi6Strong: "Fondamentaux",
    scoringLi6Tail: " · consensus analyste, P/E, leverage",
    scoringLi7Strong: "Signaux composites Yahoo",
    scoringLi7Tail: " · 8 flags additionnels (momentum, value, qualité, upside\u2026)",
    backtestEyebrow: "Backtest rigoureux",
    backtestH2Line1: "22 620 trades testés,",
    backtestH2Line2: "six horizons",
    backtestP2: "Prix fournis par Yahoo Finance avec une fenêtre de tolérance de ±12 jours pour éviter les week-ends, jours fériés et suspensions de cotation. Aucune extrapolation.",
    backtestP3: "Les recommandations qui s\u0027affichent sur le site sont filtrées selon les statistiques historiques : seuls les profils avec un retour moyen ≥ +4% à T+90 sont présentés comme signaux d\u0027achat.",
    signalEyebrow: "Le signal final",
    signalH2Main: "Radar visuel des",
    signalH2Italic: "signaux actifs",
    signalBody: "Chaque point représente un signal réel · achat (vert) ou vente (rouge) · positionné par son score et son % de mcap.",
    useCasesEyebrow: "Cas d\u0027usage",
    useCasesH2Line1: "Qui utilise Sigma,",
    useCasesH2Line2: "et pour quoi",
    uc1Eyebrow: "Profil · Investisseur long terme",
    uc1Title: "Repérer les convictions fortes",
    uc1Body: "Les achats groupés de PDG et CFO sur leur propre société, avec un ticket supérieur à 500k€, sont historiquement suivis d\u0027une surperformance à 6-12 mois. Le site pré-filtre ces cas.",
    uc2Eyebrow: "Profil · Trader actif",
    uc2Title: "Surveiller son portfolio",
    uc2Body: "Importez vos positions, et recevez par email chaque matin les mouvements d\u0027insiders survenus sur vos titres dans les 48h. Signaux de vente inclus.",
    uc3Eyebrow: "Profil · Analyste",
    uc3Title: "Explorer 10 ans d\u0027historique",
    uc3Body: "Toutes les déclarations depuis 2015 avec leur backtest T+30/90/365 sont consultables. Filtres par secteur, taille, rôle, type de transaction.",
    stackEyebrow: "Sources & stack",
    stackTitle: "Données 100% publiques, méthodologie 100% documentée",
    stackAmfDesc: "Source primaire · MAR 596/2014",
    stackYahooDesc: "Prix, fondamentaux, consensus",
    stackGoogleDesc: "Actualités sociétés FR",
    stackOpenaiDesc: "Normalisation + validation logos",
    regEyebrow: "Réglementation",
    regH2: "Qui doit déclarer, quoi, et pourquoi ?",
    legalEyebrow: "Fondement juridique",
    legalTitle: "Règlement UE n°596/2014 · Article 19 (MAR)",
    whoLabel: "Qui doit déclarer",
    whatLabel: "Transactions concernées",
    whenLabel: "Délais & seuils",
    dirVsShareLabel: "Dirigeants vs Actionnaires : deux régimes distincts",
    faqEyebrow: "Questions fréquentes",
    faqH2: "Tout ce que vous vous demandez",
    ctaH2Line1: "Prêt à voir ce que les dirigeants achètent",
    ctaH2Line2: "avant que les marchés ne réagissent",
    ctaBtn1: "Se connecter à la beta →",
    ctaBtn2: "Tout savoir sur la méthodologie ↗",
    kf1Label: "déclarations AMF",  kf1Sub: "depuis 2015",
    kf2Label: "sociétés suivies",  kf2Sub: "cotées FR",
    kf3Label: "backtests réalisés", kf3Sub: "T+30 à T+730",
    kf4Label: "sociétés enrichies", kf4Sub: "fondamentaux Yahoo",
  } : {
    heroEyebrow: "How it works",
    heroLine1: "The insider signal,",
    heroLine2: "for everyone",
    ctaBeta: "Access the beta →",
    ctaMethodo: "Detailed methodology ↗",
    whyEyebrow: "The reality",
    whyH2Line1: "Insiders know more.",
    whyH2Line2: "Their trades are public",
    prob1Eyebrow: "Problem · 01",
    prob1Title: "AMF filings are unreadable",
    prob1Body: "Thousands of plain-text filings, with no standardisation, no tickers, no clean ISINs. Impossible to process manually.",
    prob2Eyebrow: "Problem · 02",
    prob2Title: "No financial context",
    prob2Body: "Does a €100k purchase make sense for a €10bn company? Without the ratio, the signal is useless. PDFs don't include market cap.",
    prob3Eyebrow: "Problem · 03",
    prob3Title: "No historical validation",
    prob3Body: "The key question remains open: when a CEO buys, does the stock actually rise? You need a backtest on 22,000+ historical trades to answer that.",
    pipelineEyebrow: "Pipeline",
    pipelineH2Main: "From the AMF filing",
    pipelineH2Italic: "to an actionable signal",
    pipelineBody: "Six automated steps, all timestamped and reproducible. This diagram animates to show the real data flow.",
    stepsEyebrow: "Four key stages",
    stepsBody: "Each stage is visualised below using real site data.",
    scoringEyebrow: "Composite scoring",
    scoringH2Line1: "Seven components",
    scoringH2Line2: "for a score out of 100",
    scoringBody1: "Every filing is scored out of 100 points using a deterministic, transparent rubric. The wheel on the right illustrates the exact weighting of each component.",
    scoringLi1Strong: "% of market cap",
    scoringLi1Tail: " — a purchase worth 1% of market cap counts more than a symbolic one",
    scoringLi2Strong: "% of insider flow",
    scoringLi2Tail: " · is this their largest move on this stock?",
    scoringLi3Strong: "Role",
    scoringLi3Tail: " · CEO > CFO > Director > Board member",
    scoringLi4Strong: "Cluster",
    scoringLi4Tail: " · multiple executives within ±30 days?",
    scoringLi5Strong: "Conviction",
    scoringLi5Tail: " · is the insider a net cumulative buyer?",
    scoringLi6Strong: "Fundamentals",
    scoringLi6Tail: " · analyst consensus, P/E, leverage",
    scoringLi7Strong: "Yahoo composite signals",
    scoringLi7Tail: " · 8 additional flags (momentum, value, quality, upside\u2026)",
    backtestEyebrow: "Rigorous backtesting",
    backtestH2Line1: "22,620 trades tested,",
    backtestH2Line2: "six horizons",
    backtestP2: "Prices sourced from Yahoo Finance with a ±12-day tolerance window to account for weekends, public holidays and trading suspensions. No extrapolation.",
    backtestP3: "Recommendations shown on the site are filtered by historical statistics: only profiles with a mean return ≥ +4% at T+90 are presented as buy signals.",
    signalEyebrow: "The final signal",
    signalH2Main: "Visual radar of",
    signalH2Italic: "active signals",
    signalBody: "Each dot represents a real signal · buy (green) or sell (red) · positioned by its score and % of market cap.",
    useCasesEyebrow: "Use cases",
    useCasesH2Line1: "Who uses Sigma,",
    useCasesH2Line2: "and what for",
    uc1Eyebrow: "Profile · Long-term investor",
    uc1Title: "Identify strong convictions",
    uc1Body: "Clustered buys from CEOs and CFOs on their own company, with tickets above €500k, have historically been followed by outperformance over 6–12 months. The site pre-filters these cases.",
    uc2Eyebrow: "Profile · Active trader",
    uc2Title: "Monitor your portfolio",
    uc2Body: "Import your positions and receive an email every morning with insider moves on your stocks in the past 48h. Sell signals included.",
    uc3Eyebrow: "Profile · Analyst",
    uc3Title: "Explore 10 years of history",
    uc3Body: "All filings since 2015 with their T+30/90/365 backtest are browsable. Filters by sector, size, role, transaction type.",
    stackEyebrow: "Sources & stack",
    stackTitle: "100% public data, 100% documented methodology",
    stackAmfDesc: "Primary source · MAR 596/2014",
    stackYahooDesc: "Prices, fundamentals, consensus",
    stackGoogleDesc: "French company news",
    stackOpenaiDesc: "Normalisation + logo validation",
    regEyebrow: "Regulation",
    regH2: "Who must disclose, what, and why?",
    legalEyebrow: "Legal basis",
    legalTitle: "EU Regulation No 596/2014 · Article 19 (MAR)",
    whoLabel: "Who must disclose",
    whatLabel: "Covered transactions",
    whenLabel: "Deadlines & thresholds",
    dirVsShareLabel: "Executives vs shareholders: two distinct regimes",
    faqEyebrow: "Frequently asked questions",
    faqH2: "Everything you might wonder",
    ctaH2Line1: "Ready to see what executives are buying",
    ctaH2Line2: "before markets react",
    ctaBtn1: "Log in to the beta →",
    ctaBtn2: "Read the full methodology ↗",
    kf1Label: "AMF filings",     kf1Sub: "since 2015",
    kf2Label: "companies tracked", kf2Sub: "listed in France",
    kf3Label: "backtests run",   kf3Sub: "T+30 to T+730",
    kf4Label: "companies enriched", kf4Sub: "Yahoo fundamentals",
  };

  const faqItems = isFr ? FAQ_ITEMS_FR : FAQ_ITEMS_EN;

  return (
    <div className="content-wrapper">
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          paddingTop: "24px",
          paddingBottom: "40px",
          textAlign: "center",
          position: "relative",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}>
          <LogoMark size={52} />
        </div>
        <Eyebrow>{T.heroEyebrow}</Eyebrow>
        <h1
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(2.25rem, 6vw, 4.5rem)",
            fontWeight: 400,
            letterSpacing: "-0.015em",
            lineHeight: 1.03,
            color: "var(--tx-1)",
            marginBottom: "18px",
          }}
        >
          {T.heroLine1}<br />
          <span style={{ fontStyle: "italic", color: "var(--gold)" }}>{T.heroLine2}</span>.
        </h1>
        <p
          style={{
            fontSize: "clamp(1rem, 2.3vw, 1.15rem)",
            color: "var(--tx-2)",
            maxWidth: "640px",
            margin: "0 auto 28px",
            lineHeight: 1.65,
          }}
        >
          {isFr ? (
            <>Les dirigeants de sociétés cotées françaises sont obligés de déclarer leurs achats
            et ventes à l&apos;AMF. Nous transformons ces déclarations publiques, mais rarement
            exploitées · en signaux classés, backtestés et personnalisés.</>
          ) : (
            <>Executives of listed French companies are required to report their purchases and
            sales to the AMF (French financial regulator). We transform these public but
            rarely-exploited filings · into ranked, backtested, personalised signals.</>
          )}
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/auth/login"
            style={{
              display: "inline-flex", alignItems: "center", minHeight: "44px",
              padding: "12px 24px",
              background: "var(--gold)",
              color: "#0A0C10",
              fontWeight: 700,
              fontSize: "0.9rem",
              borderRadius: "3px",
              textDecoration: "none",
              letterSpacing: "0.01em",
              boxShadow: "0 4px 16px rgba(184,149,90,0.30)",
            }}
          >
            {T.ctaBeta}
          </Link>
          <Link
            href="/methodologie/"
            style={{
              display: "inline-flex", alignItems: "center", minHeight: "44px",
              padding: "12px 24px",
              border: "1px solid var(--border-strong)",
              color: "var(--tx-2)",
              fontWeight: 600,
              fontSize: "0.9rem",
              borderRadius: "3px",
              textDecoration: "none",
              letterSpacing: "0.01em",
              background: "transparent",
            }}
          >
            {T.ctaMethodo}
          </Link>
        </div>
        <KeyFigures isFr={isFr} />
      </section>

      {/* ── WHY ──────────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Eyebrow>{T.whyEyebrow}</Eyebrow>
          <h2
            style={{
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              fontSize: "clamp(1.75rem, 4vw, 2.6rem)",
              fontWeight: 400,
              letterSpacing: "-0.012em",
              color: "var(--tx-1)",
              marginBottom: "14px",
              lineHeight: 1.15,
            }}
          >
            {T.whyH2Line1}<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>{T.whyH2Line2}</span>.
          </h2>
          <p
            style={{
              fontSize: "0.98rem",
              color: "var(--tx-2)",
              maxWidth: "680px",
              margin: "0 auto",
              lineHeight: 1.65,
            }}
          >
            {isFr ? (
              <>Depuis le règlement européen <strong style={{ color: "var(--tx-1)" }}>MAR 596/2014</strong>,
              tout dirigeant d&apos;une société cotée doit déclarer ses transactions à l&apos;AMF sous 3 jours.
              Ces données sont publiques, mais éparpillées dans des milliers de PDF, sans scoring, sans
              historique, sans méthode d&apos;évaluation.</>
            ) : (
              <>Under European regulation <strong style={{ color: "var(--tx-1)" }}>MAR 596/2014</strong>,
              every executive of a listed company must disclose their transactions to the AMF (French
              financial regulator) within 3 business days. This data is public, but scattered across
              thousands of PDFs, with no scoring, no history, no evaluation framework.</>
            )}
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "14px",
          }}
        >
          <FeatureCard
            eyebrow={T.prob1Eyebrow}
            title={T.prob1Title}
            body={T.prob1Body}
            accent="var(--signal-neg)"
          />
          <FeatureCard
            eyebrow={T.prob2Eyebrow}
            title={T.prob2Title}
            body={T.prob2Body}
            accent="var(--signal-neg)"
          />
          <FeatureCard
            eyebrow={T.prob3Eyebrow}
            title={T.prob3Title}
            body={T.prob3Body}
            accent="var(--signal-neg)"
          />
        </div>
      </Section>

      {/* ── PIPELINE DIAGRAM (animated) ───────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Eyebrow>{T.pipelineEyebrow}</Eyebrow>
          <h2
            style={{
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              fontSize: "clamp(1.75rem, 4vw, 2.6rem)",
              fontWeight: 400,
              letterSpacing: "-0.012em",
              color: "var(--tx-1)",
              marginBottom: "10px",
              lineHeight: 1.15,
            }}
          >
            {T.pipelineH2Main} <span style={{ fontStyle: "italic", color: "var(--gold)" }}>{T.pipelineH2Italic}</span>
          </h2>
          <p
            style={{
              fontSize: "0.96rem",
              color: "var(--tx-2)",
              maxWidth: "620px",
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            {T.pipelineBody}
          </p>
        </div>
        <PipelineDiagram />
      </Section>

      {/* ── FOUR STEPS (existing HowItWorksAnimations) ────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <Eyebrow>{T.stepsEyebrow}</Eyebrow>
          <h2
            style={{
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              fontSize: "clamp(1.75rem, 4vw, 2.6rem)",
              fontWeight: 400,
              letterSpacing: "-0.012em",
              color: "var(--tx-1)",
              marginBottom: "10px",
              lineHeight: 1.15,
            }}
          >
            {isFr ? "Collecte · Scoring · Backtest · " : "Collect · Score · Backtest · "}<span style={{ fontStyle: "italic", color: "var(--gold)" }}>Signal</span>
          </h2>
          <p
            style={{
              fontSize: "0.96rem",
              color: "var(--tx-2)",
              maxWidth: "620px",
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            {T.stepsBody}
          </p>
        </div>
        <HowItWorksAnimations />
      </Section>

      {/* ── SCORING WHEEL ─────────────────────────────────────────────────── */}
      <Section>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
            gap: "40px",
            alignItems: "center",
          }}
          className="fct-two-col"
        >
          <div>
            <Eyebrow>{T.scoringEyebrow}</Eyebrow>
            <h2
              style={{
                fontFamily: "var(--font-dm-serif), Georgia, serif",
                fontSize: "clamp(1.6rem, 3.5vw, 2.35rem)",
                fontWeight: 400,
                letterSpacing: "-0.012em",
                color: "var(--tx-1)",
                marginBottom: "14px",
                lineHeight: 1.15,
              }}
            >
              {T.scoringH2Line1}<br />
              <span style={{ fontStyle: "italic", color: "var(--gold)" }}>{T.scoringH2Line2}</span>
            </h2>
            <p style={{ fontSize: "0.95rem", color: "var(--tx-2)", lineHeight: 1.7, marginBottom: "14px" }}>
              {T.scoringBody1}
            </p>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
                fontSize: "0.88rem",
                color: "var(--tx-2)",
                lineHeight: 1.9,
              }}
            >
              <li>
                <strong style={{ color: "var(--tx-1)" }}>{T.scoringLi1Strong}</strong>{T.scoringLi1Tail}
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>{T.scoringLi2Strong}</strong>{T.scoringLi2Tail}
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>{T.scoringLi3Strong}</strong>{T.scoringLi3Tail}
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>{T.scoringLi4Strong}</strong>{T.scoringLi4Tail}
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>{T.scoringLi5Strong}</strong>{T.scoringLi5Tail}
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>{T.scoringLi6Strong}</strong>{T.scoringLi6Tail}
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>{T.scoringLi7Strong}</strong>{T.scoringLi7Tail}
              </li>
            </ul>
          </div>
          <ScoringWheel />
        </div>
      </Section>

      {/* ── BACKTEST CURVE ────────────────────────────────────────────────── */}
      <Section>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
            gap: "40px",
            alignItems: "center",
          }}
          className="fct-two-col"
        >
          <BacktestCurve />
          <div>
            <Eyebrow color="var(--gold)">{T.backtestEyebrow}</Eyebrow>
            <h2
              style={{
                fontFamily: "var(--font-dm-serif), Georgia, serif",
                fontSize: "clamp(1.6rem, 3.5vw, 2.35rem)",
                fontWeight: 400,
                letterSpacing: "-0.012em",
                color: "var(--tx-1)",
                marginBottom: "14px",
                lineHeight: 1.15,
              }}
            >
              {T.backtestH2Line1}<br />
              <span style={{ fontStyle: "italic", color: "var(--gold)" }}>{T.backtestH2Line2}</span>
            </h2>
            <p style={{ fontSize: "0.95rem", color: "var(--tx-2)", lineHeight: 1.7, marginBottom: "14px" }}>
              {isFr ? (
                <>Pour chaque déclaration, nous mesurons le rendement à <strong style={{ color: "var(--tx-1)" }}>T+30, T+60, T+90,
                T+160, T+365 et T+730</strong> jours calendaires. Aucune donnée future ne pollue le scoring
                historique (zéro look-ahead bias).</>
              ) : (
                <>For each filing, we measure the return at <strong style={{ color: "var(--tx-1)" }}>T+30, T+60, T+90,
                T+160, T+365 and T+730</strong> calendar days. No future data pollutes the historical scoring
                (zero look-ahead bias).</>
              )}
            </p>
            <p style={{ fontSize: "0.95rem", color: "var(--tx-2)", lineHeight: 1.7, marginBottom: "14px" }}>
              {T.backtestP2}
            </p>
            <p style={{ fontSize: "0.95rem", color: "var(--tx-2)", lineHeight: 1.7, marginBottom: 0 }}>
              {T.backtestP3}
            </p>
          </div>
        </div>
      </Section>

      {/* ── SIGNAL RADAR (live-ish visual) ────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Eyebrow>{T.signalEyebrow}</Eyebrow>
          <h2
            style={{
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              fontSize: "clamp(1.75rem, 4vw, 2.6rem)",
              fontWeight: 400,
              letterSpacing: "-0.012em",
              color: "var(--tx-1)",
              marginBottom: "10px",
              lineHeight: 1.15,
            }}
          >
            {T.signalH2Main} <span style={{ fontStyle: "italic", color: "var(--gold)" }}>{T.signalH2Italic}</span>
          </h2>
          <p
            style={{
              fontSize: "0.95rem",
              color: "var(--tx-2)",
              maxWidth: "600px",
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            {T.signalBody}
          </p>
        </div>
        <SignalRadar />
      </Section>

      {/* ── USE CASES ─────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Eyebrow>{T.useCasesEyebrow}</Eyebrow>
          <h2
            style={{
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              fontSize: "clamp(1.75rem, 4vw, 2.6rem)",
              fontWeight: 400,
              letterSpacing: "-0.012em",
              color: "var(--tx-1)",
              marginBottom: "10px",
              lineHeight: 1.15,
            }}
          >
            {T.useCasesH2Line1}<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>{T.useCasesH2Line2}</span>
          </h2>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "14px",
          }}
        >
          <FeatureCard
            eyebrow={T.uc1Eyebrow}
            title={T.uc1Title}
            body={T.uc1Body}
            accent="var(--gold)"
          />
          <FeatureCard
            eyebrow={T.uc2Eyebrow}
            title={T.uc2Title}
            body={T.uc2Body}
            accent="var(--gold)"
          />
          <FeatureCard
            eyebrow={T.uc3Eyebrow}
            title={T.uc3Title}
            body={T.uc3Body}
            accent="var(--c-indigo-2)"
          />
        </div>
      </Section>

      {/* ── STACK / TRUST ─────────────────────────────────────────────────── */}
      <Section>
        <div
          className="fct-stack"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-med)",
            borderLeft: "3px solid var(--gold)",
            padding: "28px 32px",
            borderRadius: "3px",
          }}
        >
          <Eyebrow>{T.stackEyebrow}</Eyebrow>
          <h3
            style={{
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              fontSize: "1.4rem",
              fontWeight: 400,
              color: "var(--tx-1)",
              marginBottom: "16px",
              lineHeight: 1.2,
            }}
          >
            {T.stackTitle}
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
              marginBottom: "14px",
            }}
          >
            <TrustItem label="AMF BDIF" desc={T.stackAmfDesc} />
            <TrustItem label="Yahoo Finance" desc={T.stackYahooDesc} />
            <TrustItem label="Google News" desc={T.stackGoogleDesc} />
            <TrustItem label="OpenAI" desc={T.stackOpenaiDesc} />
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--tx-3)", lineHeight: 1.6, margin: 0 }}>
            {isFr ? (
              <>Tout notre processus est documenté en détail sur la page{" "}
              <Link href="/methodologie/" style={{ color: "var(--gold)", fontWeight: 600, textDecoration: "underline" }}>
                méthodologie
              </Link>
              . Les calculs sont déterministes. Le code s&apos;appuie sur Next.js, React, Prisma, Postgres (Neon)
              et Vercel. Aucune boîte noire.</>
            ) : (
              <>Our entire process is documented in detail on the{" "}
              <Link href="/methodologie/" style={{ color: "var(--gold)", fontWeight: 600, textDecoration: "underline" }}>
                methodology
              </Link>
              {" "}page. Calculations are deterministic. The code uses Next.js, React, Prisma, Postgres (Neon)
              and Vercel. No black box.</>
            )}
          </p>
        </div>
      </Section>

      {/* ── CADRE RÉGLEMENTAIRE ───────────────────────────────────────────── */}
      <Section id="reglementation">
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Eyebrow color="var(--c-sky, #38bdf8)">{T.regEyebrow}</Eyebrow>
          <h2
            style={{
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              fontSize: "clamp(1.75rem, 4vw, 2.6rem)",
              fontWeight: 400,
              letterSpacing: "-0.012em",
              color: "var(--tx-1)",
              lineHeight: 1.15,
              marginBottom: "16px",
            }}
          >
            {T.regH2}
          </h2>
          <p style={{ color: "var(--tx-2)", fontSize: "1.05rem", maxWidth: "680px", margin: "0 auto", lineHeight: 1.65 }}>
            {isFr ? (
              <>Le règlement européen MAR (Market Abuse Regulation) impose une transparence totale
              sur les transactions des personnes les mieux informées d&apos;une société cotée.
              Voici l&apos;essentiel du cadre légal que Sigma exploite.</>
            ) : (
              <>The European regulation MAR (Market Abuse Regulation) mandates full transparency on
              transactions by those with the best information inside a listed company.
              Here is the essential legal framework that Sigma leverages.</>
            )}
          </p>
        </div>

        {/* MAR Article 19 highlight */}
        <div
          style={{
            background: "linear-gradient(135deg, rgba(56,189,248,0.06) 0%, var(--bg-surface) 100%)",
            border: "1px solid rgba(56,189,248,0.2)",
            borderLeft: "3px solid rgba(56,189,248,0.6)",
            borderRadius: "3px",
            padding: "24px 28px",
            marginBottom: "28px",
            maxWidth: "860px",
            margin: "0 auto 28px",
          }}
        >
            <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.62rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "rgba(56,189,248,0.7)",
              marginBottom: "8px",
            }}
          >
            {T.legalEyebrow}
          </div>
          <p style={{ color: "var(--tx-1)", fontSize: "1rem", fontWeight: 600, marginBottom: "6px" }}>
            {T.legalTitle}
          </p>
          <p style={{ color: "var(--tx-2)", fontSize: "0.9rem", lineHeight: 1.65 }}>
            {isFr ? (
              <>En vigueur depuis le 3 juillet 2016, le MAR remplace et unifie les législations nationales
              sur les abus de marché dans toute l&apos;Union européenne. En France, il est mis en oeuvre
              et contrôlé par l&apos;<strong style={{ color: "var(--tx-1)" }}>Autorité des Marchés Financiers (AMF)</strong>.
              Les déclarations sont publiées dans la base BDIF (Banque de Données &amp; d&apos;Informations Financières).</>
            ) : (
              <>In force since 3 July 2016, MAR replaces and harmonises national market-abuse laws across
              the EU. In France, it is implemented and enforced by the{" "}
              <strong style={{ color: "var(--tx-1)" }}>Autorité des Marchés Financiers (AMF — French financial regulator)</strong>.
              Filings are published in the BDIF database (Banque de Données &amp; d&apos;Informations Financières).</>
            )}
          </p>
        </div>

        {/* 3 colonnes : qui / quoi / quand */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            maxWidth: "860px",
            margin: "0 auto 32px",
          }}
        >
          {/* QUI */}
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-med)",
              borderRadius: "3px",
              padding: "22px 20px",
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.6rem",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--gold)",
                marginBottom: "10px",
              }}
            >
              {T.whoLabel}
            </div>
            <ul style={{ color: "var(--tx-2)", fontSize: "0.88rem", lineHeight: 1.7, paddingLeft: "16px", margin: 0 }}>
              {isFr ? (
                <>
                  <li>
                    <strong style={{ color: "var(--tx-1)" }}>PDMRs</strong> (Personnes Exerçant des
                    Responsabilités Dirigeantes) : PDG, DG, directeurs financiers, membres du conseil
                    d&apos;administration ou de surveillance
                  </li>
                  <li style={{ marginTop: "8px" }}>
                    <strong style={{ color: "var(--tx-1)" }}>PCAs</strong> (Personnes Étroitement
                    Associées) : conjoint/partenaire PACS, enfants à charge, parents sous le même toit
                    depuis +1 an, entités juridiques contrôlées par le PDMR
                  </li>
                  <li style={{ marginTop: "8px" }}>
                    Les <strong style={{ color: "var(--tx-1)" }}>actionnaires franchissant des seuils</strong>{" "}
                    (5%, 10%, 15%, 20%, 25%, 30%, 33⅓%, 50%, 66⅔%, 90%, 95%) font l&apos;objet
                    de déclarations <em>distinctes</em> (L.233-7 du Code de commerce)
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <strong style={{ color: "var(--tx-1)" }}>PDMRs</strong> (Persons Discharging
                    Managerial Responsibilities): CEOs, CFOs, directors, members of the board of
                    directors or supervisory board
                  </li>
                  <li style={{ marginTop: "8px" }}>
                    <strong style={{ color: "var(--tx-1)" }}>PCAs</strong> (Persons Closely
                    Associated): spouse/civil partner, dependent children, relatives sharing the same
                    household for at least 1 year, legal entities controlled by the PDMR
                  </li>
                  <li style={{ marginTop: "8px" }}>
                    <strong style={{ color: "var(--tx-1)" }}>Shareholders crossing thresholds</strong>{" "}
                    (5%, 10%, 15%, 20%, 25%, 30%, 33⅓%, 50%, 66⅔%, 90%, 95%) are subject to
                    <em> separate</em> disclosures (French Commercial Code L.233-7)
                  </li>
                </>
              )}
            </ul>
          </div>

          {/* QUOI */}
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-med)",
              borderRadius: "3px",
              padding: "22px 20px",
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.6rem",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--gold)",
                marginBottom: "10px",
              }}
            >
              {T.whatLabel}
            </div>
            <ul style={{ color: "var(--tx-2)", fontSize: "0.88rem", lineHeight: 1.7, paddingLeft: "16px", margin: 0 }}>
              {isFr ? (
                <>
                  <li>Acquisitions et cessions d&apos;actions ou d&apos;instruments de dette</li>
                  <li style={{ marginTop: "6px" }}>Exercice d&apos;options ou de BSA (bons de souscription)</li>
                  <li style={{ marginTop: "6px" }}>Souscriptions dans le cadre d&apos;augmentations de capital</li>
                  <li style={{ marginTop: "6px" }}>Produits dérivés liés aux titres de l&apos;émetteur</li>
                  <li style={{ marginTop: "6px" }}>Donations (même à titre gratuit)</li>
                  <li style={{ marginTop: "6px" }}>Transactions réalisées par un gestionnaire de portefeuille mandaté</li>
                </>
              ) : (
                <>
                  <li>Acquisitions and disposals of shares or debt instruments</li>
                  <li style={{ marginTop: "6px" }}>Exercise of options or warrants (BSA)</li>
                  <li style={{ marginTop: "6px" }}>Subscriptions in capital increases</li>
                  <li style={{ marginTop: "6px" }}>Derivative products linked to the issuer&apos;s securities</li>
                  <li style={{ marginTop: "6px" }}>Donations (even gratuitous)</li>
                  <li style={{ marginTop: "6px" }}>Transactions carried out by a mandated portfolio manager</li>
                </>
              )}
            </ul>
          </div>

          {/* QUAND / SEUILS */}
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-med)",
              borderRadius: "3px",
              padding: "22px 20px",
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.6rem",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--gold)",
                marginBottom: "10px",
              }}
            >
              {T.whenLabel}
            </div>
            <ul style={{ color: "var(--tx-2)", fontSize: "0.88rem", lineHeight: 1.7, paddingLeft: "16px", margin: 0 }}>
              {isFr ? (
                <>
                  <li>
                    <strong style={{ color: "var(--tx-1)" }}>Délai de déclaration :</strong>{" "}
                    3 jours ouvrés après la date de la transaction
                  </li>
                  <li style={{ marginTop: "8px" }}>
                    <strong style={{ color: "var(--tx-1)" }}>Seuil de déclenchement :</strong>{" "}
                    20 000 € cumulés par an et par personne (relevé de 5 000 € par l&apos;EU Listing Act
                    2024 — les États membres peuvent ajuster entre 10 000 € et 50 000 €)
                  </li>
                  <li style={{ marginTop: "8px" }}>
                    <strong style={{ color: "var(--tx-1)" }}>Périodes d&apos;interdiction :</strong>{" "}
                    30 jours calendaires avant l&apos;annonce des résultats semestriels ou annuels
                    (« closed periods ») — sauf dérogations AMF strictement encadrées
                  </li>
                  <li style={{ marginTop: "8px" }}>
                    <strong style={{ color: "var(--tx-1)" }}>Publication par l&apos;émetteur :</strong>{" "}
                    2 jours ouvrés après réception pour rendre l&apos;information publique
                  </li>
                </>
              ) : (
                <>
                  <li>
                    <strong style={{ color: "var(--tx-1)" }}>Reporting deadline:</strong>{" "}
                    3 business days after the transaction date
                  </li>
                  <li style={{ marginTop: "8px" }}>
                    <strong style={{ color: "var(--tx-1)" }}>Triggering threshold:</strong>{" "}
                    €20,000 cumulated per year per person (raised from €5,000 by the EU Listing Act
                    2024 — member states may set their own threshold between €10,000 and €50,000)
                  </li>
                  <li style={{ marginTop: "8px" }}>
                    <strong style={{ color: "var(--tx-1)" }}>Closed periods:</strong>{" "}
                    30 calendar days before the announcement of half-year or annual results
                    — except strictly framed AMF exemptions
                  </li>
                  <li style={{ marginTop: "8px" }}>
                    <strong style={{ color: "var(--tx-1)" }}>Issuer publication:</strong>{" "}
                    2 business days after receipt to make the information public
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        {/* Actionnaires vs Dirigeants */}
        <div
          style={{
            maxWidth: "860px",
            margin: "0 auto",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-med)",
            borderRadius: "3px",
            padding: "22px 28px",
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.6rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "var(--gold)",
              marginBottom: "12px",
            }}
          >
            {T.dirVsShareLabel}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            {isFr ? (
              <>
                <div>
                  <p style={{ color: "var(--tx-1)", fontSize: "0.88rem", fontWeight: 600, marginBottom: "6px" }}>
                    Déclarations Dirigeants (BDIF · type DIRIGEANTS)
                  </p>
                  <p style={{ color: "var(--tx-2)", fontSize: "0.84rem", lineHeight: 1.65 }}>
                    C&apos;est le <strong style={{ color: "var(--gold)" }}>cœur de Sigma</strong>. Ces déclarations
                    révèlent les achats et ventes personnels des PDG, CFO et membres de conseil. Leur valeur
                    informative est maximale : le dirigeant connaît ses propres chiffres mieux que tout analyste.
                    Sigma en couvre <strong style={{ color: "var(--tx-1)" }}>585 sociétés françaises cotées</strong>.
                  </p>
                </div>
                <div>
                  <p style={{ color: "var(--tx-1)", fontSize: "0.88rem", fontWeight: 600, marginBottom: "6px" }}>
                    Déclarations de Franchissement de Seuils (type SEUILS)
                  </p>
                  <p style={{ color: "var(--tx-2)", fontSize: "0.84rem", lineHeight: 1.65 }}>
                    Tout actionnaire — personne physique ou fonds — franchissant 5%, 10%... du capital ou
                    des droits de vote doit le notifier à l&apos;AMF sous 4 jours de bourse. Ces déclarations
                    signalent l&apos;entrée ou la sortie de blocs institutionnels. Sigma les collecte aussi,
                    mais leur analyse est distincte des transactions dirigeants.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p style={{ color: "var(--tx-1)", fontSize: "0.88rem", fontWeight: 600, marginBottom: "6px" }}>
                    Executive filings (BDIF · type DIRIGEANTS)
                  </p>
                  <p style={{ color: "var(--tx-2)", fontSize: "0.84rem", lineHeight: 1.65 }}>
                    This is the <strong style={{ color: "var(--gold)" }}>core of Sigma</strong>. These filings
                    reveal the personal buys and sells of CEOs, CFOs and board members. Their informational
                    value is maximal: executives know their own numbers better than any analyst.
                    Sigma covers <strong style={{ color: "var(--tx-1)" }}>585 listed French companies</strong>.
                  </p>
                </div>
                <div>
                  <p style={{ color: "var(--tx-1)", fontSize: "0.88rem", fontWeight: 600, marginBottom: "6px" }}>
                    Threshold-crossing filings (type SEUILS)
                  </p>
                  <p style={{ color: "var(--tx-2)", fontSize: "0.84rem", lineHeight: 1.65 }}>
                    Any shareholder — individual or fund — crossing 5%, 10%… of the capital or
                    voting rights must notify the AMF (French financial regulator) within 4 trading days.
                    These filings signal the entry or exit of institutional blocks. Sigma collects them too,
                    but their analysis is separate from executive transactions.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sanctions */}
        <div
          style={{
            maxWidth: "860px",
            margin: "20px auto 0",
            display: "flex",
            gap: "12px",
            alignItems: "flex-start",
            background: "var(--bg-surface)",
            border: "1px solid var(--border-med)",
            borderRadius: "3px",
            padding: "18px 24px",
          }}
        >
          <div style={{ fontSize: "1.1rem", flexShrink: 0, marginTop: "2px" }}>⚖</div>
          <p style={{ color: "var(--tx-3)", fontSize: "0.82rem", lineHeight: 1.65 }}>
            {isFr ? (
              <><strong style={{ color: "var(--tx-2)" }}>Sanctions :</strong> Le défaut de déclaration ou
              la déclaration tardive expose le dirigeant à une sanction administrative de l&apos;AMF pouvant
              atteindre <strong style={{ color: "var(--tx-2)" }}>100 000 €</strong>, ainsi qu&apos;à des
              poursuites pénales pour délit d&apos;initié si la transaction repose sur une information
              privilégiée (jusqu&apos;à 100 M€ d&apos;amende et 7 ans d&apos;emprisonnement, Article L.465-1 du Code monétaire
              et financier). C&apos;est pourquoi les dirigeants déclarent en général rapidement et correctement.</>
            ) : (
              <><strong style={{ color: "var(--tx-2)" }}>Penalties:</strong> Failure to disclose or late
              reporting exposes the executive to an administrative sanction from the AMF of up to{" "}
              <strong style={{ color: "var(--tx-2)" }}>€100,000</strong>, as well as criminal prosecution
              for insider trading if the transaction was based on privileged information (up to €100M fine
              and 7 years imprisonment, Article L.465-1 of the French Monetary and Financial Code).
              This is why executives generally report promptly and accurately.</>
            )}
          </p>
        </div>
      </Section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Eyebrow>{T.faqEyebrow}</Eyebrow>
          <h2
            style={{
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              fontSize: "clamp(1.75rem, 4vw, 2.6rem)",
              fontWeight: 400,
              letterSpacing: "-0.012em",
              color: "var(--tx-1)",
              lineHeight: 1.15,
            }}
          >
            {T.faqH2}
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "820px", margin: "0 auto" }}>
          {faqItems.map((it, i) => (
            <details
              key={i}
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-med)",
                borderRadius: "3px",
                padding: "14px 18px",
              }}
            >
              <summary
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--tx-1)",
                  cursor: "pointer",
                  listStyle: "none",
                  letterSpacing: "-0.005em",
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                }}
              >
                {it.q}
              </summary>
              <div
                style={{
                  fontSize: "0.9rem",
                  color: "var(--tx-2)",
                  lineHeight: 1.7,
                  marginTop: "10px",
                  paddingTop: "10px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                {it.a}
              </div>
            </details>
          ))}
        </div>
      </Section>

      {/* ── FINAL CTA ─────────────────────────────────────────────────────── */}
      <Section mt="80px">
        <div
          className="fct-cta"
          style={{
            padding: "40px 32px",
            textAlign: "center",
            background:
              "linear-gradient(135deg, var(--corporate-bg) 0%, var(--gold-bg) 100%)",
            border: "1px solid var(--corporate-bd)",
            borderRadius: "3px",
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-dm-serif), Georgia, serif",
              fontSize: "clamp(1.75rem, 4vw, 2.4rem)",
              fontWeight: 400,
              letterSpacing: "-0.012em",
              color: "var(--tx-1)",
              marginBottom: "12px",
              lineHeight: 1.15,
            }}
          >
            {T.ctaH2Line1}<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>{T.ctaH2Line2}</span> ?
          </h2>
          <p
            style={{
              fontSize: "1rem",
              color: "var(--tx-2)",
              maxWidth: "560px",
              margin: "0 auto 22px",
              lineHeight: 1.6,
            }}
          >
            {isFr ? (
              <>Phase bêta privée. L&apos;accès est sur invitation pour le moment.
              Connectez-vous ou laissez vos coordonnées à l&apos;administrateur pour rejoindre la liste.</>
            ) : (
              <>Private beta. Access is by invitation only.
              Log in or contact the administrator to join the list.</>
            )}
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href="/auth/login"
              style={{
                display: "inline-flex", alignItems: "center", minHeight: "44px",
                padding: "13px 26px",
                background: "var(--gold)",
                color: "#0A0C10",
                fontWeight: 700,
                fontSize: "0.92rem",
                borderRadius: "3px",
                textDecoration: "none",
                letterSpacing: "0.01em",
                boxShadow: "0 4px 16px rgba(184,149,90,0.35)",
              }}
            >
              {T.ctaBtn1}
            </Link>
            <Link
              href="/methodologie/"
              style={{
                display: "inline-flex", alignItems: "center", minHeight: "44px",
                padding: "13px 26px",
                border: "1px solid var(--border-strong)",
                color: "var(--tx-2)",
                fontWeight: 600,
                fontSize: "0.92rem",
                borderRadius: "3px",
                textDecoration: "none",
                background: "transparent",
              }}
            >
              {T.ctaBtn2}
            </Link>
          </div>
        </div>
      </Section>

      {/* Scoped responsive tweaks */}
      <style>{`
        @media (max-width: 820px) {
          .fct-two-col { grid-template-columns: 1fr !important; gap: 24px !important; }
        }
        @media (max-width: 640px) {
          .fct-cta   { padding: 24px 16px !important; }
          .fct-stack { padding: 20px 16px !important; }
        }
      `}</style>
    </div>
  );
}

// ── Hero key figures ─────────────────────────────────────────────────────────

function KeyFigures({ isFr }: { isFr: boolean }) {
  const figs = isFr ? [
    { v: "25 500+", l: "déclarations AMF", s: "depuis 2015" },
    { v: "585",     l: "sociétés suivies", s: "cotées FR" },
    { v: "22 620",  l: "backtests réalisés", s: "T+30 à T+730" },
    { v: "86%",     l: "sociétés enrichies", s: "fondamentaux Yahoo" },
  ] : [
    { v: "25,500+", l: "AMF filings", s: "since 2015" },
    { v: "585",     l: "companies tracked", s: "listed in France" },
    { v: "22,620",  l: "backtests run", s: "T+30 to T+730" },
    { v: "86%",     l: "companies enriched", s: "Yahoo fundamentals" },
  ];
  return (
    <div
      style={{
        marginTop: "40px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: "14px",
        maxWidth: "720px",
        marginInline: "auto",
      }}
    >
      {figs.map((f) => (
        <div
          key={f.l}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-med)",
            borderLeft: "2px solid var(--gold)",
            padding: "12px 16px",
            borderRadius: "2px",
            textAlign: "left",
          }}
        >
          <div
            style={{
              fontFamily: "'Banana Grotesk', sans-serif",
              fontSize: "1.55rem",
              fontWeight: 700,
              color: "var(--gold)",
              letterSpacing: "-0.035em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {f.v}
          </div>
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--tx-3)",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 600,
              marginTop: "4px",
            }}
          >
            {f.l}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--tx-4)", marginTop: "2px" }}>{f.s}</div>
        </div>
      ))}
    </div>
  );
}

function TrustItem({ label, desc }: { label: string; desc: string }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-inter), sans-serif",
          fontSize: "0.95rem",
          fontWeight: 700,
          color: "var(--tx-1)",
          letterSpacing: "-0.01em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "0.78rem", color: "var(--tx-3)", marginTop: "2px" }}>{desc}</div>
    </div>
  );
}

const FAQ_ITEMS_FR = [
  {
    q: "Qui exactement est obligé de déclarer ses transactions à l'AMF ?",
    a: (
      <>
        <strong>Deux catégories sont visées par l&apos;Article 19 du règlement MAR (UE 596/2014) :</strong>
        <br /><br />
        <strong style={{ color: "var(--tx-1)" }}>1. Les PDMRs</strong> (Personnes Exerçant des
        Responsabilités Dirigeantes) : toute personne occupant un rôle exécutif ou non-exécutif senior
        avec accès régulier à des informations privilégiées et pouvoir de décision —
        PDG, DG délégué, Directeur Financier, membres du CA ou du Conseil de Surveillance.
        <br /><br />
        <strong style={{ color: "var(--tx-1)" }}>2. Les PCAs</strong> (Personnes Étroitement Associées) :
        conjoint/partenaire enregistré, enfants à charge, autres membres de la famille sous le même
        toit depuis au moins un an, et toute entité juridique dont le PDMR détient le contrôle ou
        qui a été constituée à son profit.
        <br /><br />
        Les simples actionnaires ne sont <em>pas</em> concernés par MAR Art. 19 — sauf s&apos;ils
        franchissent des seuils de participation (5%, 10%... du capital), auquel cas d&apos;autres
        obligations déclaratives s&apos;appliquent (Code de commerce L.233-7).
      </>
    ),
  },
  {
    q: "À partir de quel montant une transaction doit-elle être déclarée ?",
    a: (
      <>
        Le seuil de déclaration a été <strong>relevé de 5 000 € à 20 000 €</strong> cumulés par année
        civile par le <em>EU Listing Act</em> (entré en vigueur en 2024). Ce seuil est calculé en
        additionnant toutes les transactions de l&apos;année sans compensation (achats + ventes comptent
        chacun séparément).
        <br /><br />
        Les États membres ont la flexibilité de fixer leur propre seuil entre{" "}
        <strong>10 000 € et 50 000 €</strong>. La France, via l&apos;AMF, peut donc choisir un seuil
        différent de 20 000 €.
        <br /><br />
        Une fois le seuil dépassé, <strong>chaque transaction ultérieure</strong> de l&apos;année doit
        être déclarée individuellement, même si elle est de 1 €.
        <br /><br />
        <strong>Délai :</strong> notification à l&apos;AMF et à l&apos;émetteur dans les{" "}
        <strong>3 jours ouvrés</strong> suivant la date de transaction. L&apos;émetteur dispose ensuite
        de 2 jours ouvrés pour rendre l&apos;information publique via le BDIF.
      </>
    ),
  },
  {
    q: "Est-ce légal d'utiliser ces données ?",
    a: (
      <>
        <strong>Entièrement légal.</strong> Les déclarations AMF sont publiques par définition ·
        c&apos;est l&apos;essence même du règlement MAR 596/2014 : informer le marché des
        transactions des dirigeants. Elles sont consultables gratuitement sur{" "}
        <a href="https://bdif.amf-france.org" target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)", textDecoration: "underline" }}>
          bdif.amf-france.org
        </a>{" "}
        depuis 2006. Sigma se contente de les structurer et de les croiser avec des données
        financières, elles aussi publiques (Yahoo Finance, Google News).
      </>
    ),
  },
  {
    q: "Le site donne-t-il des conseils en investissement ?",
    a: (
      <>
        Non. Sigma est un outil d&apos;information qui agrège et score des données publiques.
        Les signaux ne constituent pas des conseils personnalisés. Les performances passées
        ne préjugent pas des performances futures. Investir en bourse comporte un risque de
        perte en capital. Consultez un conseiller professionnel pour vos décisions.
      </>
    ),
  },
  {
    q: "À quelle fréquence les données sont-elles mises à jour ?",
    a: (
      <>
        Synchronisation AMF toutes les heures (Vercel Cron). Rafraîchissement Yahoo Finance
        quotidien (prix, fondamentaux, consensus analystes). Re-scoring complet après chaque
        enrichissement. Backtest hebdomadaire (chaque dimanche). Résultat : le site reflète
        toujours l&apos;état le plus frais des déclarations publiques.
      </>
    ),
  },
  {
    q: "Pourquoi certaines sociétés n'ont-elles pas de cours ni de backtest ?",
    a: (
      <>
        Environ 15% des sociétés référencées sont trop petites pour être couvertes par Yahoo
        Finance (micro-caps, sociétés récemment cotées, radiées). Pour celles-ci, seul le
        signal AMF brut est affiché, sans enrichissement. Le site indique clairement
        lorsqu&apos;une donnée manque.
      </>
    ),
  },
  {
    q: "Comment le score composite est-il calculé ?",
    a: (
      <>
        100 points répartis sur 7 composantes déterministes : % du capital engagé (28 pts),
        % du flux de l&apos;insider (16 pts), fonction occupée (12 pts), force du cluster
        (8 pts), conviction directionnelle (4 pts), fondamentaux de base (−4 à 12 pts),
        signaux composites Yahoo (0 à 20 pts). Tous les barèmes sont publics sur la{" "}
        <Link href="/methodologie/" style={{ color: "var(--gold)" }}>
          page méthodologie
        </Link>
        .
      </>
    ),
  },
  {
    q: "Combien coûte le site ?",
    a: (
      <>
        Actuellement <strong style={{ color: "var(--gold)" }}>gratuit en beta sur invitation</strong>.
        Un plan Sigma Pro payant est envisagé à l&apos;issue de la beta (alertes email illimitées,
        recommandations personnalisées, export CSV, API). Les adhérents beta conserveront un tarif
        préférentiel à vie.
      </>
    ),
  },
  {
    q: "Puis-je utiliser Sigma comme trader actif ?",
    a: (
      <>
        Oui. Importez votre portefeuille (CSV de votre courtier), activez les alertes email, et
        recevez chaque matin les mouvements d&apos;insiders survenus dans les 48h sur vos titres ·
        incluant les signaux de vente. L&apos;outil vous dit à quels dirigeants faire attention,
        sans remplacer votre analyse.
      </>
    ),
  },
];

const FAQ_ITEMS_EN = [
  {
    q: "Who exactly is required to report their transactions to the AMF?",
    a: (
      <>
        <strong>Two categories are covered by Article 19 of MAR (EU 596/2014):</strong>
        <br /><br />
        <strong style={{ color: "var(--tx-1)" }}>1. PDMRs</strong> (Persons Discharging Managerial
        Responsibilities): anyone holding a senior executive or non-executive role with regular access
        to privileged information and decision-making power — CEOs, CFOs, members of the board of
        directors or supervisory board.
        <br /><br />
        <strong style={{ color: "var(--tx-1)" }}>2. PCAs</strong> (Persons Closely Associated):
        registered spouse/partner, dependent children, other family members sharing the same household
        for at least one year, and any legal entity controlled by or set up for the benefit of the PDMR.
        <br /><br />
        Ordinary shareholders are <em>not</em> covered by MAR Art. 19 — unless they cross ownership
        thresholds (5%, 10%… of capital), in which case separate disclosure obligations apply
        (French Commercial Code L.233-7).
      </>
    ),
  },
  {
    q: "What is the minimum transaction amount that triggers a disclosure?",
    a: (
      <>
        The reporting threshold was <strong>raised from €5,000 to €20,000</strong> cumulated per
        calendar year by the <em>EU Listing Act</em> (in force 2024). This threshold is calculated by
        adding all transactions for the year without netting (buys and sells each count separately).
        <br /><br />
        Member states have the flexibility to set their own threshold between{" "}
        <strong>€10,000 and €50,000</strong>. France, via the AMF (French financial regulator), may
        therefore choose a threshold different from €20,000.
        <br /><br />
        Once the threshold is crossed, <strong>every subsequent transaction</strong> in the year must
        be reported individually, even if it is €1.
        <br /><br />
        <strong>Deadline:</strong> notification to the AMF and the issuer within{" "}
        <strong>3 business days</strong> of the transaction date. The issuer then has 2 business days
        to make the information public via the BDIF.
      </>
    ),
  },
  {
    q: "Is it legal to use this data?",
    a: (
      <>
        <strong>Entirely legal.</strong> AMF filings are public by definition —
        that is the very purpose of MAR 596/2014: to inform the market of executive transactions.
        They are freely available at{" "}
        <a href="https://bdif.amf-france.org" target="_blank" rel="noopener noreferrer" style={{ color: "var(--gold)", textDecoration: "underline" }}>
          bdif.amf-france.org
        </a>{" "}
        since 2006. Sigma simply structures them and cross-references them with other public financial
        data (Yahoo Finance, Google News).
      </>
    ),
  },
  {
    q: "Does the site provide investment advice?",
    a: (
      <>
        No. Sigma is an information tool that aggregates and scores public data.
        Signals do not constitute personalised advice. Past performance is no guarantee of future
        results. Investing in equities involves a risk of capital loss. Please consult a professional
        adviser for your investment decisions.
      </>
    ),
  },
  {
    q: "How often is the data updated?",
    a: (
      <>
        AMF sync every hour (Vercel Cron). Yahoo Finance refresh daily (prices, fundamentals,
        analyst consensus). Full re-scoring after each enrichment. Weekly backtest (every Sunday).
        Result: the site always reflects the freshest state of public filings.
      </>
    ),
  },
  {
    q: "Why do some companies have no price data or backtest?",
    a: (
      <>
        About 15% of listed companies are too small to be covered by Yahoo Finance (micro-caps,
        recently listed companies, delisted companies). For these, only the raw AMF signal is shown,
        without enrichment. The site clearly indicates when data is missing.
      </>
    ),
  },
  {
    q: "How is the composite score calculated?",
    a: (
      <>
        100 points split across 7 deterministic components: % of capital invested (28 pts),
        % of insider flow (16 pts), role held (12 pts), cluster strength (8 pts), directional
        conviction (4 pts), basic fundamentals (−4 to 12 pts), Yahoo composite signals (0 to 20 pts).
        All scoring rules are published on the{" "}
        <Link href="/methodologie/" style={{ color: "var(--gold)" }}>
          methodology page
        </Link>
        .
      </>
    ),
  },
  {
    q: "How much does the site cost?",
    a: (
      <>
        Currently <strong style={{ color: "var(--gold)" }}>free in beta by invitation</strong>.
        A paid Sigma Pro plan is planned after the beta (unlimited email alerts, personalised
        recommendations, CSV export, API). Beta members will retain a lifetime preferential rate.
      </>
    ),
  },
  {
    q: "Can I use Sigma as an active trader?",
    a: (
      <>
        Yes. Import your portfolio (CSV from your broker), enable email alerts, and receive every
        morning the insider moves on your stocks in the past 48h ·
        including sell signals. The tool tells you which executives to watch,
        without replacing your own analysis.
      </>
    ),
  },
];
