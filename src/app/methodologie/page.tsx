/**
 * /methodologie · Explication complète des données, du scoring et des signaux.
 *
 * Tout est basé sur des données publiques (AMF France + Yahoo Finance) et des
 * calculs déterministes. Pas de boîte noire.
 */
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const hdrs = await headers();
  const isFr = (hdrs.get("x-locale") ?? "en") === "fr";
  return isFr ? {
    title: "Méthodologie · InsiderTrades",
    description: "Comment nous collectons les déclarations AMF, calculons les signaux, backtestons les performances et gérons les périodes temporelles. Transparence totale.",
  } : {
    title: "Methodology · InsiderTrades",
    description: "How we collect AMF filings, calculate signals, backtest performance and handle time periods. Full transparency.",
  };
}

async function getLiveStats() {
  try {
    const [totalDecl, totalCompanies, withFinancials, withPrice, withAnalyst,
      oldestDecl, lastParsed, totalBacktest] = await Promise.all([
      prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
      prisma.company.count({ where: { declarations: { some: { type: "DIRIGEANTS" } } } }),
      prisma.company.count({ where: { marketCap: { not: null } } }),
      prisma.company.count({ where: { currentPrice: { not: null } } }),
      prisma.company.count({ where: { analystScore: { not: null } } }),
      prisma.declaration.findFirst({
        where: { type: "DIRIGEANTS", transactionDate: { gte: new Date("2015-01-01") } },
        orderBy: { transactionDate: "asc" },
        select: { transactionDate: true },
      }),
      prisma.declaration.findFirst({
        where: { type: "DIRIGEANTS", pdfParsed: true },
        orderBy: { scoredAt: "desc" },
        select: { scoredAt: true },
      }),
      prisma.backtestResult.count(),
    ]);
    return {
      totalDecl,
      totalCompanies,
      withFinancials,
      withPrice,
      withAnalyst,
      earliestYear: oldestDecl?.transactionDate?.getFullYear() ?? 2015,
      lastScoredAt: lastParsed?.scoredAt ?? null,
      totalBacktest,
    };
  } catch {
    return null;
  }
}

// ── Small UI helpers ─────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.62rem",
        fontWeight: 600,
        color: "var(--gold)",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        marginBottom: "8px",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-6">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2
        style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
          fontWeight: 400,
          letterSpacing: "-0.012em",
          color: "var(--tx-1)",
          marginBottom: "8px",
          lineHeight: 1.15,
        }}
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            fontSize: "0.92rem",
            color: "var(--tx-2)",
            lineHeight: 1.6,
            maxWidth: "640px",
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "0.94rem",
        color: "var(--tx-2)",
        lineHeight: 1.7,
        marginBottom: "14px",
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      {children}
    </p>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────
function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: "2px solid var(--gold)",
        padding: "16px 18px",
        borderRadius: "2px",
      }}
    >
      <div
        style={{
          fontFamily: "'Banana Grotesk', sans-serif",
          fontSize: "1.6rem",
          fontWeight: 700,
          color: "var(--tx-1)",
          letterSpacing: "-0.03em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "0.68rem",
          color: "var(--tx-3)",
          fontFamily: "'JetBrains Mono', monospace",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontWeight: 600,
          marginTop: "5px",
        }}
      >
        {label}
      </div>
      {sub && (
        <div
          style={{
            fontSize: "0.72rem",
            color: "var(--tx-4)",
            marginTop: "3px",
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Score breakdown table ────────────────────────────────────────────────────
function ScoreTable({ rows }: { rows: { label: string; pts: string; desc: string; accent?: string }[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
    <div
      style={{
        border: "1px solid var(--border-med)",
        borderRadius: "2px",
        overflow: "hidden",
        minWidth: "480px",
      }}
    >
      {rows.map((r, i) => (
        <div
          key={r.label}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(140px, 1fr) 80px minmax(0, 2.2fr)",
            gap: "14px",
            padding: "12px 18px",
            borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
            alignItems: "baseline",
            background: i % 2 === 0 ? "var(--bg-surface)" : "transparent",
          }}
        >
          <div
            style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              color: "var(--tx-1)",
              letterSpacing: "-0.005em",
            }}
          >
            {r.label}
          </div>
          <div
            style={{
              fontFamily: "'Banana Grotesk', sans-serif",
              fontSize: "1rem",
              fontWeight: 700,
              color: r.accent || "var(--gold)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "-0.02em",
            }}
          >
            {r.pts}
          </div>
          <div style={{ fontSize: "0.82rem", color: "var(--tx-3)", lineHeight: 1.5 }}>
            {r.desc}
          </div>
        </div>
      ))}
    </div>
    </div>
  );
}

// ── Timeline / pipeline step ─────────────────────────────────────────────────
function PipelineStep({
  num,
  title,
  desc,
  tags,
}: {
  num: string;
  title: string;
  desc: React.ReactNode;
  tags?: string[];
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "18px",
        padding: "18px 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "2rem",
          color: "var(--gold)",
          fontStyle: "italic",
          lineHeight: 1,
          minWidth: "44px",
          flexShrink: 0,
        }}
      >
        {num}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: "1rem",
            fontWeight: 700,
            color: "var(--tx-1)",
            letterSpacing: "-0.015em",
            marginBottom: "6px",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontSize: "0.86rem",
            color: "var(--tx-2)",
            lineHeight: 1.6,
            marginBottom: tags ? "10px" : 0,
          }}
        >
          {desc}
        </p>
        {tags && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.66rem",
                  padding: "2px 8px",
                  borderRadius: "2px",
                  border: "1px solid var(--border-med)",
                  color: "var(--tx-3)",
                  background: "var(--bg-raised)",
                  letterSpacing: "0.02em",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Signal card (composite signal with flag + example) ───────────────────────
function SignalCard({
  name,
  desc,
  threshold,
  points,
  badge,
  isFr = true,
}: {
  name: string;
  desc: string;
  threshold: string;
  points: string;
  badge: string;
  isFr?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderTop: "2px solid var(--gold)",
        padding: "16px 18px",
        borderRadius: "2px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
        <h3
          style={{
            fontFamily: "var(--font-inter), sans-serif",
            fontSize: "0.92rem",
            fontWeight: 700,
            color: "var(--tx-1)",
            letterSpacing: "-0.01em",
            flex: 1,
            minWidth: 0,
            overflowWrap: "break-word",
          }}
        >
          {name}
        </h3>
        <span
          style={{
            fontFamily: "'Banana Grotesk', sans-serif",
            fontSize: "0.85rem",
            fontWeight: 700,
            color: "var(--gold)",
            letterSpacing: "-0.02em",
            flexShrink: 0,
          }}
        >
          {points}
        </span>
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--tx-3)", lineHeight: 1.55, margin: 0 }}>
        {desc}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px", marginTop: "4px" }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.62rem",
            color: "var(--tx-4)",
            letterSpacing: "0.04em",
          }}
        >
          {isFr ? "Seuil · " : "Threshold · "}{threshold}
        </span>
        <span style={{ color: "var(--border-strong)" }}>·</span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "0.62rem",
            padding: "2px 7px",
            border: "1px solid var(--gold-bd)",
            color: "var(--gold)",
            borderRadius: "2px",
            background: "var(--gold-bg)",
          }}
        >
          {badge}
        </span>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function MethodologiePage() {
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  const isFr = locale === "fr";
  const numLocale = isFr ? "fr-FR" : "en-US";

  const stats = await getLiveStats();
  const fmtDate = (d: Date | null) =>
    d ? d.toLocaleDateString(isFr ? "fr-FR" : "en-GB", { day: "2-digit", month: "long", year: "numeric" }) : "·";

  return (
    <div className="content-wrapper">
      {/* ── Masthead ─────────────────────────── */}
      <div className="mb-10">
        <div className="masthead-dateline">
          <span className="masthead-folio">{isFr ? "Méthodologie" : "Methodology"}</span>
          <span className="masthead-rule" aria-hidden="true" />
          <span className="masthead-count">
            {isFr ? "Dernière mise à jour scoring · " : "Last scoring update · "}{fmtDate(stats?.lastScoredAt ?? null)}
          </span>
        </div>
        <h1
          style={{
            fontFamily: "var(--font-dm-serif), Georgia, serif",
            fontSize: "clamp(2.25rem, 5.5vw, 4rem)",
            fontWeight: 400,
            letterSpacing: "-0.015em",
            lineHeight: 1.05,
            color: "var(--tx-1)",
          }}
        >
          {isFr ? (
            <>Données, agrégation <span style={{ fontStyle: "italic", color: "var(--gold)" }}>& signaux</span></>
          ) : (
            <>Data, aggregation <span style={{ fontStyle: "italic", color: "var(--gold)" }}>& signals</span></>
          )}
        </h1>
        <p
          style={{
            fontSize: "1rem",
            color: "var(--tx-2)",
            maxWidth: "720px",
            lineHeight: 1.65,
            marginTop: "14px",
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          {isFr ? (
            <>Transparence totale sur ce que nous collectons, comment nous l&apos;agrégeons
            et comment nous traduisons les déclarations AMF en signaux
            actionnables. Tous les calculs sont déterministes, reproductibles
            et documentés ci-dessous.</>
          ) : (
            <>Full transparency on what we collect, how we aggregate it,
            and how we turn AMF filings into actionable signals.
            All calculations are deterministic, reproducible,
            and documented below.</>
          )}
        </p>
      </div>

      {/* ── Live stats bar ────────────────────── */}
      {stats && (
        <section className="mb-14">
          <div
            className="grid"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            <Stat
              value={stats.totalDecl.toLocaleString(numLocale)}
              label={isFr ? "Déclarations AMF" : "AMF filings"}
              sub={isFr ? `depuis ${stats.earliestYear}` : `since ${stats.earliestYear}`}
            />
            <Stat
              value={stats.totalCompanies.toLocaleString(numLocale)}
              label={isFr ? "Sociétés suivies" : "Companies tracked"}
              sub={isFr ? "avec déclarations DD" : "with insider filings"}
            />
            <Stat
              value={stats.withFinancials.toLocaleString(numLocale)}
              label={isFr ? "Avec fondamentaux" : "With fundamentals"}
              sub={`${Math.round((stats.withFinancials / stats.totalCompanies) * 100)}% ${isFr ? "de couverture" : "coverage"}`}
            />
            <Stat
              value={stats.withAnalyst.toLocaleString(numLocale)}
              label={isFr ? "Consensus analyste" : "Analyst consensus"}
              sub={isFr ? "objectif cours, reco" : "price target, rating"}
            />
            <Stat
              value={stats.totalBacktest.toLocaleString(numLocale)}
              label={isFr ? "Transactions backtestées" : "Backtested transactions"}
              sub="T+30 · T+90 · T+365"
            />
          </div>
        </section>
      )}

      {/* ── Section 1 · Sources ─────────────── */}
      <section className="mb-16">
        <SectionTitle
          eyebrow={isFr ? "1. Sources" : "1. Sources"}
          title={isFr ? "D'où viennent les données" : "Where the data comes from"}
          sub={isFr
            ? "Deux sources officielles uniquement. Pas de données fabriquées ni de scraping agressif. Tout est horodaté et traçable."
            : "Two official sources only. No fabricated data or aggressive scraping. Everything is timestamped and traceable."}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "14px",
          }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-med)",
              borderLeft: "2px solid var(--gold)",
              padding: "18px 20px",
              borderRadius: "2px",
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.66rem",
                color: "var(--gold)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: "10px",
              }}
            >
              {isFr ? "Source primaire" : "Primary source"}
            </div>
            <h3
              style={{
                fontFamily: "var(--font-dm-serif), Georgia, serif",
                fontSize: "1.4rem",
                color: "var(--tx-1)",
                marginBottom: "8px",
              }}
            >
              AMF · BDIF
            </h3>
            <p style={{ fontSize: "0.86rem", color: "var(--tx-2)", lineHeight: 1.6, marginBottom: "12px" }}>
              {isFr ? (
                <>Base de Données des Informations Financières de l&apos;Autorité des
                Marchés Financiers. Publications quotidiennes des déclarations
                imposées par le règlement européen{" "}
                <strong style={{ color: "var(--tx-1)" }}>MAR 596/2014</strong> (Article 19).</>
              ) : (
                <>Financial Information Database of the French Financial Markets Authority.
                Daily publications of disclosures required by European regulation{" "}
                <strong style={{ color: "var(--tx-1)" }}>MAR 596/2014</strong> (Article 19).</>
              )}
            </p>
            <ul
              style={{
                fontSize: "0.82rem",
                color: "var(--tx-3)",
                lineHeight: 1.7,
                margin: 0,
                paddingLeft: "18px",
              }}
            >
              {isFr ? (
                <>
                  <li>Type extrait : <code className="mono">DIRIGEANTS</code> (transactions d&apos;initiés)</li>
                  <li>Format : PDF officiel + notices d&apos;information</li>
                  <li>Fréquence de synchronisation : plusieurs fois par jour</li>
                  <li>Délai réglementaire de publication : T+3 ouvrés maximum</li>
                </>
              ) : (
                <>
                  <li>Extracted type: <code className="mono">DIRIGEANTS</code> (insider transactions)</li>
                  <li>Format: official PDF + information notices</li>
                  <li>Sync frequency: several times per day</li>
                  <li>Regulatory filing deadline: T+3 business days maximum</li>
                </>
              )}
            </ul>
          </div>

          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-med)",
              borderLeft: "2px solid var(--c-indigo-2)",
              padding: "18px 20px",
              borderRadius: "2px",
            }}
          >
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.66rem",
                color: "var(--c-indigo-2)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                fontWeight: 600,
                marginBottom: "10px",
              }}
            >
              {isFr ? "Enrichissement" : "Enrichment"}
            </div>
            <h3
              style={{
                fontFamily: "var(--font-dm-serif), Georgia, serif",
                fontSize: "1.4rem",
                color: "var(--tx-1)",
                marginBottom: "8px",
              }}
            >
              Yahoo Finance
            </h3>
            <p style={{ fontSize: "0.86rem", color: "var(--tx-2)", lineHeight: 1.6, marginBottom: "12px" }}>
              {isFr
                ? "Cours de bourse, fondamentaux, consensus analystes. Trois endpoints utilisés, chacun sur un périmètre dédié :"
                : "Stock prices, fundamentals, analyst consensus. Three endpoints used, each for a dedicated scope:"}
            </p>
            <ul
              style={{
                fontSize: "0.82rem",
                color: "var(--tx-3)",
                lineHeight: 1.7,
                margin: 0,
                paddingLeft: "18px",
              }}
            >
              {isFr ? (
                <>
                  <li><code className="mono">v8/chart</code> · prix historique quotidien (20 ans)</li>
                  <li><code className="mono">fundamentals-timeseries</code> · compte de résultat annuel</li>
                  <li><code className="mono">quoteSummary</code> · valorisation, ratios, targets analystes</li>
                </>
              ) : (
                <>
                  <li><code className="mono">v8/chart</code> · daily historical price (20 years)</li>
                  <li><code className="mono">fundamentals-timeseries</code> · annual income statement</li>
                  <li><code className="mono">quoteSummary</code> · valuation, ratios, analyst targets</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Section 2 · Pipeline ──────────────── */}
      <section className="mb-16">
        <SectionTitle
          eyebrow={isFr ? "2. Pipeline" : "2. Pipeline"}
          title={isFr ? "Du PDF au signal" : "From PDF to signal"}
          sub={isFr
            ? "Chaque déclaration AMF passe par 5 étapes déterministes avant d'apparaître sur le site."
            : "Each AMF filing goes through 6 deterministic steps before appearing on the site."}
        />
        <div>
          <PipelineStep
            num="01"
            title={isFr ? "Collecte" : "Collection"}
            desc={isFr ? (
              <>
                Polling de l&apos;AMF plusieurs fois par jour. Chaque notice
                reçoit un identifiant unique <code className="mono">amfId</code> et son PDF est
                téléchargé. Les nouvelles sociétés non référencées sont
                créées à la volée.
              </>
            ) : (
              <>
                Polling the AMF several times per day. Each notice receives a unique
                <code className="mono">amfId</code> identifier and its PDF is downloaded.
                New unlisted companies are created on the fly.
              </>
            )}
            tags={isFr ? ["API AMF", "amfId unique", "déduplication"] : ["API AMF", "unique amfId", "deduplication"]}
          />
          <PipelineStep
            num="02"
            title="Parsing PDF"
            desc={isFr ? (
              <>
                Extraction texte via <code className="mono">pdftotext (Poppler)</code>, puis
                regex dédiées : date de transaction, nature (acquisition /
                cession / attribution), volume, prix unitaire, montant total,
                ISIN, nom et fonction du dirigeant. Validation de cohérence
                (dates plausibles, montants strictement positifs,
                reclassification des acquisitions à prix nul en
                &laquo; attributions gratuites &raquo;).
              </>
            ) : (
              <>
                Text extraction via <code className="mono">pdftotext (Poppler)</code>, then
                dedicated regex: transaction date, nature (acquisition /
                disposal / grant), volume, unit price, total amount,
                ISIN, executive name and role. Consistency validation
                (plausible dates, strictly positive amounts,
                reclassification of zero-price acquisitions as
                &ldquo;free attributions&rdquo;).
              </>
            )}
            tags={["pdftotext", "regex", isFr ? "validation dates" : "date validation"]}
          />
          <PipelineStep
            num="03"
            title={isFr ? "Normalisation & rôles" : "Normalisation & roles"}
            desc={isFr ? (
              <>
                La fonction du dirigeant est normalisée selon une table
                couvrant les intitulés français et anglais, avec variantes
                et abréviations : <code className="mono">PDG/DG</code>,{" "}
                <code className="mono">CFO/DAF</code>,{" "}
                <code className="mono">CA/Board</code>,{" "}
                <code className="mono">Directeur</code>, etc. Cette
                normalisation conditionne le scoring.
              </>
            ) : (
              <>
                The executive role is normalised against a table covering
                French and English titles with variants and abbreviations:
                <code className="mono">PDG/DG</code>,{" "}
                <code className="mono">CFO/DAF</code>,{" "}
                <code className="mono">CA/Board</code>,{" "}
                <code className="mono">Directeur</code>, etc. This
                normalisation drives the scoring.
              </>
            )}
            tags={["role-utils", "normalizeRole", "normalizeDisplay"]}
          />
          <PipelineStep
            num="04"
            title={isFr ? "Enrichissement fondamentaux" : "Fundamentals enrichment"}
            desc={isFr ? (
              <>
                Résolution du ticker Yahoo (ISIN → search), puis
                récupération de 30+ champs : capitalisation, cours courant,
                haut/bas 52 semaines, moyennes mobiles 50/200j, P/E, P/B,
                beta, D/E, ROE, ROA, marge, détention institutionnelle et
                dirigeants, short ratio, consensus analystes et objectifs
                cours.
              </>
            ) : (
              <>
                Yahoo ticker resolution (ISIN → search), then
                fetching 30+ fields: market cap, current price,
                52-week high/low, 50/200-day moving averages, P/E, P/B,
                beta, D/E, ROE, ROA, margin, institutional and insider
                ownership, short ratio, analyst consensus and price targets.
              </>
            )}
            tags={[
              "yahoo-finance2",
              "quoteSummary",
              "fundamentals-timeseries",
            ]}
          />
          <PipelineStep
            num="05"
            title={isFr ? "Scoring & signaux" : "Scoring & signals"}
            desc={isFr ? (
              <>
                Pour chaque déclaration d&apos;acquisition parsée avec
                montant : calcul de <code className="mono">pctOfMarketCap</code>,{" "}
                <code className="mono">pctOfInsiderFlow</code>,
                <code className="mono">insiderCumNet</code>,{" "}
                <code className="mono">isCluster</code> (fenêtre 30 jours),
                puis du score composite <code className="mono">signalScore ∈ [0;100]</code>.
              </>
            ) : (
              <>
                For each parsed acquisition with an amount: calculation of{" "}
                <code className="mono">pctOfMarketCap</code>,{" "}
                <code className="mono">pctOfInsiderFlow</code>,{" "}
                <code className="mono">insiderCumNet</code>,{" "}
                <code className="mono">isCluster</code> (30-day window),
                then the composite <code className="mono">signalScore ∈ [0;100]</code>.
              </>
            )}
            tags={["signalScore", "isCluster", "recoScore"]}
          />
          <PipelineStep
            num="06"
            title="Backtest"
            desc={isFr ? (
              <>
                Pour chaque acquisition historique : fetch du prix
                d&apos;exécution puis des prix à T+30, T+60, T+90, T+160,
                T+365 et T+730 jours calendaires. Stockage des returns
                correspondants. Les performances futures ne peuvent jamais
                polluer un score historique (look-ahead bias évité).
              </>
            ) : (
              <>
                For each historical acquisition: fetch the execution price then
                prices at T+30, T+60, T+90, T+160, T+365 and T+730 calendar days.
                Corresponding returns are stored. Future performance can never
                contaminate a historical score (look-ahead bias avoided).
              </>
            )}
            tags={["T+30", "T+90", "T+365", "priceNear ±12d"]}
          />
        </div>
      </section>

      {/* ── Section 3 · Signal score breakdown ── */}
      <section className="mb-16">
        <SectionTitle
          eyebrow={isFr ? "3. Signal score" : "3. Signal score"}
          title={isFr ? "Décomposition des 100 points" : "Breakdown of the 100 points"}
          sub={isFr
            ? "Le signalScore est calculé par signals.ts à partir de la transaction elle-même et des fondamentaux Yahoo de la société. Il est recalculé à chaque évolution des données."
            : "The signalScore is computed by signals.ts from the transaction itself and the company's Yahoo fundamentals. It is recalculated on every data update."}
        />
        <ScoreTable
          rows={isFr ? [
            {
              label: "% capitalisation",
              pts: "0–28",
              desc: "montant du trade / market cap, barème logarithmique. 0.001% → 1pt, 0.1% → 16pts, 1%+ → 28pts.",
              accent: "var(--gold)",
            },
            {
              label: "% flux du dirigeant",
              pts: "0–16",
              desc: "part de ce trade dans le flux total de cet insider sur cette société. 100% (seul trade) → 16pts.",
              accent: "var(--gold)",
            },
            {
              label: "Fonction",
              pts: "0–12",
              desc: "PDG/DG → 12, CFO/DAF → 11, Directeur → 8, CA/Board → 6, Autre → 2.",
              accent: "var(--c-indigo-2)",
            },
            {
              label: "Force du cluster",
              pts: "0–8",
              desc: "nombre de dirigeants distincts ayant tradé sur la même société en ±30 jours. 2→4pts, 3→6pts, 4+→8pts.",
              accent: "var(--c-indigo-2)",
            },
            {
              label: "Conviction directionnelle",
              pts: "0–4",
              desc: "bonus si l'insider est net acheteur cumulé sur ce titre avant la transaction.",
              accent: "var(--gold)",
            },
            {
              label: "Fondamentaux de base",
              pts: "-4 à 12",
              desc: "consensus analyste (1.0 → +6, 3.0 → 0), P/E (<10 → +3, <20 → +1), dette/equity (<30 → +3).",
              accent: "var(--c-indigo-2)",
            },
            {
              label: "Signaux composites",
              pts: "0–20",
              desc: "Bonus additionnel construit sur 8 signaux Yahoo (momentum, value, qualité, upside, etc.). Voir section suivante.",
              accent: "var(--gold)",
            },
          ] : [
            {
              label: "% market cap",
              pts: "0–28",
              desc: "trade amount / market cap, logarithmic scale. 0.001% → 1pt, 0.1% → 16pts, 1%+ → 28pts.",
              accent: "var(--gold)",
            },
            {
              label: "% insider flow",
              pts: "0–16",
              desc: "share of this trade in the insider's total flow for this company. 100% (only trade) → 16pts.",
              accent: "var(--gold)",
            },
            {
              label: "Role",
              pts: "0–12",
              desc: "CEO/MD → 12, CFO → 11, Director → 8, Board → 6, Other → 2.",
              accent: "var(--c-indigo-2)",
            },
            {
              label: "Cluster strength",
              pts: "0–8",
              desc: "number of distinct executives who traded the same company within ±30 days. 2→4pts, 3→6pts, 4+→8pts.",
              accent: "var(--c-indigo-2)",
            },
            {
              label: "Directional conviction",
              pts: "0–4",
              desc: "bonus if the insider is a net cumulative buyer on this stock before the transaction.",
              accent: "var(--gold)",
            },
            {
              label: "Basic fundamentals",
              pts: "-4 to 12",
              desc: "analyst consensus (1.0 → +6, 3.0 → 0), P/E (<10 → +3, <20 → +1), debt/equity (<30 → +3).",
              accent: "var(--c-indigo-2)",
            },
            {
              label: "Composite signals",
              pts: "0–20",
              desc: "Additional bonus built on 8 Yahoo signals (momentum, value, quality, upside, etc.). See next section.",
              accent: "var(--gold)",
            },
          ]}
        />
        <div
          style={{
            marginTop: "16px",
            padding: "14px 18px",
            background: "var(--bg-raised)",
            border: "1px solid var(--border)",
            borderLeft: "2px solid var(--gold)",
            borderRadius: "2px",
            fontSize: "0.82rem",
            color: "var(--tx-3)",
            lineHeight: 1.6,
            fontFamily: "var(--font-inter), sans-serif",
          }}
        >
          {isFr ? (
            <><strong style={{ color: "var(--tx-1)" }}>Total cappé à 100.</strong> La somme brute
            peut dépasser 100 lorsque plusieurs signaux forts s&apos;alignent :
            le score final est alors tronqué. Un score négatif est impossible.</>
          ) : (
            <><strong style={{ color: "var(--tx-1)" }}>Total capped at 100.</strong> The raw sum
            can exceed 100 when several strong signals align —
            the final score is then truncated. A negative score is impossible.</>
          )}
        </div>
      </section>

      {/* ── Section 4 · Composite signals (NEW) ── */}
      <section className="mb-16">
        <SectionTitle
          eyebrow={isFr ? "4. Signaux composites" : "4. Composite signals"}
          title={isFr ? "Huit signaux Yahoo qui se combinent" : "Eight Yahoo signals that combine"}
          sub={isFr
            ? "En plus de la transaction elle-même, nous analysons 8 dimensions de la société pour affiner le score. Chacun émet un flag visible sur les cartes et contribue au bonus final (cap +20 pts)."
            : "In addition to the transaction itself, we analyse 8 dimensions of the company to refine the score. Each emits a visible flag on the cards and contributes to the final bonus (cap +20 pts)."}
        />
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "14px",
          }}
        >
          <SignalCard
            isFr={isFr}
            name={isFr ? "Près plus bas 52s" : "Near 52-week low"}
            desc={isFr
              ? "Achat d'un dirigeant alors que le cours est proche du plus bas sur 52 semaines, contrarian classique."
              : "Executive buy when the price is near its 52-week low — classic contrarian setup."}
            threshold={isFr ? "position < 20% du range 52s" : "position < 20% of 52w range"}
            points="+3 pts"
            badge={isFr ? "Près plus bas 52s" : "Near 52w low"}
          />
          <SignalCard
            isFr={isFr}
            name={isFr ? "Momentum long terme" : "Long-term momentum"}
            desc={isFr
              ? "Cours au-dessus de sa moyenne mobile 200 jours : tendance de fond haussière, conforté par l'achat dirigeant."
              : "Price above its 200-day moving average: underlying uptrend, reinforced by the insider buy."}
            threshold={isFr ? "prix ≥ MA200 × 1.05" : "price ≥ MA200 × 1.05"}
            points="+2 pts"
            badge="Momentum"
          />
          <SignalCard
            isFr={isFr}
            name="Upside ≥ 25%"
            desc={isFr
              ? "Objectif cours moyen analystes supérieur de 25%+ au cours actuel. Consensus bullish chiffré."
              : "Average analyst price target more than 25% above the current price. Quantified bullish consensus."}
            threshold={isFr ? "(target − prix) / prix ≥ 25%" : "(target − price) / price ≥ 25%"}
            points="+3 pts"
            badge="Upside ≥25%"
          />
          <SignalCard
            isFr={isFr}
            name={isFr ? "Strong Buy analystes" : "Analyst Strong Buy"}
            desc={isFr
              ? "Consensus moyen ≤ 1.75 (échelle Yahoo 1 = Strong Buy, 5 = Strong Sell). Minimum 3 analystes."
              : "Average consensus ≤ 1.75 (Yahoo scale: 1 = Strong Buy, 5 = Strong Sell). Minimum 3 analysts."}
            threshold="analystScore ≤ 1.75"
            points="+2 pts"
            badge="Strong Buy"
          />
          <SignalCard
            isFr={isFr}
            name="Value combo"
            desc={isFr
              ? "P/E < 15, P/B < 2, free cash flow positif. Aligné avec l'école Graham / Buffett."
              : "P/E < 15, P/B < 2, positive free cash flow. Aligned with the Graham / Buffett school."}
            threshold="P/E<15 & P/B<2 & FCF>0"
            points="+2 pts"
            badge="Value"
          />
          <SignalCard
            isFr={isFr}
            name={isFr ? "Qualité combo" : "Quality combo"}
            desc={isFr
              ? "ROE ≥ 15%, marge nette ≥ 10%, D/E < 80. Société capable de générer du rendement durable."
              : "ROE ≥ 15%, net margin ≥ 10%, D/E < 80. A company capable of generating durable returns."}
            threshold={isFr ? "ROE≥15% & marge≥10% & D/E<80" : "ROE≥15% & margin≥10% & D/E<80"}
            points="+3 pts"
            badge={isFr ? "Qualité" : "Quality"}
          />
          <SignalCard
            isFr={isFr}
            name={isFr ? "Détention dirigeants ≥ 20%" : "Insider ownership ≥ 20%"}
            desc={isFr
              ? "Les dirigeants possèdent déjà une part significative du capital. Achat = renforcement d'un alignement existant."
              : "Executives already own a significant share of the capital. The buy reinforces an existing alignment."}
            threshold="heldByInsiders ≥ 20%"
            points="+2 pts"
            badge={isFr ? "Dirigeants ≥20%" : "Insiders ≥20%"}
          />
          <SignalCard
            isFr={isFr}
            name={isFr ? "Short squeeze potentiel" : "Potential short squeeze"}
            desc={isFr
              ? "Short ratio élevé + achat dirigeant = setup contrarian avec catalyseur de couverture possible."
              : "High short ratio + insider buy = contrarian setup with possible short-covering catalyst."}
            threshold="shortRatio ≥ 5"
            points="+2 pts"
            badge="Short squeeze"
          />
        </div>
      </section>

      {/* ── Section 5 · Reco score ──────────── */}
      <section className="mb-16">
        <SectionTitle
          eyebrow={isFr ? "5. Score de recommandation" : "5. Recommendation score"}
          title={isFr ? "De l'observation à l'action" : "From observation to action"}
          sub={isFr
            ? "Le recoScore utilisé sur la page Recommandations combine le signalScore avec les performances historiques de profils similaires dans notre backtest."
            : "The recoScore used on the Recommendations page combines the signalScore with historical performance of similar profiles in our backtest."}
        />
        <ScoreTable
          rows={isFr ? [
            {
              label: "Score signal (brut)",
              pts: "30",
              desc: "Intensité du signal brut : signalScore / 100 × 30.",
              accent: "var(--gold)",
            },
            {
              label: "Win rate historique",
              pts: "25",
              desc: "% de trades gagnants T+90 pour ce type de signal (fonction + taille société).",
              accent: "var(--gold)",
            },
            {
              label: "Retour estimé T+90",
              pts: "20",
              desc: "rendement moyen T+90 pour ce profil historique. Cap à 20% = 20pts.",
              accent: "var(--signal-pos)",
            },
            {
              label: "Récence",
              pts: "15",
              desc: "décroissance exponentielle depuis la date de publication. Demi-vie de 21 jours.",
              accent: "var(--c-indigo-2)",
            },
            {
              label: "Conviction",
              pts: "10",
              desc: "bonus cluster (10), % mcap ≥ 2% (9), ≥ 0.5% (6), montant ≥ 500k€ (4).",
              accent: "var(--gold)",
            },
          ] : [
            {
              label: "Signal score (raw)",
              pts: "30",
              desc: "Raw signal intensity: signalScore / 100 × 30.",
              accent: "var(--gold)",
            },
            {
              label: "Historical win rate",
              pts: "25",
              desc: "% of winning trades at T+90 for this signal type (role + company size).",
              accent: "var(--gold)",
            },
            {
              label: "Estimated T+90 return",
              pts: "20",
              desc: "Average T+90 return for this historical profile. Cap at 20% = 20pts.",
              accent: "var(--signal-pos)",
            },
            {
              label: "Recency",
              pts: "15",
              desc: "Exponential decay since the filing date. Half-life of 21 days.",
              accent: "var(--c-indigo-2)",
            },
            {
              label: "Conviction",
              pts: "10",
              desc: "cluster bonus (10), % mcap ≥ 2% (9), ≥ 0.5% (6), amount ≥ €500k (4).",
              accent: "var(--gold)",
            },
          ]}
        />
        <div
          style={{
            marginTop: "14px",
            fontSize: "0.82rem",
            color: "var(--tx-3)",
            lineHeight: 1.65,
          }}
        >
          {isFr ? (
            <>Nous ne présentons une reco d&apos;achat que si le retour estimé
            T+90 historique est <strong style={{ color: "var(--tx-1)" }}>supérieur à +4%</strong>. Les
            profils sans historique suffisant ou au rendement attendu faible
            sont écartés d&apos;office.</>
          ) : (
            <>We only show a buy recommendation if the estimated historical T+90 return is{" "}
            <strong style={{ color: "var(--tx-1)" }}>above +4%</strong>. Profiles without sufficient
            history or with low expected return are excluded outright.</>
          )}
        </div>
      </section>

      {/* ── Section 6 · Backtest methodology ── */}
      <section className="mb-16">
        <SectionTitle
          eyebrow={isFr ? "6. Backtest" : "6. Backtest"}
          title={isFr ? "Comment on mesure la performance" : "How we measure performance"}
        />
        <Paragraph>
          {isFr ? (
            <>Pour chaque déclaration d&apos;acquisition parsée dans les 10+
            dernières années, nous calculons le rendement du titre à 6
            horizons fixes depuis la date d&apos;exécution :</>
          ) : (
            <>For each parsed acquisition filing over the last 10+ years, we calculate
            the stock&apos;s return at 6 fixed horizons from the execution date:</>
          )}
        </Paragraph>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
            gap: "8px",
            marginTop: "4px",
            marginBottom: "18px",
          }}
        >
          {(isFr ? [
            { h: "T+30", v: "1 mois" },
            { h: "T+60", v: "2 mois" },
            { h: "T+90", v: "~1 trimestre" },
            { h: "T+160", v: "~6 mois" },
            { h: "T+365", v: "1 an" },
            { h: "T+730", v: "2 ans" },
          ] : [
            { h: "T+30", v: "1 month" },
            { h: "T+60", v: "2 months" },
            { h: "T+90", v: "~1 quarter" },
            { h: "T+160", v: "~6 months" },
            { h: "T+365", v: "1 year" },
            { h: "T+730", v: "2 years" },
          ]).map((x) => (
            <div
              key={x.h}
              style={{
                textAlign: "center",
                padding: "10px 8px",
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                borderRadius: "2px",
              }}
            >
              <div
                style={{
                  fontFamily: "'Banana Grotesk', sans-serif",
                  fontSize: "1.15rem",
                  fontWeight: 700,
                  color: "var(--gold)",
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {x.h}
              </div>
              <div
                style={{
                  fontSize: "0.68rem",
                  color: "var(--tx-3)",
                  fontFamily: "'JetBrains Mono', monospace",
                  marginTop: "2px",
                  letterSpacing: "0.04em",
                }}
              >
                {x.v}
              </div>
            </div>
          ))}
        </div>
        <Paragraph>
          {isFr ? (
            <>Prix fournis par <code className="mono">Yahoo v8/chart</code> avec une fenêtre de
            tolérance de <strong style={{ color: "var(--tx-1)" }}>±12 jours</strong> calendaires
            autour de chaque cible (week-ends, jours fériés, suspensions de
            cotation). Si aucun prix n&apos;est disponible dans cette fenêtre,
            le return correspondant est laissé nul, jamais extrapolé.</>
          ) : (
            <>Prices provided by <code className="mono">Yahoo v8/chart</code> with a tolerance window of{" "}
            <strong style={{ color: "var(--tx-1)" }}>±12 calendar days</strong> around each target
            (weekends, public holidays, trading suspensions). If no price is available in this window,
            the corresponding return is left null, never extrapolated.</>
          )}
        </Paragraph>
        <Paragraph>
          {isFr ? (
            <>Le <em>win rate</em> est le pourcentage de trades dont le return
            à l&apos;horizon considéré est strictement positif. L&apos;agrégation
            par <em>bucket</em> (fonction × taille société) nous permet de
            comparer des profils comparables et d&apos;éviter les biais de
            composition.</>
          ) : (
            <>The <em>win rate</em> is the percentage of trades whose return at the
            given horizon is strictly positive. Aggregation by <em>bucket</em>{" "}
            (role × company size) lets us compare comparable profiles and
            avoid composition bias.</>
          )}
        </Paragraph>
      </section>

      {/* ── Section 7 · Period handling ───────── */}
      <section className="mb-16">
        <SectionTitle
          eyebrow={isFr ? "7. Gestion des périodes" : "7. Period handling"}
          title={isFr ? "Pas de confusion temporelle" : "No temporal confusion"}
          sub={isFr
            ? "Les erreurs les plus fréquentes en analyse d'insider trading viennent d'un mauvais appariement entre la date du trade et les données fondamentales. Voici comment on s'en prémunit."
            : "The most common errors in insider trading analysis come from mismatching the trade date with fundamental data. Here's how we prevent that."}
        />
        <div style={{ overflowX: "auto" }}>
        <div
          style={{
            border: "1px solid var(--border-med)",
            borderRadius: "2px",
            overflow: "hidden",
            minWidth: "420px",
          }}
        >
          {(isFr ? [
            {
              k: "transactionDate",
              v: "Date réelle de la transaction sur le marché. Référence pour les calculs de cluster, de flux et pour les prix historiques du backtest.",
            },
            {
              k: "pubDate",
              v: "Date de publication AMF (peut être 1 à 3 jours après la transaction). Utilisée comme fallback quand transactionDate est manquante.",
            },
            {
              k: "scoredAt",
              v: "Horodatage du dernier calcul du signalScore. Un re-scoring n'est déclenché que lorsque les fondamentaux de la société ont été rafraîchis.",
            },
            {
              k: "financialsAt",
              v: "Date de récupération du compte de résultat Yahoo (annuel). Nous ne re-récupérons pas plus d'une fois par semaine par société.",
            },
            {
              k: "priceAt",
              v: "Date de récupération des technicals (prix courant, moyennes mobiles, haut/bas 52s). Refreshés quotidiennement.",
            },
            {
              k: "analystAt",
              v: "Date de récupération du consensus analyste (reco, target). Refreshé quotidiennement avec les technicals.",
            },
          ] : [
            {
              k: "transactionDate",
              v: "Actual date of the market transaction. Reference for cluster, flow calculations and historical backtest prices.",
            },
            {
              k: "pubDate",
              v: "AMF filing date (can be 1 to 3 days after the transaction). Used as fallback when transactionDate is missing.",
            },
            {
              k: "scoredAt",
              v: "Timestamp of the last signalScore calculation. A re-scoring is only triggered when the company's fundamentals have been refreshed.",
            },
            {
              k: "financialsAt",
              v: "Date the Yahoo income statement (annual) was fetched. We do not re-fetch more than once per week per company.",
            },
            {
              k: "priceAt",
              v: "Date technicals were fetched (current price, moving averages, 52w high/low). Refreshed daily.",
            },
            {
              k: "analystAt",
              v: "Date analyst consensus was fetched (rating, target). Refreshed daily alongside technicals.",
            },
          ]).map((row, i, arr) => (
            <div
              key={row.k}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(140px, 1fr) minmax(0, 2.6fr)",
                gap: "14px",
                padding: "12px 18px",
                borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                alignItems: "baseline",
                background: i % 2 === 0 ? "var(--bg-surface)" : "transparent",
              }}
            >
              <code
                className="mono"
                style={{ color: "var(--gold)", fontSize: "0.82rem" }}
              >
                {row.k}
              </code>
              <div style={{ fontSize: "0.82rem", color: "var(--tx-3)", lineHeight: 1.55 }}>
                {row.v}
              </div>
            </div>
          ))}
        </div>
        </div>
        <Paragraph>
          {isFr ? (
            <><strong style={{ color: "var(--tx-1)" }}>Look-ahead bias.</strong> Le backtest
            utilise uniquement les prix disponibles à la date de la
            transaction : aucune information future ne peut influencer le
            score historique d&apos;un trade.</>
          ) : (
            <><strong style={{ color: "var(--tx-1)" }}>Look-ahead bias.</strong> The backtest
            uses only prices available at the transaction date — no future
            information can influence a trade&apos;s historical score.</>
          )}
        </Paragraph>
        <Paragraph>
          {isFr ? (
            <><strong style={{ color: "var(--tx-1)" }}>Recommandations.</strong> Nous n&apos;affichons
            que des transactions publiées dans les 90 derniers jours. La
            market cap courante est donc très proche de la market cap au
            moment du trade : l&apos;écart reste sous 5% dans la vaste
            majorité des cas.</>
          ) : (
            <><strong style={{ color: "var(--tx-1)" }}>Recommendations.</strong> We only display
            transactions filed within the last 90 days. The current market cap is
            therefore very close to the market cap at the time of the trade — the gap
            stays under 5% in the vast majority of cases.</>
          )}
        </Paragraph>
      </section>

      {/* ── Section 8 · Limits ────────────────── */}
      <section className="mb-16">
        <SectionTitle
          eyebrow={isFr ? "8. Limites" : "8. Limits"}
          title={isFr ? "Ce que le site ne sait pas faire" : "What the site cannot do"}
        />
        <ul
          style={{
            paddingLeft: "20px",
            margin: 0,
            fontSize: "0.9rem",
            color: "var(--tx-2)",
            lineHeight: 1.75,
          }}
        >
          {isFr ? (
            <>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Performance passée ≠ performance future.</strong>{" "}
                Un signal historiquement gagnant peut cesser de l&apos;être
                lorsque les conditions de marché changent.
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Bruit de marché.</strong> Les prix T+30 à T+730
                reflètent tout, pas uniquement l&apos;effet du signal.
                Le backtest mesure une corrélation, pas une causalité.
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Couverture fondamentale.</strong> Pour les
                sociétés récemment cotées ou de très petite capitalisation,
                les données Yahoo sont parfois incomplètes : dans ce cas les
                signaux composites non disponibles ne pénalisent pas le score
                (règle d&apos;abstention).
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Transactions hors AMF.</strong> Les achats
                réalisés via dérivés (options, CFD), dans des véhicules tiers
                non déclarés ou à l&apos;étranger ne sont pas capturés.
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Informations non publiques.</strong> Les
                restructurations capitalistiques, plans de stock-options et
                autres événements corporate peuvent expliquer un achat : le
                signal brut ne le saurait pas toujours.
              </li>
            </>
          ) : (
            <>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Past performance ≠ future performance.</strong>{" "}
                A historically winning signal can stop working when market conditions change.
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Market noise.</strong> Prices from T+30 to T+730
                reflect everything, not just the signal&apos;s effect.
                The backtest measures a correlation, not a causation.
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Fundamental coverage.</strong> For recently listed
                companies or very small caps, Yahoo data is sometimes incomplete — in that case,
                unavailable composite signals do not penalise the score
                (abstention rule).
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Transactions outside AMF.</strong> Purchases
                made via derivatives (options, CFDs), undisclosed third-party vehicles,
                or abroad are not captured.
              </li>
              <li>
                <strong style={{ color: "var(--tx-1)" }}>Non-public information.</strong> Capital
                restructurings, stock-option plans, and other corporate events can explain a buy —
                the raw signal won&apos;t always know that.
              </li>
            </>
          )}
        </ul>
      </section>

      {/* ── Footer links ──────────────────────── */}
      <section
        style={{
          marginTop: "40px",
          paddingTop: "24px",
          borderTop: "1px solid var(--border-med)",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <p
          style={{
            fontSize: "0.82rem",
            color: "var(--tx-3)",
            margin: 0,
            fontFamily: "var(--font-inter), sans-serif",
            maxWidth: "520px",
            lineHeight: 1.55,
          }}
        >
          {isFr
            ? "Ces informations sont fournies à titre pédagogique et ne constituent pas un conseil en investissement. Investir comporte un risque de perte en capital."
            : "This information is provided for educational purposes and does not constitute investment advice. Investing involves a risk of capital loss."}
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link href="/recommendations" className="btn btn-primary" style={{ fontSize: "0.82rem", minHeight: "44px" }}>
            {isFr ? "Voir les recommandations" : "View recommendations"}
          </Link>
          <Link href="/backtest" className="btn btn-outline" style={{ fontSize: "0.82rem", minHeight: "44px" }}>
            {isFr ? "Explorer le backtest" : "Explore the backtest"}
          </Link>
        </div>
      </section>
    </div>
  );
}
