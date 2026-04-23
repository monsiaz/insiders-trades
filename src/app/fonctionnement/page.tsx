/**
 * /fonctionnement · Public marketing + explainer page.
 *
 * Long-form, visually rich, animated (pure SVG/CSS · no canvas) walkthrough
 * of how Insiders Trades Sigma works. Intended to be the landing page
 * linked from the site footer for non-authenticated visitors.
 */
import Link from "next/link";
import { HowItWorksAnimations } from "@/components/HowItWorksAnimations";
import { LogoMark } from "@/components/Logo";
import { PipelineDiagram } from "./_components/PipelineDiagram";
import { ScoringWheel } from "./_components/ScoringWheel";
import { BacktestCurve } from "./_components/BacktestCurve";
import { SignalRadar } from "./_components/SignalRadar";

export const revalidate = 3600;

export const metadata = {
  title: "Comment ça marche · Insiders Trades Sigma",
  description:
    "Découvrez comment Insiders Trades Sigma transforme les déclarations AMF des dirigeants en signaux d'investissement actionnables. Collecte, scoring, backtest historique, recommandations.",
};

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

export default function FonctionnementPage() {
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
        <Eyebrow>Comment ça marche</Eyebrow>
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
          Le signal des initiés,<br />
          <span style={{ fontStyle: "italic", color: "var(--gold)" }}>pour tout le monde</span>.
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
          Les dirigeants de sociétés cotées françaises sont obligés de déclarer leurs achats
          et ventes à l&apos;AMF. Nous transformons ces déclarations publiques, mais rarement
          exploitées · en signaux classés, backtestés et personnalisés.
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
            Accéder à la beta →
          </Link>
          <Link
            href="/methodologie"
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
            Méthodologie détaillée ↗
          </Link>
        </div>
        <KeyFigures />
      </section>

      {/* ── WHY ──────────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Eyebrow>Le constat</Eyebrow>
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
            Les initiés en savent plus.<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>Leurs trades sont publics</span>.
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
            Depuis le règlement européen <strong style={{ color: "var(--tx-1)" }}>MAR 596/2014</strong>,
            tout dirigeant d&apos;une société cotée doit déclarer ses transactions à l&apos;AMF sous 3 jours.
            Ces données sont publiques, mais éparpillées dans des milliers de PDF, sans scoring, sans
            historique, sans méthode d&apos;évaluation.
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
            eyebrow="Problème · 01"
            title="Les PDF AMF sont illisibles"
            body="Des milliers de déclarations format texte, sans standardisation, sans tickers, sans ISIN propre. Impossible à traiter manuellement."
            accent="var(--signal-neg)"
          />
          <FeatureCard
            eyebrow="Problème · 02"
            title="Aucun contexte financier"
            body="Un achat de 100k€ a-t-il du sens sur une société de 10Md€ ? Sans le ratio, le signal est inutile. Les PDF ne contiennent pas la capitalisation."
            accent="var(--signal-neg)"
          />
          <FeatureCard
            eyebrow="Problème · 03"
            title="Aucune validation historique"
            body="La question clé reste ouverte : quand un PDG achète, le titre monte-t-il vraiment ? Il faut un backtest sur 22 000+ trades historiques pour le dire."
            accent="var(--signal-neg)"
          />
        </div>
      </Section>

      {/* ── PIPELINE DIAGRAM (animated) ───────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <Eyebrow>Pipeline</Eyebrow>
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
            De la déclaration AMF <span style={{ fontStyle: "italic", color: "var(--gold)" }}>au signal actionnable</span>
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
            Six étapes automatisées, toutes horodatées et reproductibles. Ce schéma s&apos;anime pour montrer
            le flux réel des données.
          </p>
        </div>
        <PipelineDiagram />
      </Section>

      {/* ── FOUR STEPS (existing HowItWorksAnimations) ────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <Eyebrow>Quatre moments clés</Eyebrow>
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
            Collecte · Scoring · Backtest · <span style={{ fontStyle: "italic", color: "var(--gold)" }}>Signal</span>
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
            Chaque étape est visualisée ci-dessous avec les vraies données du site.
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
            <Eyebrow>Scoring composite</Eyebrow>
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
              Sept composantes<br />
              <span style={{ fontStyle: "italic", color: "var(--gold)" }}>pour un score sur 100</span>
            </h2>
            <p style={{ fontSize: "0.95rem", color: "var(--tx-2)", lineHeight: 1.7, marginBottom: "14px" }}>
              Chaque déclaration est scorée sur 100 points avec un barème déterministe et transparent.
              La roue à droite illustre la pondération exacte de chaque composante.
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
                <strong style={{ color: "var(--tx-1)" }}>% capitalisation</strong>, un achat qui pèse 1% du mcap
                compte plus qu&apos;un achat symbolique
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>% flux de l&apos;insider</strong> · est-ce son plus gros
                mouvement sur ce titre ?
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Fonction</strong> · PDG &gt; CFO &gt; Directeur &gt; Membre du CA
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Cluster</strong> · plusieurs dirigeants en ±30 jours ?
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Conviction</strong> · l&apos;insider est-il net-acheteur cumulé ?
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Fondamentaux</strong> · consensus analyste, P/E, leverage
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Signaux composites Yahoo</strong> · 8 flags additionnels
                (momentum, value, qualité, upside…)
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
            <Eyebrow color="var(--gold)">Backtest rigoureux</Eyebrow>
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
              22 620 trades testés,<br />
              <span style={{ fontStyle: "italic", color: "var(--gold)" }}>six horizons</span>
            </h2>
            <p style={{ fontSize: "0.95rem", color: "var(--tx-2)", lineHeight: 1.7, marginBottom: "14px" }}>
              Pour chaque déclaration, nous mesurons le rendement à <strong style={{ color: "var(--tx-1)" }}>T+30, T+60, T+90,
              T+160, T+365 et T+730</strong> jours calendaires. Aucune donnée future ne pollue le scoring
              historique (zéro look-ahead bias).
            </p>
            <p style={{ fontSize: "0.95rem", color: "var(--tx-2)", lineHeight: 1.7, marginBottom: "14px" }}>
              Prix fournis par Yahoo Finance avec une fenêtre de tolérance de ±12 jours pour éviter les
              week-ends, jours fériés et suspensions de cotation. Aucune extrapolation.
            </p>
            <p style={{ fontSize: "0.95rem", color: "var(--tx-2)", lineHeight: 1.7, marginBottom: 0 }}>
              Les recommandations qui s&apos;affichent sur le site sont filtrées selon les statistiques
              historiques : seuls les profils avec un retour moyen ≥ +4% à T+90 sont présentés comme
              signaux d&apos;achat.
            </p>
          </div>
        </div>
      </Section>

      {/* ── SIGNAL RADAR (live-ish visual) ────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
          <Eyebrow>Le signal final</Eyebrow>
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
            Radar visuel des <span style={{ fontStyle: "italic", color: "var(--gold)" }}>signaux actifs</span>
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
            Chaque point représente un signal réel · achat (vert) ou vente (rouge) · positionné par son
            score et son % de mcap.
          </p>
        </div>
        <SignalRadar />
      </Section>

      {/* ── USE CASES ─────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Eyebrow>Cas d&apos;usage</Eyebrow>
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
            Qui utilise Sigma,<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>et pour quoi</span>
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
            eyebrow="Profil · Investisseur long terme"
            title="Repérer les convictions fortes"
            body="Les achats groupés de PDG et CFO sur leur propre société, avec un ticket supérieur à 500k€, sont historiquement suivis d'une surperformance à 6-12 mois. Le site pré-filtre ces cas."
            accent="var(--gold)"
          />
          <FeatureCard
            eyebrow="Profil · Trader actif"
            title="Surveiller son portfolio"
            body="Importez vos positions, et recevez par email chaque matin les mouvements d'insiders survenus sur vos titres dans les 48h. Signaux de vente inclus."
            accent="var(--gold)"
          />
          <FeatureCard
            eyebrow="Profil · Analyste"
            title="Explorer 10 ans d'historique"
            body="Toutes les déclarations depuis 2015 avec leur backtest T+30/90/365 sont consultables. Filtres par secteur, taille, rôle, type de transaction."
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
          <Eyebrow>Sources & stack</Eyebrow>
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
            Données 100% publiques, méthodologie 100% documentée
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "14px",
              marginBottom: "14px",
            }}
          >
            <TrustItem label="AMF BDIF" desc="Source primaire · MAR 596/2014" />
            <TrustItem label="Yahoo Finance" desc="Prix, fondamentaux, consensus" />
            <TrustItem label="Google News" desc="Actualités sociétés FR" />
            <TrustItem label="OpenAI" desc="Normalisation + validation logos" />
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--tx-3)", lineHeight: 1.6, margin: 0 }}>
            Tout notre processus est documenté en détail sur la page{" "}
            <Link href="/methodologie" style={{ color: "var(--gold)", fontWeight: 600, textDecoration: "underline" }}>
              méthodologie
            </Link>
            . Les calculs sont déterministes. Le code s&apos;appuie sur Next.js, React, Prisma, Postgres (Neon)
            et Vercel. Aucune boîte noire.
          </p>
        </div>
      </Section>

      {/* ── CADRE RÉGLEMENTAIRE ───────────────────────────────────────────── */}
      <Section id="reglementation">
        <div style={{ textAlign: "center", marginBottom: "40px" }}>
          <Eyebrow color="var(--c-sky, #38bdf8)">Réglementation</Eyebrow>
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
            Qui doit déclarer, quoi, et pourquoi ?
          </h2>
          <p style={{ color: "var(--tx-2)", fontSize: "1.05rem", maxWidth: "680px", margin: "0 auto", lineHeight: 1.65 }}>
            Le règlement européen MAR (Market Abuse Regulation) impose une transparence totale
            sur les transactions des personnes les mieux informées d&apos;une société cotée.
            Voici l&apos;essentiel du cadre légal que Sigma exploite.
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
            Fondement juridique
          </div>
          <p style={{ color: "var(--tx-1)", fontSize: "1rem", fontWeight: 600, marginBottom: "6px" }}>
            Règlement UE n°596/2014 · Article 19 (MAR)
          </p>
          <p style={{ color: "var(--tx-2)", fontSize: "0.9rem", lineHeight: 1.65 }}>
            En vigueur depuis le 3 juillet 2016, le MAR remplace et unifie les législations nationales
            sur les abus de marché dans toute l&apos;Union européenne. En France, il est mis en oeuvre
            et contrôlé par l&apos;<strong style={{ color: "var(--tx-1)" }}>Autorité des Marchés Financiers (AMF)</strong>.
            Les déclarations sont publiées dans la base BDIF (Banque de Données &amp; d&apos;Informations Financières).
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
              Qui doit déclarer
            </div>
            <ul style={{ color: "var(--tx-2)", fontSize: "0.88rem", lineHeight: 1.7, paddingLeft: "16px", margin: 0 }}>
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
              Transactions concernées
            </div>
            <ul style={{ color: "var(--tx-2)", fontSize: "0.88rem", lineHeight: 1.7, paddingLeft: "16px", margin: 0 }}>
              <li>Acquisitions et cessions d&apos;actions ou d&apos;instruments de dette</li>
              <li style={{ marginTop: "6px" }}>Exercice d&apos;options ou de BSA (bons de souscription)</li>
              <li style={{ marginTop: "6px" }}>Souscriptions dans le cadre d&apos;augmentations de capital</li>
              <li style={{ marginTop: "6px" }}>Produits dérivés liés aux titres de l&apos;émetteur</li>
              <li style={{ marginTop: "6px" }}>Donations (même à titre gratuit)</li>
              <li style={{ marginTop: "6px" }}>Transactions réalisées par un gestionnaire de portefeuille mandaté</li>
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
              Délais &amp; seuils
            </div>
            <ul style={{ color: "var(--tx-2)", fontSize: "0.88rem", lineHeight: 1.7, paddingLeft: "16px", margin: 0 }}>
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
            Dirigeants vs Actionnaires : deux régimes distincts
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
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
            <strong style={{ color: "var(--tx-2)" }}>Sanctions :</strong> Le défaut de déclaration ou
            la déclaration tardive expose le dirigeant à une sanction administrative de l&apos;AMF pouvant
            atteindre <strong style={{ color: "var(--tx-2)" }}>100 000 €</strong>, ainsi qu&apos;à des
            poursuites pénales pour délit d&apos;initié si la transaction repose sur une information
            privilégiée (jusqu&apos;à 100 M€ d&apos;amende et 7 ans d&apos;emprisonnement, Article L.465-1 du Code monétaire
            et financier). C&apos;est pourquoi les dirigeants déclarent en général rapidement et correctement.
          </p>
        </div>
      </Section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <Eyebrow>Questions fréquentes</Eyebrow>
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
            Tout ce que vous vous demandez
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "820px", margin: "0 auto" }}>
          {FAQ_ITEMS.map((it, i) => (
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
            Prêt à voir ce que les dirigeants achètent<br />
            <span style={{ fontStyle: "italic", color: "var(--gold)" }}>avant que les marchés ne réagissent</span> ?
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
            Phase bêta privée. L&apos;accès est sur invitation pour le moment.
            Connectez-vous ou laissez vos coordonnées à l&apos;administrateur pour rejoindre la liste.
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
              Se connecter à la beta →
            </Link>
            <Link
              href="/methodologie"
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
              Tout savoir sur la méthodologie ↗
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

function KeyFigures() {
  const figs = [
    { v: "25 500+", l: "déclarations AMF", s: "depuis 2015" },
    { v: "585",     l: "sociétés suivies", s: "cotées FR" },
    { v: "22 620",  l: "backtests réalisés", s: "T+30 à T+730" },
    { v: "86%",     l: "sociétés enrichies", s: "fondamentaux Yahoo" },
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

const FAQ_ITEMS = [
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
        <Link href="/methodologie" style={{ color: "var(--gold)" }}>
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
