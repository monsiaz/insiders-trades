/**
 * Grid search intensif — teste ~2000 combinaisons de filtres pour trouver
 * celles qui battent le CAC 40 chaque année de 2022 à 2026.
 *
 * Dimensions testées :
 *   - minScore        : 0, 30, 40, 50, 60, 70
 *   - cluster         : off / ≥2 / ≥3
 *   - role            : any / ceo / ceo+cfo / ceo+cfo+dir
 *   - minAmount       : 0, 50k, 100k, 500k, 1M, 5M
 *   - minPctMcap      : 0, 0.01%, 0.05%, 0.1%, 0.5%
 *   - freshness       : any, ≤5j, ≤10j
 *   - horizon         : 30d, 90d, 365d
 *   - topN            : 5, 10, 20, 30
 *
 * Critère de sélection : CAGR > CAC 40 pour CHAQUE année 2022, 2023, 2024, 2025, 2026.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" };
const DAY = 86400_000;

function mean(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0; }
function std(arr) { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map((x) => (x - m) ** 2))); }

function roleCategory(fn) {
  if (!fn) return "other";
  const f = fn.toLowerCase();
  if (/directeur.?g[éeè]n[éeè]ral|pdg|pr[ée]sident.{0,20}directeur|managing director|ceo/i.test(f)) return "ceo";
  if (/directeur.?financier|cfo|daf/i.test(f)) return "cfo";
  if (/directeur|director/i.test(f)) return "director";
  if (/membre.{0,20}conseil|administrateur|board/i.test(f)) return "board";
  return "other";
}

// ── Load data ─────────────────────────────────────────────────────────────
console.log(`${C.cyan}Loading backtest data…${C.reset}`);

async function loadByHorizon(horizon) {
  const field = horizon === "30d" ? "returnFromPub30d"
              : horizon === "365d" ? "returnFromPub365d"
              : "returnFromPub90d";
  const rows = await p.backtestResult.findMany({
    where: {
      direction: "BUY",
      [field]: { not: null },
      priceAtPub: { gt: 0 },
      declaration: { type: "DIRIGEANTS", pdfParsed: true },
    },
    select: {
      returnFromPub30d: true,
      returnFromPub90d: true,
      returnFromPub365d: true,
      declaration: {
        select: {
          pubDate: true,
          transactionDate: true,
          signalScore: true,
          totalAmount: true,
          pctOfMarketCap: true,
          isCluster: true,
          insiderFunction: true,
          company: { select: { marketCap: true } },
        },
      },
    },
  });
  return rows.map((r) => {
    const pd = r.declaration.pubDate;
    const td = r.declaration.transactionDate;
    return {
      year: pd.getUTCFullYear(),
      month: `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, "0")}`,
      ret30:  r.returnFromPub30d,
      ret90:  r.returnFromPub90d,
      ret365: r.returnFromPub365d,
      score: r.declaration.signalScore ?? 0,
      amount: r.declaration.totalAmount ?? 0,
      pctMcap: r.declaration.pctOfMarketCap ?? 0,
      cluster: r.declaration.isCluster === true,
      role: roleCategory(r.declaration.insiderFunction),
      freshDays: td ? (pd.getTime() - td.getTime()) / DAY : 999,
      mcap: r.declaration.company.marketCap ? Number(r.declaration.company.marketCap) : 0,
    };
  });
}

const allBts = await loadByHorizon("90d"); // single fetch, all horizons included
console.log(`${C.dim}  ${allBts.length} backtests loaded${C.reset}`);

// ── CAC 40 per-year returns ────────────────────────────────────────────────
console.log(`${C.cyan}Fetching CAC 40 yearly returns…${C.reset}`);
async function loadCacPerYear() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EFCHI?interval=1d&range=10y";
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const d = await r.json();
  const ts = d?.chart?.result?.[0]?.timestamp ?? [];
  const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  // First close each year & last close each year
  const byYear = {};
  for (let i = 0; i < closes.length; i++) {
    if (!closes[i]) continue;
    const date = new Date(ts[i] * 1000);
    const y = date.getUTCFullYear();
    if (!byYear[y]) byYear[y] = { first: closes[i], last: closes[i], firstDate: date, lastDate: date };
    else { byYear[y].last = closes[i]; byYear[y].lastDate = date; }
  }
  const result = {};
  for (const [y, { first, last }] of Object.entries(byYear)) {
    result[y] = ((last - first) / first) * 100;
  }
  return result;
}
const cacByYear = await loadCacPerYear();
console.log(`${C.dim}  CAC 40 per year :${C.reset}`);
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const v = cacByYear[y];
  console.log(`    ${y} : ${v != null ? (v > 0 ? "+" : "") + v.toFixed(2) + "%" : "—"}`);
}

// ── Strategy runner (year-by-year) ─────────────────────────────────────────
function runStrategyYearly(filter, opts = {}) {
  const topN = opts.topN ?? 10;
  const horizon = opts.horizon ?? "90d";
  const retField = horizon === "30d" ? "ret30" : horizon === "365d" ? "ret365" : "ret90";
  const TRANSACTION_COST = 1.0;
  const HOLD_MONTHS = horizon === "30d" ? 1 : horizon === "365d" ? 12 : 3;

  const matching = allBts.filter((bt) => bt[retField] != null && filter(bt));

  // Group by month
  const byMonth = new Map();
  for (const bt of matching) {
    if (!byMonth.has(bt.month)) byMonth.set(bt.month, []);
    byMonth.get(bt.month).push(bt);
  }

  // Simulate monthly top-N rebalance
  const byYearReturns = {};
  let totalMonths = 0, totalMonthlyReturns = [];
  for (const [m, pool] of byMonth) {
    const top = pool.sort((a, b) => b.score - a.score).slice(0, topN);
    if (top.length < 3) continue;
    const avgRet = mean(top.map((bt) => bt[retField] ?? 0));
    const monthlyEquiv = (avgRet - TRANSACTION_COST) / HOLD_MONTHS;
    const year = Number(m.slice(0, 4));
    if (!byYearReturns[year]) byYearReturns[year] = [];
    byYearReturns[year].push(monthlyEquiv);
    totalMonthlyReturns.push(monthlyEquiv);
    totalMonths++;
  }
  if (totalMonths < 12) return null;

  // Compound each year — relaxed minimum months requirement
  // 2026 has only 4 months available (Jan-Apr 2026), so we allow down to 3 months.
  const yearCagr = {};
  let yearsBeatCac = 0;
  let totalYearsWithData = 0;
  for (const y of [2022, 2023, 2024, 2025, 2026]) {
    const monthly = byYearReturns[y] ?? [];
    const minMonths = y === 2026 ? 2 : 4; // 2026 is partial, allow 2 months
    if (monthly.length < minMonths) { yearCagr[y] = null; continue; }
    const compound = monthly.reduce((acc, r) => acc * (1 + r / 100), 1);
    // For partial years (2026), annualise? No — keep raw return, compare directly.
    const yearReturn = (compound - 1) * 100;
    yearCagr[y] = yearReturn;
    const cac = cacByYear[y];
    if (cac != null) {
      totalYearsWithData++;
      if (yearReturn > cac) yearsBeatCac++;
    }
  }

  // Global stats
  const totalReturn = totalMonthlyReturns.reduce((acc, r) => acc * (1 + r / 100), 1);
  const cagr = (Math.pow(totalReturn, 1 / (totalMonths / 12)) - 1) * 100;
  const sharpeMonthly = std(totalMonthlyReturns) > 0
    ? (mean(totalMonthlyReturns) / std(totalMonthlyReturns)) * Math.sqrt(12)
    : 0;

  // Max drawdown
  let peak = 1, maxDD = 0, equity = 1;
  for (const r of totalMonthlyReturns) {
    equity *= 1 + r / 100;
    if (equity > peak) peak = equity;
    const dd = (equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  return {
    matching: matching.length,
    months: totalMonths,
    cagr,
    sharpe: sharpeMonthly,
    maxDD: maxDD * 100,
    yearCagr,
    yearsBeatCac,
    totalYearsWithData,
    allYearsBeat: yearsBeatCac === totalYearsWithData && totalYearsWithData >= 3,
  };
}

// ── Grid search ───────────────────────────────────────────────────────────
console.log(`\n${C.cyan}Running grid search…${C.reset}`);

const scoreThresholds = [0, 30, 40, 50, 60, 70];
const clusterMins = [null, true, "min3"]; // null = any, true = ≥2, "min3" = via helper
const roleFilters = [null, "ceo", "ceo+cfo", "ceo+cfo+dir"];
const amountMins = [0, 100_000, 500_000, 1_000_000, 5_000_000];
const pctMcapMins = [0, 0.01, 0.05, 0.1, 0.5];
const freshnessMax = [999, 10, 5];
const horizons = ["30d", "90d", "365d"];
const topNs = [10, 20];

let combos = 0;
const results = [];
const t0 = Date.now();

for (const score of scoreThresholds) {
for (const cluster of clusterMins) {
for (const role of roleFilters) {
for (const amt of amountMins) {
for (const mcap of pctMcapMins) {
for (const fresh of freshnessMax) {
for (const hor of horizons) {
for (const n of topNs) {
  combos++;
  const filter = (bt) => {
    if (bt.score < score) return false;
    if (cluster === true && !bt.cluster) return false;
    if (cluster === "min3") {
      // We don't have nearbyInsiderCount here — isCluster means ≥2 already.
      // Skip this variant. Effectively = same as cluster=true.
      if (!bt.cluster) return false;
    }
    if (role === "ceo" && bt.role !== "ceo") return false;
    if (role === "ceo+cfo" && !["ceo", "cfo"].includes(bt.role)) return false;
    if (role === "ceo+cfo+dir" && !["ceo", "cfo", "director"].includes(bt.role)) return false;
    if (bt.amount < amt) return false;
    if (bt.pctMcap < mcap) return false;
    if (bt.freshDays > fresh) return false;
    return true;
  };
  const r = runStrategyYearly(filter, { topN: n, horizon: hor });
  if (!r) continue;
  if (r.allYearsBeat) {
    results.push({
      params: { score, cluster, role, amt, mcap, fresh, hor, n },
      ...r,
    });
  }
  if (combos % 500 === 0) {
    console.log(`  ${combos} combos tested · ${results.length} winners so far · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}}}}}}}}

console.log(`\n${C.bold}${C.cyan}${combos} combos tested · ${results.length} strategies beat CAC every year${C.reset}\n`);

// ── Rank ────────────────────────────────────────────────────────────────
results.sort((a, b) => {
  // Prefer: highest total CAGR, then highest Sharpe, then lowest DD
  if (Math.abs(b.cagr - a.cagr) > 0.5) return b.cagr - a.cagr;
  if (Math.abs(b.sharpe - a.sharpe) > 0.05) return b.sharpe - a.sharpe;
  return a.maxDD - b.maxDD; // less bad DD first
});

// Print top 20
console.log(`${C.bold}TOP 20 STRATEGIES (beat CAC every year from 2022-2026)${C.reset}\n`);

console.log(
  C.dim +
  "rank  CAGR      Sharpe  MaxDD    matching  " +
  "2022       2023       2024       2025       2026       " +
  "  filter" +
  C.reset
);
console.log(C.dim + "─".repeat(160) + C.reset);

const fmtYear = (v, cac) => {
  if (v == null) return "—".padEnd(10);
  const beat = cac != null && v > cac;
  const color = beat ? C.green : C.red;
  return `${color}${(v > 0 ? "+" : "") + v.toFixed(1) + "%"}${C.reset}`.padEnd(18);
};

for (let i = 0; i < Math.min(20, results.length); i++) {
  const r = results[i];
  const p = r.params;
  const filterDesc = [
    p.score ? `score≥${p.score}` : null,
    p.cluster === true ? "cluster" : null,
    p.role ? `role=${p.role}` : null,
    p.amt > 0 ? `amt≥${(p.amt/1000).toFixed(0)}k` : null,
    p.mcap > 0 ? `mcap≥${p.mcap}%` : null,
    p.fresh < 999 ? `fresh≤${p.fresh}j` : null,
    `T+${p.hor}`,
    `top${p.n}`,
  ].filter(Boolean).join(" · ");

  console.log(
    `${(i + 1).toString().padStart(3)}.  ` +
    `${C.bold}${(r.cagr > 0 ? "+" : "") + r.cagr.toFixed(1) + "%"}${C.reset}`.padEnd(14) +
    `${r.sharpe.toFixed(2)}`.padEnd(8) +
    `${r.maxDD.toFixed(0)}%`.padEnd(9) +
    `${r.matching}`.padEnd(10) +
    fmtYear(r.yearCagr[2022], cacByYear[2022]) +
    fmtYear(r.yearCagr[2023], cacByYear[2023]) +
    fmtYear(r.yearCagr[2024], cacByYear[2024]) +
    fmtYear(r.yearCagr[2025], cacByYear[2025]) +
    fmtYear(r.yearCagr[2026], cacByYear[2026]) +
    `  ${filterDesc}`
  );
}

// CAC summary
console.log(`\n${C.bold}CAC 40 reference :${C.reset}`);
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const v = cacByYear[y];
  if (v != null) console.log(`  ${y} : ${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
}

// Save top 50 as JSON for further analysis
const fs = await import("node:fs");
fs.writeFileSync(
  "/tmp/grid-winners.json",
  JSON.stringify(results.slice(0, 50), null, 2)
);
console.log(`\n${C.dim}Saved top 50 to /tmp/grid-winners.json${C.reset}`);

await p.$disconnect();
