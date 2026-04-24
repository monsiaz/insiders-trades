/**
 * /admin/tech · Deep technical documentation (admin-only).
 *
 * Covers:
 *   1. Architecture & stack
 *   2. Data ingestion (AMF BDIF → PDF parse → DB)
 *   3. Financial enrichment (Yahoo Finance 3-layer)
 *   4. Logo pipeline (Google News + Clearbit + Scrape + OpenAI Vision)
 *   5. Scoring engine (signalScore formula breakdown)
 *   6. Recommendation engine (recoScore + buy/sell filters)
 *   7. Backtest engine (horizons + methodology + biases avoided)
 *   8. Email digest pipeline
 *   9. Security (JWT, bcrypt, beta lockdown, CRON_SECRET)
 *  10. Data model (Prisma tables)
 *  11. Tech stack reference
 *  12. Roadmap / possible improvements
 *
 * Live stats are queried from the DB so the doc stays current.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Architecture technique · Insiders Trades Sigma",
  description: "Documentation interne admin · pipelines, algorithmes, stack, roadmap.",
};

export const dynamic = "force-dynamic";

async function getLiveStats() {
  const [
    totalDecl, parsed, unparsed,
    totalCompanies, withLogo, withMcap, withPrice, withAnalyst, with52w,
    totalBacktest, buyBT, sellBT,
    totalInsiders, totalUsers, totalPositions,
    oldestDecl, lastDecl, lastParsed,
  ] = await Promise.all([
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true } }),
    prisma.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: false } }),
    prisma.company.count(),
    prisma.company.count({ where: { logoUrl: { not: null } } }),
    prisma.company.count({ where: { marketCap: { not: null } } }),
    prisma.company.count({ where: { currentPrice: { not: null } } }),
    prisma.company.count({ where: { analystScore: { not: null } } }),
    prisma.company.count({ where: { fiftyTwoWeekHigh: { not: null } } }),
    prisma.backtestResult.count(),
    prisma.backtestResult.count({ where: { direction: "BUY" } }),
    prisma.backtestResult.count({ where: { direction: "SELL" } }),
    prisma.insider.count(),
    prisma.user.count(),
    prisma.portfolioPosition.count(),
    prisma.declaration.findFirst({
      where: { type: "DIRIGEANTS", transactionDate: { gte: new Date("2015-01-01") } },
      orderBy: { transactionDate: "asc" },
      select: { transactionDate: true },
    }),
    prisma.declaration.findFirst({
      where: { type: "DIRIGEANTS" },
      orderBy: { pubDate: "desc" },
      select: { pubDate: true },
    }),
    prisma.declaration.findFirst({
      where: { type: "DIRIGEANTS", pdfParsed: true, scoredAt: { not: null } },
      orderBy: { scoredAt: "desc" },
      select: { scoredAt: true },
    }),
  ]);
  return {
    totalDecl, parsed, unparsed,
    totalCompanies, withLogo, withMcap, withPrice, withAnalyst, with52w,
    totalBacktest, buyBT, sellBT,
    totalInsiders, totalUsers, totalPositions,
    earliestYear: oldestDecl?.transactionDate?.getFullYear() ?? 2015,
    lastDeclAt: lastDecl?.pubDate ?? null,
    lastScoredAt: lastParsed?.scoredAt ?? null,
  };
}

// ── UI primitives ────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.6rem",
        fontWeight: 700,
        color: "var(--gold)",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        marginBottom: "6px",
      }}
    >
      {children}
    </div>
  );
}

function Section({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string;
  title: string;
  sub?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "56px" }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(1.45rem, 3vw, 1.9rem)",
          fontWeight: 400,
          color: "var(--tx-1)",
          letterSpacing: "-0.012em",
          marginBottom: "8px",
        }}
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            fontSize: "0.92rem",
            color: "var(--tx-2)",
            lineHeight: 1.65,
            maxWidth: "760px",
            marginBottom: "18px",
          }}
        >
          {sub}
        </p>
      )}
      {children}
    </section>
  );
}

function Para({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "0.93rem",
        color: "var(--tx-2)",
        lineHeight: 1.7,
        marginBottom: "12px",
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      {children}
    </p>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: "0.82rem",
        color: "var(--gold)",
        background: "var(--gold-bg)",
        padding: "1px 6px",
        borderRadius: "2px",
      }}
    >
      {children}
    </code>
  );
}

function PathRow({ path, note }: { path: string; note: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(260px, 1fr) 1.6fr",
        gap: "18px",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        alignItems: "baseline",
      }}
    >
      <code
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "0.78rem",
          color: "var(--c-indigo-2)",
        }}
      >
        {path}
      </code>
      <div style={{ fontSize: "0.86rem", color: "var(--tx-2)", lineHeight: 1.55 }}>{note}</div>
    </div>
  );
}

function Card({
  accent = "var(--gold)",
  children,
  padding = "16px 20px",
}: {
  accent?: string;
  children: React.ReactNode;
  padding?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: `3px solid ${accent}`,
        padding,
        borderRadius: "3px",
      }}
    >
      {children}
    </div>
  );
}

function Stat({
  value,
  label,
  sub,
  accent = "var(--gold)",
}: {
  value: string;
  label: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-med)",
        borderLeft: `2px solid ${accent}`,
        padding: "14px 16px",
        borderRadius: "2px",
      }}
    >
      <div
        style={{
          fontFamily: "'Banana Grotesk', sans-serif",
          fontSize: "1.55rem",
          fontWeight: 700,
          color: accent,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "0.66rem",
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
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function StepCard({
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
    <div style={{ display: "flex", gap: "18px", padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
      <div
        style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "2rem",
          color: "var(--gold)",
          fontStyle: "italic",
          lineHeight: 1,
          minWidth: "48px",
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
            marginBottom: "4px",
          }}
        >
          {title}
        </h3>
        <p style={{ fontSize: "0.88rem", color: "var(--tx-2)", lineHeight: 1.6, marginBottom: tags ? "8px" : 0 }}>
          {desc}
        </p>
        {tags && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "0.64rem",
                  padding: "2px 7px",
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminTechPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");

  const s = await getLiveStats();
  const fmtDateFr = (d: Date | null) =>
    d ? d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "·";
  const fmtDateTimeFr = (d: Date | null) =>
    d ? d.toLocaleString("fr-FR") : "·";
  const pct = (num: number, total: number) =>
    total > 0 ? Math.round((num / total) * 100) : 0;

  return (
    <div className="content-wrapper">
      {/* ── Masthead ── */}
      <div style={{ marginBottom: "40px" }}>
        <div className="masthead-dateline">
          <span className="masthead-folio">Admin · technique</span>
          <span className="masthead-rule" aria-hidden="true" />
          <span className="masthead-count">
            Mise à jour scoring · {fmtDateFr(s.lastScoredAt)}
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
          Architecture <span style={{ fontStyle: "italic", color: "var(--gold)" }}>technique</span>
        </h1>
        <p
          style={{
            fontSize: "1rem",
            color: "var(--tx-2)",
            maxWidth: "780px",
            lineHeight: 1.65,
            marginTop: "14px",
          }}
        >
          Documentation interne complète : pipelines de collecte, enrichissement, scoring,
          backtest, emails. Stack, modèle de données, sécurité et roadmap. Mise à jour en
          temps réel avec les compteurs live de la base.
        </p>
        <div style={{ marginTop: "14px" }}>
          <Link
            href="/methodologie/"
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "var(--gold)",
              textDecoration: "none",
              padding: "6px 12px",
              border: "1px solid var(--gold-bd)",
              borderRadius: "3px",
            }}
          >
            Voir la méthodologie publique ↗
          </Link>
        </div>
      </div>

      {/* ── Live stats strip ── */}
      <section style={{ marginBottom: "56px" }}>
        <div
          className="grid"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "12px",
          }}
        >
          <Stat value={s.totalDecl.toLocaleString("fr-FR")} label="Déclarations AMF" sub={`depuis ${s.earliestYear}`} />
          <Stat value={`${pct(s.parsed, s.totalDecl)}%`} label="PDF parsés" sub={`${s.parsed.toLocaleString("fr-FR")} sur ${s.totalDecl.toLocaleString("fr-FR")}`} />
          <Stat value={s.totalCompanies.toLocaleString("fr-FR")} label="Sociétés" sub={`${pct(s.withLogo, s.totalCompanies)}% logos · ${pct(s.withMcap, s.totalCompanies)}% mcap`} accent="var(--c-indigo-2)" />
          <Stat value={s.totalInsiders.toLocaleString("fr-FR")} label="Dirigeants" sub="normalisés par rôle" accent="var(--c-indigo-2)" />
          <Stat value={s.totalBacktest.toLocaleString("fr-FR")} label="Rows backtest" sub={`${s.buyBT.toLocaleString("fr-FR")} BUY · ${s.sellBT.toLocaleString("fr-FR")} SELL`} accent="var(--signal-pos)" />
          <Stat value={s.totalUsers.toString()} label="Comptes beta" sub={`${s.totalPositions} positions totales`} accent="var(--c-violet)" />
        </div>
        <div
          style={{
            marginTop: "12px",
            fontSize: "0.74rem",
            color: "var(--tx-4)",
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.04em",
          }}
        >
          Dernière déclaration AMF vue : {fmtDateTimeFr(s.lastDeclAt)}
        </div>
      </section>

      {/* ── 1. Architecture globale ── */}
      <Section
        eyebrow="1. Vue d'ensemble"
        title="Architecture globale"
        sub="Monolithe Next.js 16 App Router, déployé sur Vercel (edge + Node runtime), Neon Postgres comme source de vérité, Vercel Blob pour les assets, jobs planifiés via Vercel Cron. Pas de micro-services, pas de queue ; tout passe par des routes API idempotentes ou des scripts locaux."
      >
        <Card accent="var(--gold)" padding="18px 22px">
          <pre
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "0.76rem",
              color: "var(--tx-2)",
              lineHeight: 1.65,
              whiteSpace: "pre",
              overflow: "auto",
              margin: 0,
            }}
          >
{`┌───────────┐   polling   ┌──────────────┐   parse   ┌───────────┐
│  AMF BDIF │ ──────────▶ │ /api/sync-*  │ ────────▶ │ Postgres  │
└───────────┘  every 1h    └──────────────┘           │  (Neon)   │
                                                       └─────┬─────┘
┌───────────┐  quoteSum   ┌──────────────┐  enrich         │
│  Yahoo    │ ──────────▶ │ /api/enrich- │ ──────────────▶ │
│  Finance  │  chart,rss  │  mcap, cron  │                 │
└───────────┘              └──────────────┘                 │
                                                            │
┌───────────┐  rss        ┌──────────────┐  read per page  │
│ Google    │ ──────────▶ │ /api/company │ ◀───────────────┘
│ News      │   15min     │   /news      │
└───────────┘              └──────────────┘
                                                            │
┌───────────┐  gpt-image  ┌──────────────┐  upload         │
│  OpenAI   │ ──────────▶ │  local Python│ ───────────────▶ Vercel Blob
│  API      │  + Vision   │  script      │                  (CDN logos)
└───────────┘              └──────────────┘                 │
                                                            ▼
                                                      ┌─────────────┐
                                                      │  Next.js    │
                                                      │ App Router  │
                                                      │  + Edge     │
                                                      │  middleware │
                                                      └──────┬──────┘
                                                             │
                                                             ▼
                                                        browser (FR)`}
          </pre>
        </Card>
      </Section>

      {/* ── 2. Stack ── */}
      <Section
        eyebrow="2. Stack"
        title="Ce qui tourne sous le capot"
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "12px",
          }}
        >
          <Card accent="var(--c-indigo-2)">
            <h3 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "8px" }}>
              Frontend / backend
            </h3>
            <ul style={{ fontSize: "0.82rem", color: "var(--tx-2)", lineHeight: 1.7, margin: 0, paddingLeft: "16px" }}>
              <li>Next.js 16 (App Router · Turbopack)</li>
              <li>React 19 Server Components</li>
              <li>TypeScript 5</li>
              <li>Tailwind CSS + custom tokens</li>
              <li>Recharts pour les graphiques</li>
            </ul>
          </Card>
          <Card accent="var(--signal-pos)">
            <h3 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "8px" }}>
              Données
            </h3>
            <ul style={{ fontSize: "0.82rem", color: "var(--tx-2)", lineHeight: 1.7, margin: 0, paddingLeft: "16px" }}>
              <li>Postgres hébergé chez Neon (EU)</li>
              <li>Prisma 6 ORM (schema-first, migrations <Code>db push</Code>)</li>
              <li>unstable_cache + ISR (revalidate)</li>
              <li>Vercel Blob pour les logos</li>
            </ul>
          </Card>
          <Card accent="var(--gold)">
            <h3 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "8px" }}>
              APIs externes
            </h3>
            <ul style={{ fontSize: "0.82rem", color: "var(--tx-2)", lineHeight: 1.7, margin: 0, paddingLeft: "16px" }}>
              <li>AMF BDIF (liste + PDF)</li>
              <li>Yahoo Finance (v8/chart, quoteSummary, timeseries, RSS)</li>
              <li>Google News RSS (actualités)</li>
              <li>OpenAI (gpt-4o, gpt-4o-mini Vision, gpt-image-1, search-preview)</li>
              <li>Nodemailer + Gmail SMTP (mails)</li>
            </ul>
          </Card>
          <Card accent="var(--c-violet)">
            <h3 style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "8px" }}>
              Infra
            </h3>
            <ul style={{ fontSize: "0.82rem", color: "var(--tx-2)", lineHeight: 1.7, margin: 0, paddingLeft: "16px" }}>
              <li>Vercel production (EU)</li>
              <li>Vercel Cron (4 jobs planifiés)</li>
              <li>Edge middleware (auth beta)</li>
              <li>JWT HS256 + bcrypt (sessions)</li>
              <li>Git + GitHub pour l&apos;historique</li>
            </ul>
          </Card>
        </div>
      </Section>

      {/* ── 3. Pipeline AMF ── */}
      <Section
        eyebrow="3. Ingestion"
        title="AMF BDIF → Postgres"
        sub="La source primaire est le feed des déclarations de dirigeants publié par l'Autorité des Marchés Financiers (règlement MAR 596/2014, article 19)."
      >
        <StepCard
          num="01"
          title="Polling"
          desc={<>Endpoint <Code>/api/sync-latest</Code> appelé chaque heure par Vercel Cron. Il interroge l&apos;API BDIF AMF et récupère les 100 dernières déclarations de type DIRIGEANTS. Chaque notice a un <Code>amfId</Code> unique qui sert de clé de déduplication.</>}
          tags={["Vercel Cron 0 * * * *", "idempotent", "CRON_SECRET"]}
        />
        <StepCard
          num="02"
          title="Téléchargement PDF"
          desc={<>Pour chaque nouvelle déclaration, son PDF est téléchargé depuis l&apos;AMF. Les sociétés non référencées sont créées à la volée avec un slug généré (sans collision).</>}
          tags={["amfToken", "slug auto", "upsert"]}
        />
        <StepCard
          num="03"
          title="Parsing PDF"
          desc={<>Extraction texte via <Code>pdftotext</Code> (Poppler). Regex dédiées pour date de transaction, nature (acquisition / cession / attribution), volume, prix unitaire, montant total, ISIN, nom et fonction du dirigeant. Validation : dates plausibles (2003–{new Date().getFullYear() + 1}), montants strictement positifs, reclassification automatique des &laquo; acquisitions à prix nul &raquo; en attributions gratuites.</>}
          tags={["pdftotext", "regex FR/EN", "validation"]}
        />
        <StepCard
          num="04"
          title="Normalisation"
          desc={<>Fonction du dirigeant mappée sur une table &laquo; rôle &raquo; couvrant français + anglais + variantes + typos (PDG/DG, CFO/DAF, Directeur, CA/Board, Autre). Genre déduit par heuristique locale + pass GPT-4o-mini sur les noms ambigus. Voir <Code>src/lib/role-utils.ts</Code>.</>}
          tags={["normalizeRole", "normalizeDisplay", "gender GPT"]}
        />
        <StepCard
          num="05"
          title="Rescue / reparse"
          desc={<>Endpoint <Code>/api/reparse</Code> exposé dans l&apos;admin (onglet Cron). Modes : <Code>missing-isin</Code>, <Code>missing-amount</Code>, <Code>unparsed</Code>. Chaque run en traite jusqu&apos;à 500 avec un timeout de 285 s.</>}
          tags={["manual trigger", "catch-up"]}
        />
      </Section>

      {/* ── 4. Yahoo pipeline ── */}
      <Section
        eyebrow="4. Enrichissement Yahoo"
        title="Trois couches complémentaires"
        sub="Yahoo Finance reste la source la plus complète et gratuite pour les small/mid caps françaises. Le pipeline combine 3 endpoints pour maximiser le taux de couverture et contourner les rate-limits."
      >
        <div style={{ border: "1px solid var(--border-med)", borderRadius: "3px" }}>
          <PathRow
            path="query1…/v8/finance/chart/{ticker}?range=1y"
            note={<>Prix actuel, devise, plus haut/bas 52s, série quotidienne pour calculer MA50 / MA200 localement. <strong style={{ color: "var(--tx-1)" }}>Pas de rate limit notable.</strong></>}
          />
          <PathRow
            path="query1…/ws/fundamentals-timeseries"
            note={<>Compte de résultat annuel : revenus, EBITDA, net income, total debt, free cash flow, ROE, ROA. <strong>Pas de crumb requis</strong>.</>}
          />
          <PathRow
            path="yahoo-finance2 quoteSummary"
            note={<>Modules <Code>financialData</Code>, <Code>defaultKeyStatistics</Code>, <Code>summaryDetail</Code>. Ratios de valorisation (P/E, P/B, beta), marges, consensus analyste, target prices, institutional + insider ownership, short ratio, dividend yield. <strong style={{ color: "var(--signal-neg)" }}>Rate-limite agressivement sous charge serverless.</strong></>}
          />
        </div>
        <Para>
          Le script local <Code>scripts/enrich-yahoo-extras.mjs</Code> fait un pass sériel lent (1 req/650 ms) pour récupérer quoteSummary sans se faire bannir. Sur {s.totalCompanies} sociétés, {s.with52w} ont leurs technicals, {s.withMcap} ont leur market cap, {s.withPrice} ont un cours courant.
        </Para>
      </Section>

      {/* ── 5. Logos ── */}
      <Section
        eyebrow="5. Pipeline logos"
        title="Multi-source + validation GPT-4o Vision"
        sub="Aucun logo n'est publié sans avoir d'abord été validé par Vision. Taux de couverture actuel :"
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginBottom: "16px" }}>
          <Stat value={`${pct(s.withLogo, s.totalCompanies)}%`} label="Logos actifs" sub={`${s.withLogo} / ${s.totalCompanies}`} />
        </div>
        <Para>
          <strong style={{ color: "var(--tx-1)" }}>Candidats collectés</strong> (dans l&apos;ordre de priorité) : scraping header/nav du site officiel (résolu via yfinance → website, puis fallback OpenAI), OG image, Clearbit (mort depuis fin 2024, retiré), Logo.dev, Icon Horse, Google S2 favicon, DuckDuckGo, OpenAI <Code>gpt-4o-search-preview</Code> pour URLs directes.
        </Para>
        <Para>
          <strong style={{ color: "var(--tx-1)" }}>Validation</strong> : chaque candidat est téléchargé, rasterisé (SVG via <Code>cairosvg</Code>), puis envoyé à <Code>gpt-4o-mini</Code> Vision avec un prompt JSON-structuré qui retourne <Code>is_logo</Code>, <Code>is_correct_company</Code>, <Code>confidence</Code>. Seuls les candidats <Code>valid + confidence ≥ medium</Code> passent.
        </Para>
        <Para>
          <strong style={{ color: "var(--tx-1)" }}>Optimisation</strong> : conversion WebP 200×200 quality 85 (PIL), nom de fichier propre (pas de suffixe AMF numérique), upload Vercel Blob avec <Code>allowOverwrite=true</Code>.
        </Para>
      </Section>

      {/* ── 6. Scoring engine (v3) ── */}
      <Section
        eyebrow="6. Moteur de scoring · v3"
        title="signalScore · décomposition 100 pts (v3, 2026-04)"
        sub={<>Calculé par <Code>src/lib/signals.ts</Code> à chaque <Code>scoreDeclarations()</Code>. Re-scoring manuel via l&apos;onglet Cron admin. Budget total strict de 100. v3 : redistribution vers les signaux insider-centrés (track record, DCA, cluster directionnel, analyst-contrarian).</>}
      >
        <div style={{ border: "1px solid var(--border-med)", borderRadius: "3px", overflow: "hidden" }}>
          {[
            { label: "Cluster directionnel ±30j", pts: "0–18",  desc: "★ ≥2 insiders MÊME sens (BUY xor SELL) · 2→12, 3→15, 4+→18" },
            { label: "% capitalisation",          pts: "0–16",  desc: "log(pct) : 0.001%=1, 0.1%=10, 1%+=16" },
            { label: "Track record insider ★",    pts: "-2–14", desc: "alpha prior · shrinkage bayésien k=5 · 2-5%=7, >10%=14" },
            { label: "Fonction rôle",             pts: "0–14",  desc: "PDG/DG=14 · CFO/DAF=13 · Directeur=9 · CA/Board=6 · Autre=2" },
            { label: "Composite Yahoo",           pts: "0–10",  desc: "7 flags, near-52w-low GATED sur cluster/PDG/CFO (anti-knife-catching)" },
            { label: "% flux dirigeant",          pts: "0–8",   desc: "part du trade dans le flux total insider sur cette société" },
            { label: "DCA / accumulation ★",      pts: "0–6",   desc: "NEW · ≥2 buys prior 12m sur (insider, co) · 1→2, 2→4, 3+→6" },
            { label: "Analyst-contrarian ★",      pts: "0–6",   desc: "NEW · BUY + consensus ≥ 3.0 · 3.0-3.5→3, ≥3.5→6" },
            { label: "Conviction dir.",           pts: "0–4",   desc: "insider net-acheteur cumulé avant le trade" },
            { label: "Fondamentaux (réduit)",     pts: "-2–4",  desc: "v3 · poids réduit · consensus (1.0→+2) · P/E<10 +1 · D/E<30 +1" },
          ].map((r, i, all) => (
            <div
              key={r.label}
              style={{
                display: "grid",
                gridTemplateColumns: "200px 70px 1fr",
                gap: "14px",
                padding: "11px 16px",
                borderBottom: i < all.length - 1 ? "1px solid var(--border)" : "none",
                background: i % 2 === 0 ? "var(--bg-surface)" : "transparent",
                alignItems: "baseline",
              }}
            >
              <span style={{ fontSize: "0.85rem", color: "var(--tx-1)", fontWeight: 600 }}>{r.label}</span>
              <span
                style={{
                  fontFamily: "'Banana Grotesk', sans-serif",
                  fontSize: "1rem",
                  fontWeight: 700,
                  color: "var(--gold)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {r.pts}
              </span>
              <span style={{ fontSize: "0.84rem", color: "var(--tx-3)" }}>{r.desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 7. Composite signals (v3 · cap 10, rescaled, gated) ── */}
      <Section
        eyebrow="7. Signaux composites · v3"
        title="Sept flags Yahoo, cap 10 pts, near-52w-low GATED"
        sub={<>v3 : sub-bonuses rescaled 0.5×, cap global 10 pts (vs 20 en v2), le flag <Code>near-52w-low</Code> et <Code>oversold</Code> exigent désormais cluster ≥ 2 OU PDG/CFO. Le flag <Code>analyst-strong-buy</Code> est retiré (remplacé par un composant dédié <em>analyst-contrarian</em>). Source : <Code>src/lib/signals.ts</Code> computeComposite().</>}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "10px" }}>
          {[
            { name: "near-52w-low (gated)", thr: "pos < 20% range 52s · cluster/PDG/CFO", pts: "+2" },
            { name: "above-ma200",          thr: "prix ≥ MA200 × 1.05",                  pts: "+1" },
            { name: "oversold (gated)",     thr: "prix ≤ MA200 × 0.85 · cluster/PDG/CFO", pts: "+1" },
            { name: "upside-25pct",         thr: "target / prix ≥ 1.25",                 pts: "+2" },
            { name: "upside-15pct",         thr: "target / prix ≥ 1.15",                 pts: "+1" },
            { name: "value-combo",          thr: "P/E<15 & P/B<2 & FCF>0",               pts: "+1" },
            { name: "quality-combo",        thr: "ROE≥15% & marge≥10% & D/E<80",         pts: "+2" },
            { name: "insider-owned-high",   thr: "heldByInsiders ≥ 20%",                 pts: "+1" },
            { name: "short-squeeze",        thr: "shortRatio ≥ 5",                       pts: "+1" },
          ].map((s) => (
            <Card key={s.name} accent="var(--gold)" padding="12px 14px">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
                <code
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "0.78rem",
                    color: "var(--c-indigo-2)",
                    fontWeight: 600,
                  }}
                >
                  {s.name}
                </code>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--gold)" }}>{s.pts} pts</span>
              </div>
              <div style={{ fontSize: "0.74rem", color: "var(--tx-3)", marginTop: "4px", fontFamily: "'JetBrains Mono', monospace" }}>
                {s.thr}
              </div>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── 8. Reco engine ── */}
      <Section
        eyebrow="8. Moteur de recommandation"
        title="recoScore · 100 pts avec backtest"
        sub={<>Voir <Code>src/lib/recommendation-engine.ts</Code>. Cache <Code>unstable_cache</Code> 10 min pour <Code>general</Code> + <Code>sells</Code>.</>}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "10px" }}>
          {[
            { label: "Signal brut v3",       pts: "30", desc: "signalScore v3 / 100 × 30" },
            { label: "Win rate 90d (shr.)",  pts: "25", desc: "bucket role×size + shrinkage k=20" },
            { label: "Retour T+90 (shr.)",   pts: "20", desc: "cap +13%, shrinkage bayésien" },
            { label: "Récence (v3)",         pts: "15", desc: "exp decay half-life 45j + staleness" },
            { label: "Conviction",           pts: "10", desc: "cluster / % mcap / amount" },
          ].map((s) => (
            <Card key={s.label} accent="var(--c-indigo-2)" padding="14px 16px">
              <div style={{ fontSize: "0.82rem", color: "var(--tx-1)", fontWeight: 600, marginBottom: "3px" }}>{s.label}</div>
              <div style={{ fontSize: "1.3rem", fontFamily: "'Banana Grotesk', sans-serif", fontWeight: 700, color: "var(--c-indigo-2)", letterSpacing: "-0.03em" }}>{s.pts} pts</div>
              <div style={{ fontSize: "0.74rem", color: "var(--tx-3)", marginTop: "3px", fontFamily: "'JetBrains Mono', monospace" }}>{s.desc}</div>
            </Card>
          ))}
        </div>
        <Para>
          <strong style={{ color: "var(--tx-1)" }}>Filtres v3.</strong> Les recos BUY sont écartées si le retour T+90 shrunk du bucket est &lt; 2% ET signalScore &lt; 50 (combo signal faible + bucket faible). Les SELL utilisent la dominance directionnelle par société + filtre cross-trades (pas de seuil de return). Tout est par bucket role × taille avec 3 niveaux de fallback et shrinkage bayésien k=20 vers la moyenne globale BUY/SELL.
        </Para>
      </Section>

      {/* ── 9. Backtest ── */}
      <Section
        eyebrow="9. Backtest"
        title="Mesure des performances historiques"
        sub={<>{s.totalBacktest.toLocaleString("fr-FR")} déclarations backtestées ({s.buyBT.toLocaleString("fr-FR")} BUY + {s.sellBT.toLocaleString("fr-FR")} SELL). Horizons : T+30, T+60, T+90, T+160, T+365, T+730.</>}
      >
        <Para>
          <strong style={{ color: "var(--tx-1)" }}>Méthode.</strong> Pour chaque acquisition/cession avec un ISIN résolu, on fetch <Code>v8/finance/chart</Code> sur 10 ans. Le prix à T+N est cherché dans une fenêtre <strong>±12 jours calendaires</strong> autour de la cible (week-ends, jours fériés, suspensions de cotation). Si absent → <Code>null</Code>, jamais extrapolé.
        </Para>
        <Para>
          <strong style={{ color: "var(--tx-1)" }}>Look-ahead bias évité.</strong> Le backtest utilise uniquement les prix <em>disponibles à la date de la transaction</em>. Aucune information future ne pollue le score historique. Cache Prisma sur <Code>priceAtTrade</Code> pour éviter les recomputes.
        </Para>
        <Para>
          <strong style={{ color: "var(--tx-1)" }}>Job.</strong> <Code>/api/backtest/compute</Code> planifié tous les dimanches à 05:00 UTC. Traite jusqu&apos;à 300 nouvelles déclarations par run. Peut tourner plusieurs dimanches d&apos;affilée pour rattraper un backlog (scripts locaux disponibles pour reset massif).
        </Para>
      </Section>

      {/* ── 10. Emails ── */}
      <Section
        eyebrow="10. Digest emails"
        title="Nodemailer + template inline"
        sub="Architecture découplée : le rendu HTML vit dans src/lib/email.ts (renderDailyDigest), la composition par utilisateur dans src/lib/digest.ts (buildDigestForUser), le dispatcher dans /api/cron."
      >
        <Para>
          Trois sections dans chaque digest : (1) alertes portfolio · mouvements d&apos;insiders sur les positions de l&apos;utilisateur dans les 48 dernières heures, (2) top 3 BUY (lookback 7j), (3) top 3 SELL. Template HTML 100% inline, table-based pour la compat Outlook, pas d&apos;images externes (logo SVG inline).
        </Para>
        <Para>
          Subject personnalisé : <em>&laquo; 3 mouvements sur votre portfolio · Sigma &raquo;</em> ou <em>&laquo; Signaux du jour · 3 achats, 2 ventes &raquo;</em>. Preview text (teaser) calculé depuis la première ligne pertinente. Désabonnement en un clic vers <Code>/portfolio?settings=alerts</Code>.
        </Para>
        <Para>
          <strong style={{ color: "var(--tx-1)" }}>Transport.</strong> Gmail SMTP via Nodemailer + app password (<Code>GMAIL_APP_USER</Code> / <Code>GMAIL_APP_PASS</Code>). Test endpoint <Code>/api/admin/send-test-email</Code> pour itérer : <Code>?dry=1</Code> renvoie le HTML, <Code>?to=…</Code> envoie vraiment.
        </Para>
      </Section>

      {/* ── 11. Security ── */}
      <Section
        eyebrow="11. Sécurité"
        title="Beta lockdown + bonnes pratiques"
      >
        <Card accent="var(--signal-pos)">
          <ul style={{ fontSize: "0.88rem", color: "var(--tx-2)", lineHeight: 1.75, paddingLeft: "18px", margin: 0 }}>
            <li><strong style={{ color: "var(--tx-1)" }}>Middleware full-site</strong> : chaque page + API demande un JWT valide, sauf <Code>/auth/*</Code>, <Code>/api/auth/*</Code> et les routes cron (protégées par <Code>CRON_SECRET</Code>).</li>
            <li><strong style={{ color: "var(--tx-1)" }}>JWT HS256</strong> · secret 64 bytes aléatoires stockés uniquement dans Vercel env encrypted. <Code>auth.ts</Code> refuse de démarrer en prod sans <Code>JWT_SECRET ≥ 32 chars</Code>.</li>
            <li><strong style={{ color: "var(--tx-1)" }}>Cookie session</strong> : HttpOnly + Secure + SameSite=lax + maxAge 30j.</li>
            <li><strong style={{ color: "var(--tx-1)" }}>Passwords</strong> : bcryptjs cost 12 ; jamais en clair ; script <Code>scripts/set-admin-password.ts</Code> lit le mot de passe depuis argv/env.</li>
            <li><strong style={{ color: "var(--tx-1)" }}>Registration fermée</strong> : allow-list email dans <Code>register/route.ts</Code>. Autres emails → 403.</li>
            <li><strong style={{ color: "var(--tx-1)" }}>Admin endpoints</strong> : <Code>getCurrentUser().role === &quot;admin&quot;</Code> sinon 403. Le déclenchement de cron côté admin passe le <Code>CRON_SECRET</Code> server-side seulement.</li>
            <li><strong style={{ color: "var(--tx-1)" }}>.gitignore</strong> : <Code>.env*</Code> exclu. Aucun secret dans le repo (vérifié par grep).</li>
          </ul>
        </Card>
      </Section>

      {/* ── 12. Data model ── */}
      <Section
        eyebrow="12. Modèle de données"
        title="Principaux tables Prisma"
      >
        <div style={{ border: "1px solid var(--border-med)", borderRadius: "3px" }}>
          {[
            { t: "Company", keys: "id · name · slug · amfToken · isin · marketCap · currentPrice · fiftyTwoWeekHigh/Low · twoHundredDayAverage · analystScore · targetMean · trailingPE · priceToBook · returnOnEquity · profitMargin · heldByInsiders/Institutions · shortRatio · logoUrl · yahooSymbol · financialsAt · analystAt · priceAt" },
            { t: "Declaration", keys: "id · amfId · type · companyId · insiderName · insiderFunction · transactionNature · totalAmount · volume · unitPrice · isin · pdfParsed · signalScore · pctOfMarketCap · pctOfInsiderFlow · insiderCumNet · isCluster · transactionDate · pubDate · scoredAt · link" },
            { t: "Insider", keys: "id · name · slug · gender · companies[] · declarations[]" },
            { t: "BacktestResult", keys: "declarationId (unique) · direction (BUY|SELL) · priceAtTrade · price30d/60/90/160/365/730 · return30d/.../return730d · computedAt" },
            { t: "User", keys: "id · email (unique) · password · firstName · lastName · role · isBanned · emailVerified · alertEnabled · lastAlertAt · lastLoginAt · portfolioCash · credits · creditsUpdatedAt" },
            { t: "PortfolioPosition", keys: "id · userId · name · isin · yahooSymbol · quantity · buyingPrice · currentPrice · totalInvested · currentValue · pnl · pnlPct · fromApp · alertAbove · alertBelow" },
          ].map((row, i, all) => (
            <div
              key={row.t}
              style={{
                padding: "12px 16px",
                borderBottom: i < all.length - 1 ? "1px solid var(--border)" : "none",
                background: i % 2 === 0 ? "var(--bg-surface)" : "transparent",
              }}
            >
              <div style={{ fontFamily: "'Banana Grotesk', sans-serif", fontSize: "0.95rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "3px" }}>
                {row.t}
              </div>
              <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.74rem", color: "var(--tx-3)", lineHeight: 1.55 }}>
                {row.keys}
              </code>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 13. Improvements / Roadmap ── */}
      <Section
        eyebrow="13. Améliorations possibles"
        title="Roadmap technique"
        sub="Liste des pistes identifiées, classées par impact estimé. À discuter et prioriser."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { title: "Queue + workers pour l'ingestion", body: "Remplacer les routes sync monolithiques par un système de queue (BullMQ / Upstash QStash) : chaque PDF parsé dans un job isolé avec retry. Gain : résilience, observabilité par job, pas de timeout Vercel 300s à gérer." },
            { title: "Audit log persistent", body: "Table AuditEvent {id, userId, action, meta, at} pour tracer chaque action admin (ban, promote, set_credits, run-cron). Historique consultable dans l'admin." },
            { title: "Rate-limit côté app", body: "Middleware edge qui limite les appels /api/auth/login à 5/min par IP pour contrer le brute force (en complément du retry exponentiel UI)." },
            { title: "Cache distribué Redis", body: "Remplacer unstable_cache (per-region Vercel) par un cache Redis unique (Upstash) pour recos, logos, backtest stats. Gain : cohérence multi-région, TTL plus fins, invalidation ciblée." },
            { title: "Scoring v4 · régression historique", body: "La v3 utilise un barème fixe (18/16/14/14/10/…). Prochaine étape : régresser ces poids sur le return T+90 historique (logistic regression ou gradient boosting). Cross-validation walk-forward pour éviter le look-ahead." },
            { title: "Cluster detection probabiliste", body: "Actuellement : binaire (≥2 insiders distincts en 30j). Passer à un score continu basé sur la densité temporelle + taille de chaque trade + diversité des rôles." },
            { title: "Prix intraday + événements corporate", body: "Yahoo n'a pas les split/dividends structurés. Intégrer une source payante (Stooq, EOD, Alpaca) pour ajuster les backtests des annonces de dividende/split rétroactivement." },
            { title: "SEC EDGAR (ADR US cotés FR)", body: "Certaines sociétés cotées à Paris ont aussi des filings US (Form 4). Permettrait de croiser les insider trades FR avec les trades US." },
            { title: "Recherche full-text", body: "Ajouter PostgreSQL tsvector + GIN index sur company.name + insider.name pour une recherche FR accent-insensitive plus rapide que le LIKE actuel." },
            { title: "WebSockets pour la home", body: "Push en temps réel des nouvelles déclarations dès que /api/sync-latest en intègre. Nécessite une table Event + un canal Pusher / Ably ou Server-Sent Events." },
            { title: "Tests (absents aujourd'hui)", body: "Aucun test unitaire / E2E. Piste : Vitest pour les utilitaires (signals, recommendation-engine), Playwright pour les parcours auth + admin." },
            { title: "Observability", body: "Intégrer Sentry pour capturer les erreurs runtime + Vercel Analytics (ou Posthog) pour les events UI. Dashboard Grafana/Uptrace pour les cron runs." },
            { title: "Monétisation beta → pro", body: "Enrichir le modèle User.credits pour gérer facturation (Stripe). Offre basique gratuite / Sigma Pro 19€/mois pour alertes mail personnalisées + recos illimitées." },
          ].map((row) => (
            <Card key={row.title} accent="var(--c-violet)" padding="14px 18px">
              <h3 style={{ fontSize: "0.96rem", fontWeight: 700, color: "var(--tx-1)", marginBottom: "4px", letterSpacing: "-0.01em" }}>
                {row.title}
              </h3>
              <p style={{ fontSize: "0.84rem", color: "var(--tx-2)", lineHeight: 1.6, margin: 0 }}>
                {row.body}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── Footer links ── */}
      <section
        style={{
          marginTop: "32px",
          paddingTop: "24px",
          borderTop: "1px solid var(--border-med)",
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <p style={{ fontSize: "0.78rem", color: "var(--tx-3)", margin: 0, lineHeight: 1.55 }}>
          Documentation interne · se met à jour automatiquement avec les compteurs live.
        </p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link href="/admin/" className="btn btn-outline" style={{ fontSize: "0.82rem" }}>
            ← Retour admin
          </Link>
          <Link href="/methodologie/" className="btn btn-primary" style={{ fontSize: "0.82rem" }}>
            Méthodologie publique ↗
          </Link>
        </div>
      </section>
    </div>
  );
}
