/**
 * Grid search V2 — approach robuste :
 *
 *   Pour chaque année, on calcule le rendement MOYEN des signaux matchant
 *   le filtre (rendement 'returnFromPub90d' moyen - 1% de frais). C'est le
 *   rendement d'un portefeuille équipondéré sur tous les signaux de l'année.
 *
 *   Pas de contrainte de "rebalancement mensuel" qui élimine les années avec
 *   peu de signaux — on utilise l'info disponible.
 *
 * Critère gagnant : la stratégie bat le CAC 40 chaque année entre 2022 et 2026
 * (années où on a ≥ 5 signaux matchant).
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" };
const DAY = 86400_000;
const TRANSACTION_COST = 1.0;

function mean(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0; }
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function std(arr) { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map((x) => (x - m) ** 2))); }

function roleCategory(fn) {
  if (!fn) return "other";
  const f = fn.toLowerCase();
  if (/directeur.?g[éeè]n[éeè]ral|pdg|pr[ée]sident.{0,20}directeur|ceo/i.test(f)) return "ceo";
  if (/directeur.?financier|cfo|daf/i.test(f)) return "cfo";
  if (/directeur|director/i.test(f)) return "director";
  if (/membre.{0,20}conseil|administrateur|board/i.test(f)) return "board";
  return "other";
}

console.log(`${C.cyan}Loading data…${C.reset}`);
const rows = await p.backtestResult.findMany({
  where: {
    direction: "BUY",
    returnFromPub90d: { not: null },
    priceAtPub: { gt: 0 },
    declaration: { type: "DIRIGEANTS", pdfParsed: true, pubDate: { gte: new Date("2022-01-01") } },
  },
  select: {
    returnFromPub30d: true, returnFromPub90d: true, returnFromPub365d: true,
    declaration: {
      select: {
        pubDate: true, transactionDate: true,
        signalScore: true, totalAmount: true, pctOfMarketCap: true,
        isCluster: true, insiderFunction: true,
        transactionNature: true,
        company: { select: { marketCap: true, slug: true, analystReco: true } },
      },
    },
  },
});

const allBts = rows.map((r) => {
  const pd = r.declaration.pubDate;
  const td = r.declaration.transactionDate;
  return {
    year: pd.getUTCFullYear(),
    ret30: r.returnFromPub30d,
    ret90: r.returnFromPub90d,
    ret365: r.returnFromPub365d,
    score: r.declaration.signalScore ?? 0,
    amount: r.declaration.totalAmount ?? 0,
    pctMcap: r.declaration.pctOfMarketCap ?? 0,
    cluster: r.declaration.isCluster === true,
    role: roleCategory(r.declaration.insiderFunction),
    nature: (r.declaration.transactionNature ?? "").toLowerCase(),
    freshDays: td ? (pd.getTime() - td.getTime()) / DAY : 999,
    mcapEur: r.declaration.company.marketCap ? Number(r.declaration.company.marketCap) : 0,
    companySlug: r.declaration.company.slug,
    analystReco: r.declaration.company.analystReco,
  };
});
console.log(`${C.dim}  ${allBts.length} backtests loaded (2022-2026)${C.reset}`);

// ── CAC 40 per-year returns ────────────────────────────────────────────────
async function loadCacPerYear() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EFCHI?interval=1d&range=10y";
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const d = await r.json();
  const ts = d?.chart?.result?.[0]?.timestamp ?? [];
  const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  const byYear = {};
  for (let i = 0; i < closes.length; i++) {
    if (!closes[i]) continue;
    const date = new Date(ts[i] * 1000);
    const y = date.getUTCFullYear();
    if (!byYear[y]) byYear[y] = { first: closes[i], last: closes[i] };
    else byYear[y].last = closes[i];
  }
  const result = {};
  for (const [y, { first, last }] of Object.entries(byYear)) {
    result[y] = ((last - first) / first) * 100;
  }
  return result;
}
const cacByYear = await loadCacPerYear();
console.log(`${C.dim}  CAC 40 par an : 2022=${cacByYear[2022]?.toFixed(1)}% · 2023=${cacByYear[2023]?.toFixed(1)}% · 2024=${cacByYear[2024]?.toFixed(1)}% · 2025=${cacByYear[2025]?.toFixed(1)}% · 2026=${cacByYear[2026]?.toFixed(1)}%${C.reset}\n`);

// ── Strategy evaluator (equal-weighted average) ──────────────────────────
function evalStrategy(filter, opts = {}) {
  const horizon = opts.horizon ?? "90d";
  const field = horizon === "30d" ? "ret30" : horizon === "365d" ? "ret365" : "ret90";
  const matching = allBts.filter((bt) => bt[field] != null && filter(bt));

  if (matching.length < 10) return null;

  // Per-year equal-weighted mean return (minus fees)
  const byYear = {};
  for (const bt of matching) {
    if (!byYear[bt.year]) byYear[bt.year] = [];
    byYear[bt.year].push(bt[field]);
  }

  const yearReturns = {};
  let yearsBeat = 0;
  let yearsTested = 0;
  const yearsToCheck = [2022, 2023, 2024, 2025, 2026];
  const minSignalsPerYear = 5;

  for (const y of yearsToCheck) {
    const rets = byYear[y] ?? [];
    if (rets.length < minSignalsPerYear) { yearReturns[y] = null; continue; }
    const avgRet = mean(rets) - TRANSACTION_COST;
    yearReturns[y] = avgRet;
    const cac = cacByYear[y];
    if (cac != null) {
      yearsTested++;
      if (avgRet > cac) yearsBeat++;
    }
  }

  // Stats across all years combined
  const allRets = matching.map((bt) => bt[field] - TRANSACTION_COST);
  const avgReturnAllYears = mean(allRets);
  const medianReturn = median(allRets);
  const stdDev = std(allRets);
  const sharpe = stdDev > 0 ? avgReturnAllYears / stdDev * Math.sqrt(4) : 0; // 4 = T+90 periods per year
  const winRate = (allRets.filter((r) => r > 0).length / allRets.length) * 100;

  // Average alpha vs CAC
  let alphaSum = 0, alphaCount = 0;
  for (const y of yearsToCheck) {
    if (yearReturns[y] != null && cacByYear[y] != null) {
      alphaSum += yearReturns[y] - cacByYear[y];
      alphaCount++;
    }
  }
  const avgAlpha = alphaCount > 0 ? alphaSum / alphaCount : 0;

  return {
    matching: matching.length,
    yearReturns,
    yearsBeat,
    yearsTested,
    allYearsBeat: yearsBeat === yearsTested && yearsTested >= 4, // need at least 4 years out of 5
    avgReturn: avgReturnAllYears,
    medianReturn,
    sharpe,
    winRate,
    avgAlpha,
    horizon,
  };
}

// ── Grid search ───────────────────────────────────────────────────────────
console.log(`${C.cyan}Grid search (targeting: bat CAC chaque année 2022–2026)${C.reset}\n`);

const scoreThresholds = [0, 30, 40, 50, 55, 60, 65, 70, 75];
const clusterOpts = [null, "any", "cluster"];
const roleOpts = [null, "ceo", "ceo+cfo", "ceo+cfo+dir", "not-board"];
const amountMins = [0, 50_000, 100_000, 250_000, 500_000, 1_000_000];
const pctMcapMins = [0, 0.01, 0.03, 0.05, 0.1, 0.3];
const freshnessMax = [999, 14, 10, 7, 5];
const horizons = ["30d", "90d", "365d"];
const mcapClass = [null, "large", "mid", "small"]; // large=>1B, mid=>200M-1B, small=<200M
const natureFilter = [null, "pure-buy"]; // only "Acquisition" no "Exercice"

let combos = 0;
const winners = [];
const t0 = Date.now();

for (const score of scoreThresholds) {
for (const cluster of clusterOpts) {
for (const role of roleOpts) {
for (const amt of amountMins) {
for (const mcap of pctMcapMins) {
for (const fresh of freshnessMax) {
for (const hor of horizons) {
for (const mcc of mcapClass) {
for (const nf of natureFilter) {
  combos++;
  const filter = (bt) => {
    if (bt.score < score) return false;
    if (cluster === "cluster" && !bt.cluster) return false;
    if (role === "ceo" && bt.role !== "ceo") return false;
    if (role === "ceo+cfo" && !["ceo", "cfo"].includes(bt.role)) return false;
    if (role === "ceo+cfo+dir" && !["ceo", "cfo", "director"].includes(bt.role)) return false;
    if (role === "not-board" && bt.role === "board") return false;
    if (bt.amount < amt) return false;
    if (bt.pctMcap < mcap) return false;
    if (bt.freshDays > fresh) return false;
    if (mcc === "large" && bt.mcapEur < 1_000_000_000) return false;
    if (mcc === "mid" && (bt.mcapEur < 200_000_000 || bt.mcapEur > 1_000_000_000)) return false;
    if (mcc === "small" && bt.mcapEur >= 200_000_000) return false;
    if (nf === "pure-buy" && !/^acquisition$/i.test(bt.nature)) return false;
    return true;
  };
  const r = evalStrategy(filter, { horizon: hor });
  if (!r) continue;
  if (r.allYearsBeat) {
    winners.push({
      params: { score, cluster, role, amt, mcap, fresh, hor, mcc, nf },
      ...r,
    });
  }
  if (combos % 2000 === 0) {
    console.log(`  ${combos} combos · ${winners.length} winners · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}}}}}}}}}

console.log(`\n${C.bold}${C.cyan}${combos} combos tested · ${winners.length} strategies beat CAC every tested year${C.reset}\n`);

// ── Rank by robustness (avg alpha) then by Sharpe ─────────────────────────
winners.sort((a, b) => {
  if (Math.abs(b.avgAlpha - a.avgAlpha) > 1) return b.avgAlpha - a.avgAlpha;
  return b.sharpe - a.sharpe;
});

// ── Deduplicate similar strategies (same winning set of signals) ──────────
const seen = new Set();
const unique = [];
for (const w of winners) {
  const sig = `${w.matching}::${Math.round(w.avgReturn * 10)}::${Math.round(w.avgAlpha * 10)}`;
  if (seen.has(sig)) continue;
  seen.add(sig);
  unique.push(w);
}
console.log(`${C.dim}  ${unique.length} unique strategies after deduplication${C.reset}\n`);

const fmtYear = (v, cac) => {
  if (v == null) return C.dim + "n/d".padStart(8) + C.reset;
  const beat = cac != null && v > cac;
  const color = beat ? C.green : C.red;
  return `${color}${(v > 0 ? "+" : "") + v.toFixed(1) + "%"}${C.reset}`.padEnd(16);
};

console.log(`${C.bold}TOP 25 STRATÉGIES UNIQUES (bat CAC 40 chaque année 2022-2026)${C.reset}\n`);
console.log(
  C.dim +
  "rank  avg ret   alpha    Sharpe  winRate  n     " +
  "2022      2023      2024      2025      2026       " +
  "filter" +
  C.reset
);
console.log(C.dim + "─".repeat(180) + C.reset);

for (let i = 0; i < Math.min(25, unique.length); i++) {
  const r = unique[i];
  const p = r.params;
  const parts = [
    p.hor,
    p.score > 0 ? `score≥${p.score}` : null,
    p.cluster === "cluster" ? "cluster" : null,
    p.role ? p.role : null,
    p.amt > 0 ? `≥${p.amt >= 1e6 ? (p.amt/1e6).toFixed(1) + "M" : (p.amt/1e3).toFixed(0) + "k"}€` : null,
    p.mcap > 0 ? `mcap≥${p.mcap}%` : null,
    p.fresh < 999 ? `fresh≤${p.fresh}j` : null,
    p.mcc ? `cap=${p.mcc}` : null,
    p.nf === "pure-buy" ? "acquisition-only" : null,
  ].filter(Boolean).join(" ");

  console.log(
    `${(i + 1).toString().padStart(3)}.  ` +
    `${C.bold}${(r.avgReturn > 0 ? "+" : "") + r.avgReturn.toFixed(1) + "%"}${C.reset}`.padEnd(16) +
    `${C.yellow}${(r.avgAlpha > 0 ? "+" : "") + r.avgAlpha.toFixed(1)}pts${C.reset}`.padEnd(17) +
    `${r.sharpe.toFixed(2)}`.padEnd(8) +
    `${r.winRate.toFixed(0)}%`.padEnd(9) +
    `${r.matching}`.padEnd(6) +
    fmtYear(r.yearReturns[2022], cacByYear[2022]) +
    fmtYear(r.yearReturns[2023], cacByYear[2023]) +
    fmtYear(r.yearReturns[2024], cacByYear[2024]) +
    fmtYear(r.yearReturns[2025], cacByYear[2025]) +
    fmtYear(r.yearReturns[2026], cacByYear[2026]) +
    `${parts}`
  );
}

console.log(`\n${C.bold}CAC 40 référence :${C.reset}`);
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const v = cacByYear[y];
  if (v != null) console.log(`  ${y} : ${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
}

// Save top 50
const fs = await import("node:fs");
fs.writeFileSync("/tmp/grid-winners-v2.json", JSON.stringify(unique.slice(0, 50), null, 2));
console.log(`\n${C.dim}Saved top 50 to /tmp/grid-winners-v2.json${C.reset}`);

await p.$disconnect();
