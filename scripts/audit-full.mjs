/**
 * Full-system audit:
 *   1. Data freshness & cron health (last sync, gaps)
 *   2. Declaration mapping completeness (company / insider links)
 *   3. Transaction amount / ISIN / date coverage
 *   4. Signal scoring coverage
 *   5. Backtest coverage
 *   6. Company enrichment (Yahoo, logos)
 *   7. Anomaly detection (orphans, duplicates, suspicious values)
 *
 * Usage: `node scripts/audit-full.mjs`
 * Env:    DATABASE_URL must be set (read from .env.local / .env)
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const COLORS = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  red:    "\x1b[31m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  blue:   "\x1b[34m",
  cyan:   "\x1b[36m",
};

const line = (n = 78) => "─".repeat(n);
const H = (title) => console.log(`\n${COLORS.bold}${COLORS.cyan}${line()}\n${title}\n${line()}${COLORS.reset}`);
const ok = (msg)   => console.log(`${COLORS.green}  ✓ ${msg}${COLORS.reset}`);
const warn = (msg) => console.log(`${COLORS.yellow}  ! ${msg}${COLORS.reset}`);
const bad = (msg)  => console.log(`${COLORS.red}  ✗ ${msg}${COLORS.reset}`);
const info = (msg) => console.log(`    ${COLORS.dim}${msg}${COLORS.reset}`);
const kv = (k, v, severity = "info") => {
  const color = severity === "ok" ? COLORS.green : severity === "warn" ? COLORS.yellow : severity === "bad" ? COLORS.red : COLORS.reset;
  console.log(`    ${COLORS.dim}${k.padEnd(42)}${COLORS.reset} ${color}${v}${COLORS.reset}`);
};

const now = Date.now();
const HOUR = 3600_000;
const DAY = 86400_000;
const issues = [];
const warnings = [];

function addIssue(msg)   { issues.push(msg); }
function addWarning(msg) { warnings.push(msg); }

// ═════════════════════════════════════════════════════════════════════════════
// 1. DATA FRESHNESS & CRON HEALTH
// ═════════════════════════════════════════════════════════════════════════════
async function auditFreshness() {
  H("1. FRAÎCHEUR DES DONNÉES (cron health)");

  const [totalAll, totalDirigeants] = await Promise.all([
    p.declaration.count(),
    p.declaration.count({ where: { type: "DIRIGEANTS" } }),
  ]);

  kv("Total déclarations (toutes)", totalAll.toLocaleString("fr-FR"));
  kv("  dont DIRIGEANTS",            totalDirigeants.toLocaleString("fr-FR"));

  // Last ingestion = max createdAt (when row was written to DB)
  const [lastIngested, lastPubDate] = await Promise.all([
    p.declaration.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true, amfId: true } }),
    p.declaration.findFirst({ where: { type: "DIRIGEANTS" }, orderBy: { pubDate: "desc" }, select: { pubDate: true, amfId: true, company: { select: { name: true } } } }),
  ]);

  if (lastIngested) {
    const ageH = (now - lastIngested.createdAt.getTime()) / HOUR;
    const severity = ageH < 2 ? "ok" : ageH < 24 ? "warn" : "bad";
    kv("Dernière ingestion (createdAt)", `${lastIngested.createdAt.toISOString()} · il y a ${ageH.toFixed(1)} h`, severity);
    if (ageH > 24) addIssue(`Aucune nouvelle déclaration depuis ${ageH.toFixed(1)} h — le cron horaire ne tourne pas ou AMF n'a rien publié`);
    else if (ageH > 2) addWarning(`Dernière ingestion il y a ${ageH.toFixed(1)} h (sync horaire → attendu < 2h)`);
    info(`ref amfId: ${lastIngested.amfId}`);
  }

  if (lastPubDate) {
    const ageH = (now - lastPubDate.pubDate.getTime()) / HOUR;
    const severity = ageH < 24 ? "ok" : ageH < 72 ? "warn" : "bad";
    kv("Dernière publication AMF", `${lastPubDate.pubDate.toISOString()} · il y a ${ageH.toFixed(1)} h`, severity);
    info(`société: ${lastPubDate.company?.name ?? "?"} · amfId: ${lastPubDate.amfId}`);
  }

  // Counts by time window
  const windows = [
    { label: "Créées dans les 6h",   since: new Date(now - 6 * HOUR) },
    { label: "Créées dans les 24h",  since: new Date(now - 24 * HOUR) },
    { label: "Créées dans les 7j",   since: new Date(now - 7 * DAY) },
    { label: "Publiées dans les 24h", since: new Date(now - 24 * HOUR), pubField: true },
    { label: "Publiées dans les 7j",  since: new Date(now - 7 * DAY),   pubField: true },
  ];
  for (const w of windows) {
    const field = w.pubField ? "pubDate" : "createdAt";
    const n = await p.declaration.count({
      where: { type: "DIRIGEANTS", [field]: { gte: w.since } },
    });
    kv(w.label, n.toLocaleString("fr-FR"));
  }

  // Detect gaps: last 14 days, any day with 0 declarations?
  const days = 14;
  const countsByDay = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(now - (i + 1) * DAY);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + DAY);
    const count = await p.declaration.count({
      where: { type: "DIRIGEANTS", pubDate: { gte: start, lt: end } },
    });
    countsByDay.push({ day: start.toISOString().slice(0, 10), count, weekday: start.getUTCDay() });
  }

  const zeroWeekdays = countsByDay.filter((d) => d.count === 0 && d.weekday >= 1 && d.weekday <= 5);
  console.log(`\n    ${COLORS.dim}Historique 14 jours (pubDate) :${COLORS.reset}`);
  for (const d of countsByDay) {
    const wd = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"][d.weekday];
    const isWeekend = d.weekday === 0 || d.weekday === 6;
    const bar = d.count > 0
      ? "█".repeat(Math.min(40, Math.ceil(d.count / 3)))
      : (isWeekend ? `${COLORS.dim}·${COLORS.reset}` : `${COLORS.red}GAP${COLORS.reset}`);
    console.log(`    ${COLORS.dim}${d.day} ${wd}${COLORS.reset} ${String(d.count).padStart(3)}  ${bar}`);
  }
  if (zeroWeekdays.length > 0) {
    addWarning(`${zeroWeekdays.length} jour(s) ouvré(s) sans aucune déclaration AMF sur 14j : ${zeroWeekdays.map(d => d.day).join(", ")}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. COMPANY/INSIDER MAPPING COVERAGE
// ═════════════════════════════════════════════════════════════════════════════
async function auditMapping() {
  H("2. MAPPING société ↔ initié ↔ déclaration");

  const [
    totalDecls,
    withCompany,
    withInsider,
    noInsider,
    noName,
    insidersTotal,
    companiesTotal,
    insidersWithoutCompany,
    companiesWithoutDecls,
    insiderLinksTotal,
    ghostInsiderRefs,
  ] = await Promise.all([
    p.declaration.count({ where: { type: "DIRIGEANTS" } }),
    p.declaration.count({ where: { type: "DIRIGEANTS", companyId: { not: undefined } } }),
    p.declaration.count({ where: { type: "DIRIGEANTS", insiderId: { not: null } } }),
    p.declaration.count({ where: { type: "DIRIGEANTS", insiderId: null } }),
    p.declaration.count({ where: { type: "DIRIGEANTS", insiderName: null } }),
    p.insider.count(),
    p.company.count(),
    p.insider.count({ where: { companies: { none: {} } } }),
    p.company.count({ where: { declarations: { none: {} } } }),
    p.companyInsider.count(),
    p.declaration.count({
      where: {
        type: "DIRIGEANTS",
        insiderName: { not: null },
        insiderId: null,
      },
    }),
  ]);

  kv("Total déclarations DIRIGEANTS", totalDecls.toLocaleString("fr-FR"));
  kv("  liées à une société",          `${withCompany} (${pct(withCompany, totalDecls)})`,  withCompany === totalDecls ? "ok" : "bad");
  kv("  liées à un initié",            `${withInsider} (${pct(withInsider, totalDecls)})`,  withInsider / totalDecls > 0.9 ? "ok" : withInsider / totalDecls > 0.7 ? "warn" : "bad");
  kv("  sans initié lié (mais avec nom)", ghostInsiderRefs.toLocaleString("fr-FR"), ghostInsiderRefs === 0 ? "ok" : "warn");
  kv("  sans insiderName parsé",       `${noName} (${pct(noName, totalDecls)})`,            noName / totalDecls < 0.05 ? "ok" : "warn");

  if (withInsider / totalDecls < 0.85) {
    addWarning(`Seulement ${pct(withInsider, totalDecls)} des déclarations sont liées à un insider (cible ≥ 85%)`);
  }

  console.log();
  kv("Total sociétés",       companiesTotal.toLocaleString("fr-FR"));
  kv("  sans aucune déclaration", companiesWithoutDecls.toLocaleString("fr-FR"), companiesWithoutDecls === 0 ? "ok" : "warn");
  kv("Total initiés",        insidersTotal.toLocaleString("fr-FR"));
  kv("  sans société liée (orphelins)", insidersWithoutCompany.toLocaleString("fr-FR"), insidersWithoutCompany === 0 ? "ok" : "warn");
  kv("Liens company-insider", insiderLinksTotal.toLocaleString("fr-FR"));

  if (companiesWithoutDecls > 0) {
    addWarning(`${companiesWithoutDecls} sociétés sans aucune déclaration (sociétés zombie)`);
  }
  if (insidersWithoutCompany > 0) {
    addWarning(`${insidersWithoutCompany} initiés sans lien société (insiders orphelins)`);
  }
  if (ghostInsiderRefs > 50) {
    addWarning(`${ghostInsiderRefs} déclarations ont un insiderName mais aucun insiderId — problème de résolution d'insider`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. PARSING COMPLETENESS (fields extracted from PDF)
// ═════════════════════════════════════════════════════════════════════════════
async function auditParsing() {
  H("3. PARSING PDF AMF (extraction des champs clés)");

  const total = await p.declaration.count({ where: { type: "DIRIGEANTS" } });
  const fields = [
    ["pdfParsed",         { pdfParsed: true }],
    ["transactionNature", { transactionNature: { not: null } }],
    ["insiderName",       { insiderName: { not: null } }],
    ["insiderFunction",   { insiderFunction: { not: null } }],
    ["instrumentType",    { instrumentType: { not: null } }],
    ["isin",              { isin: { not: null } }],
    ["unitPrice",         { unitPrice: { not: null } }],
    ["volume",            { volume: { not: null } }],
    ["totalAmount",       { totalAmount: { not: null } }],
    ["transactionDate",   { transactionDate: { not: null } }],
  ];

  for (const [label, where] of fields) {
    const n = await p.declaration.count({ where: { type: "DIRIGEANTS", ...where } });
    const pctStr = pct(n, total);
    const severity = n / total > 0.95 ? "ok" : n / total > 0.80 ? "warn" : "bad";
    kv(label.padEnd(20), `${n.toLocaleString("fr-FR")} (${pctStr})`, severity);
    if (severity === "bad") addWarning(`Couverture ${label} = ${pctStr} (cible ≥ 80%)`);
  }

  // Suspicious values
  console.log();
  const [
    zeroAmountBuys,
    zeroPriceBuys,
    futureDates,
    ancientDates,
    outOfOrder,
  ] = await Promise.all([
    p.declaration.count({
      where: {
        type: "DIRIGEANTS",
        transactionNature: { contains: "Acquisition", mode: "insensitive" },
        totalAmount: { lte: 0 },
      },
    }),
    p.declaration.count({
      where: {
        type: "DIRIGEANTS",
        transactionNature: { contains: "Acquisition", mode: "insensitive" },
        unitPrice: 0,
        totalAmount: null,
      },
    }),
    p.declaration.count({
      where: {
        type: "DIRIGEANTS",
        transactionDate: { gt: new Date(now + DAY) }, // transactionDate in the future
      },
    }),
    p.declaration.count({
      where: {
        type: "DIRIGEANTS",
        transactionDate: { lt: new Date("2010-01-01") },
      },
    }),
    // Transactions dated more than 90 days BEFORE their publication
    p.$queryRaw`
      SELECT COUNT(*)::int AS n
      FROM "Declaration"
      WHERE "type" = 'DIRIGEANTS'
        AND "transactionDate" IS NOT NULL
        AND "pubDate" - "transactionDate" > INTERVAL '90 days'
    `,
  ]);

  kv("Montant ≤ 0 sur acquisition",    zeroAmountBuys.toLocaleString("fr-FR"), zeroAmountBuys === 0 ? "ok" : "warn");
  kv("Prix & montant ∅ sur acquisition", zeroPriceBuys.toLocaleString("fr-FR"), zeroPriceBuys === 0 ? "ok" : "warn");
  kv("Dates transaction dans le futur", futureDates.toLocaleString("fr-FR"), futureDates === 0 ? "ok" : "bad");
  kv("Dates transaction < 2010",        ancientDates.toLocaleString("fr-FR"), ancientDates === 0 ? "ok" : "warn");
  kv("Transaction > 90j avant publication", (outOfOrder[0]?.n ?? 0).toLocaleString("fr-FR"), (outOfOrder[0]?.n ?? 0) < 50 ? "ok" : "warn");

  if (futureDates > 0)   addIssue(`${futureDates} déclarations ont une transactionDate dans le futur`);
  if (zeroAmountBuys > 0) addWarning(`${zeroAmountBuys} acquisitions avec totalAmount ≤ 0 (probable mauvais parsing)`);
  if ((outOfOrder[0]?.n ?? 0) > 50) addWarning(`${outOfOrder[0].n} transactions datées >90j avant publication — vérifier le parsing des dates OCR`);
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. SIGNAL SCORING COVERAGE
// ═════════════════════════════════════════════════════════════════════════════
async function auditScoring() {
  H("4. SCORING DES SIGNAUX (signalScore 0–100)");

  const total = await p.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true } });
  const [scored, scoredHigh, scoredRecent, unscoredRecent, scoreStats] = await Promise.all([
    p.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true, signalScore: { not: null } } }),
    p.declaration.count({ where: { type: "DIRIGEANTS", pdfParsed: true, signalScore: { gte: 70 } } }),
    p.declaration.count({
      where: {
        type: "DIRIGEANTS",
        pdfParsed: true,
        signalScore: { not: null },
        pubDate: { gte: new Date(now - 7 * DAY) },
      },
    }),
    p.declaration.count({
      where: {
        type: "DIRIGEANTS",
        pdfParsed: true,
        signalScore: null,
        pubDate: { gte: new Date(now - 7 * DAY) },
      },
    }),
    p.declaration.aggregate({
      where: { type: "DIRIGEANTS", pdfParsed: true, signalScore: { not: null } },
      _avg: { signalScore: true, pctOfMarketCap: true },
      _min: { signalScore: true },
      _max: { signalScore: true },
    }),
  ]);

  kv("Déclarations parsées", total.toLocaleString("fr-FR"));
  kv("  avec signalScore",  `${scored.toLocaleString("fr-FR")} (${pct(scored, total)})`, scored / total > 0.95 ? "ok" : "warn");
  kv("  score ≥ 70 (reco)", scoredHigh.toLocaleString("fr-FR"));
  kv("Scorées sur les 7 derniers jours", scoredRecent.toLocaleString("fr-FR"));
  kv("  NON scorées (même période)",     unscoredRecent.toLocaleString("fr-FR"), unscoredRecent === 0 ? "ok" : unscoredRecent < 10 ? "warn" : "bad");

  if (unscoredRecent > 10) {
    addWarning(`${unscoredRecent} déclarations récentes non scorées — le cron de scoring tourne-t-il ?`);
  }

  if (scoreStats._avg.signalScore != null) {
    kv("Score moyen",   scoreStats._avg.signalScore?.toFixed(1) ?? "—");
    kv("Score min/max", `${scoreStats._min.signalScore?.toFixed(1)} / ${scoreStats._max.signalScore?.toFixed(1)}`);
    kv("% mcap moyen",  `${(scoreStats._avg.pctOfMarketCap ?? 0).toFixed(3)}%`);
  }

  // Age of most recent scoring
  const lastScore = await p.declaration.findFirst({
    where: { scoredAt: { not: null } },
    orderBy: { scoredAt: "desc" },
    select: { scoredAt: true },
  });
  if (lastScore) {
    const ageH = (now - lastScore.scoredAt.getTime()) / HOUR;
    kv("Dernier scoring (scoredAt)", `${lastScore.scoredAt.toISOString()} · il y a ${ageH.toFixed(1)} h`, ageH < 48 ? "ok" : "warn");
    if (ageH > 72) addWarning(`Aucun scoring depuis ${ageH.toFixed(1)} h — relancer /api/score-signals`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. BACKTEST COVERAGE
// ═════════════════════════════════════════════════════════════════════════════
async function auditBacktest() {
  H("5. BACKTEST (retours T+30 à T+730)");

  const [bts, btBuys, btSells, withReturn90, avgReturn90, lastBt] = await Promise.all([
    p.backtestResult.count(),
    p.backtestResult.count({ where: { direction: "BUY" } }),
    p.backtestResult.count({ where: { direction: "SELL" } }),
    p.backtestResult.count({ where: { return90d: { not: null } } }),
    p.backtestResult.aggregate({
      _avg: { return30d: true, return60d: true, return90d: true, return365d: true, return730d: true },
    }),
    p.backtestResult.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
  ]);

  // Declarations eligible (parsed, has ISIN, has yahooSymbol) without a backtest result
  const eligibleNoBt = await p.declaration.count({
    where: {
      type: "DIRIGEANTS",
      pdfParsed: true,
      isin: { not: null },
      transactionNature: { not: null },
      backtestResult: null,
      company: { yahooSymbol: { not: null } },
    },
  });

  kv("Total backtests calculés", bts.toLocaleString("fr-FR"));
  kv("  BUY",  btBuys.toLocaleString("fr-FR"));
  kv("  SELL", btSells.toLocaleString("fr-FR"));
  kv("  avec return90d renseigné", `${withReturn90} (${pct(withReturn90, bts)})`);
  kv("Éligibles SANS backtest",    eligibleNoBt.toLocaleString("fr-FR"), eligibleNoBt < 100 ? "ok" : eligibleNoBt < 1000 ? "warn" : "bad");

  if (eligibleNoBt > 1000) addWarning(`${eligibleNoBt} déclarations éligibles sans backtest (cron hebdomadaire rattrape 300/run)`);

  if (avgReturn90._avg.return90d != null) {
    kv("Retour moyen T+30",  pctNum(avgReturn90._avg.return30d));
    kv("Retour moyen T+60",  pctNum(avgReturn90._avg.return60d));
    kv("Retour moyen T+90",  pctNum(avgReturn90._avg.return90d));
    kv("Retour moyen T+365", pctNum(avgReturn90._avg.return365d));
    kv("Retour moyen T+730", pctNum(avgReturn90._avg.return730d));
  }

  if (lastBt) {
    const ageDays = (now - lastBt.computedAt.getTime()) / DAY;
    kv("Dernier calcul backtest", `${lastBt.computedAt.toISOString()} · il y a ${ageDays.toFixed(1)} j`, ageDays < 10 ? "ok" : "warn");
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. COMPANY ENRICHMENT (Yahoo Finance, logos)
// ═════════════════════════════════════════════════════════════════════════════
async function auditEnrichment() {
  H("6. ENRICHISSEMENT SOCIÉTÉS (Yahoo Finance + logos)");

  const total = await p.company.count();
  const fields = [
    ["yahooSymbol",    { yahooSymbol:    { not: null } }],
    ["marketCap",      { marketCap:      { not: null } }],
    ["currentPrice",   { currentPrice:   { not: null } }],
    ["trailingPE",     { trailingPE:     { not: null } }],
    ["analystReco",    { analystReco:    { not: null } }],
    ["targetMean",     { targetMean:     { not: null } }],
    ["dividendYield",  { dividendYield:  { not: null } }],
    ["logoUrl",        { logoUrl:        { not: null } }],
    ["isin",           { isin:           { not: null } }],
  ];

  for (const [label, where] of fields) {
    const n = await p.company.count({ where });
    const severity = n / total > 0.80 ? "ok" : n / total > 0.50 ? "warn" : "bad";
    kv(label.padEnd(20), `${n.toLocaleString("fr-FR")} (${pct(n, total)})`, severity);
  }

  // Stale price data
  const stalePrices = await p.company.count({
    where: {
      currentPrice: { not: null },
      priceAt: { lt: new Date(now - 7 * DAY) },
    },
  });
  const freshPrices = await p.company.count({
    where: {
      currentPrice: { not: null },
      priceAt: { gte: new Date(now - 2 * DAY) },
    },
  });
  const withPrice = await p.company.count({ where: { currentPrice: { not: null } } });

  console.log();
  kv("Prix < 48h (frais)", `${freshPrices} / ${withPrice} (${pct(freshPrices, withPrice || 1)})`, freshPrices / (withPrice || 1) > 0.8 ? "ok" : "warn");
  kv("Prix > 7j (stale)",  `${stalePrices} / ${withPrice} (${pct(stalePrices, withPrice || 1)})`, stalePrices / (withPrice || 1) < 0.15 ? "ok" : "warn");

  // Logo coverage per company that actually has declarations
  const activeCompanies = await p.company.count({ where: { declarations: { some: { type: "DIRIGEANTS" } } } });
  const activeWithLogo = await p.company.count({
    where: { declarations: { some: { type: "DIRIGEANTS" } }, logoUrl: { not: null } },
  });
  kv("Logo sur sociétés actives", `${activeWithLogo} / ${activeCompanies} (${pct(activeWithLogo, activeCompanies)})`, activeWithLogo / activeCompanies > 0.85 ? "ok" : "warn");
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. ANOMALIES (duplicates, invariants)
// ═════════════════════════════════════════════════════════════════════════════
async function auditAnomalies() {
  H("7. ANOMALIES & INVARIANTS");

  const dupAmfIds = await p.$queryRaw`
    SELECT "amfId", COUNT(*)::int AS n
    FROM "Declaration"
    GROUP BY "amfId"
    HAVING COUNT(*) > 1
    LIMIT 5
  `;
  const dupCompanySlugs = await p.$queryRaw`
    SELECT "slug", COUNT(*)::int AS n
    FROM "Company"
    GROUP BY "slug"
    HAVING COUNT(*) > 1
    LIMIT 5
  `;
  const dupInsiderSlugs = await p.$queryRaw`
    SELECT "slug", COUNT(*)::int AS n
    FROM "Insider"
    GROUP BY "slug"
    HAVING COUNT(*) > 1
    LIMIT 5
  `;

  kv("Doublons amfId",       dupAmfIds.length,       dupAmfIds.length === 0 ? "ok" : "bad");
  kv("Doublons company.slug", dupCompanySlugs.length, dupCompanySlugs.length === 0 ? "ok" : "bad");
  kv("Doublons insider.slug", dupInsiderSlugs.length, dupInsiderSlugs.length === 0 ? "ok" : "bad");
  if (dupAmfIds.length)      addIssue(`Doublons amfId détectés : ${dupAmfIds.map(r => r.amfId).join(", ")}`);
  if (dupCompanySlugs.length) addIssue(`Doublons company.slug détectés : ${dupCompanySlugs.map(r => r.slug).join(", ")}`);
  if (dupInsiderSlugs.length) addIssue(`Doublons insider.slug détectés : ${dupInsiderSlugs.map(r => r.slug).join(", ")}`);

  // Monstrous outliers (probable OCR errors)
  const [hugeAmount, hugePct, tinyPrice] = await Promise.all([
    p.declaration.count({ where: { totalAmount: { gt: 1_000_000_000 } } }), // > 1 Md€
    p.declaration.count({ where: { pctOfMarketCap: { gt: 50 } } }),          // > 50% mcap
    p.declaration.count({ where: { unitPrice: { gt: 0, lt: 0.001 } } }),      // < 0.001€
  ]);
  kv("Montants > 1 Md€",      hugeAmount, hugeAmount === 0 ? "ok" : "warn");
  kv("% mcap > 50%",          hugePct,    hugePct === 0 ? "ok" : "warn");
  kv("Prix unitaire < 0,001€", tinyPrice,  tinyPrice === 0 ? "ok" : "warn");

  if (hugeAmount > 0) addWarning(`${hugeAmount} déclarations avec totalAmount > 1 Md€ (probable erreur OCR, à investiguer)`);
  if (hugePct > 0)    addWarning(`${hugePct} déclarations avec %mcap > 50% (probable erreur)`);
  if (tinyPrice > 0)  addWarning(`${tinyPrice} déclarations avec prix unitaire < 0,001€ (probable erreur)`);

  // Backtest sanity: negative priceAtTrade
  const badBt = await p.backtestResult.count({ where: { priceAtTrade: { lte: 0 } } });
  kv("Backtests avec priceAtTrade ≤ 0", badBt, badBt === 0 ? "ok" : "warn");
  if (badBt > 0) addWarning(`${badBt} backtests avec priceAtTrade ≤ 0 — à purger`);
}

// ═════════════════════════════════════════════════════════════════════════════
// Utils
// ═════════════════════════════════════════════════════════════════════════════

function pct(n, total) {
  if (!total) return "—";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function pctNum(n) {
  if (n == null) return "—";
  const color = n > 0 ? COLORS.green : n < 0 ? COLORS.red : COLORS.dim;
  return `${color}${n > 0 ? "+" : ""}${n.toFixed(2)}%${COLORS.reset}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Main
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`${COLORS.bold}${COLORS.blue}`);
  console.log("╔══════════════════════════════════════════════════════════════════════════════╗");
  console.log("║  AUDIT COMPLET — Insiders Trades Sigma                                       ║");
  console.log(`║  ${new Date().toISOString()}                                              ║`);
  console.log("╚══════════════════════════════════════════════════════════════════════════════╝");
  console.log(COLORS.reset);

  try {
    await auditFreshness();
    await auditMapping();
    await auditParsing();
    await auditScoring();
    await auditBacktest();
    await auditEnrichment();
    await auditAnomalies();
  } catch (e) {
    console.error(`${COLORS.red}FATAL:${COLORS.reset}`, e);
    process.exit(1);
  }

  // Final summary
  H("SYNTHÈSE");
  if (issues.length === 0 && warnings.length === 0) {
    ok("Aucun problème détecté.");
  } else {
    if (issues.length > 0) {
      console.log(`\n${COLORS.red}${COLORS.bold}ISSUES CRITIQUES (${issues.length}) :${COLORS.reset}`);
      issues.forEach((i, n) => bad(`${n + 1}. ${i}`));
    }
    if (warnings.length > 0) {
      console.log(`\n${COLORS.yellow}${COLORS.bold}WARNINGS (${warnings.length}) :${COLORS.reset}`);
      warnings.forEach((w, n) => warn(`${n + 1}. ${w}`));
    }
  }

  await p.$disconnect();
}

main();
