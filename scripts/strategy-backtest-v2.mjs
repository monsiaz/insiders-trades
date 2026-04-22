/**
 * V2 — with retail-realistic returns (returnFromPub90d) + freshness filter.
 *
 * Tests which combinations actually produce alpha for a retail investor.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const DAY = 86400_000;

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" };

function mean(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0; }
function std(arr) { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map((x) => (x - m) ** 2))); }

function roleCategory(fn) {
  if (!fn) return "other";
  const f = fn.toLowerCase();
  if (/directeur.?g[éeè]n[éeè]ral|pdg|pr[ée]sident.{0,20}directeur|pr[ée]sident.{0,20}conseil|managing director|ceo/i.test(f)) return "ceo";
  if (/directeur.?financier|cfo|daf/i.test(f)) return "cfo";
  if (/directeur|director/i.test(f)) return "director";
  if (/membre.{0,20}conseil|administrateur|board/i.test(f)) return "board";
  return "other";
}

console.log(`${C.cyan}Loading backtest data (with retail returns)…${C.reset}`);
const allBts = await p.backtestResult.findMany({
  where: {
    direction: "BUY",
    returnFromPub90d: { not: null },
    priceAtPub: { gt: 0 },
    declaration: { type: "DIRIGEANTS", pdfParsed: true },
  },
  select: {
    returnFromPub30d: true,
    returnFromPub90d: true,
    returnFromPub365d: true,
    pubLeakPct: true,
    return90d: true, // keep for comparison
    declaration: {
      select: {
        pubDate: true,
        transactionDate: true,
        signalScore: true,
        totalAmount: true,
        pctOfMarketCap: true,
        isCluster: true,
        transactionNature: true,
        insiderFunction: true,
        company: { select: { slug: true, marketCap: true } },
      },
    },
  },
});
console.log(`${C.dim}  ${allBts.length} retail-enriched backtests${C.reset}\n`);

// Compute freshness (days between transactionDate and pubDate)
for (const bt of allBts) {
  const pd = bt.declaration.pubDate;
  const td = bt.declaration.transactionDate;
  bt._freshnessDays = td ? (pd.getTime() - td.getTime()) / DAY : null;
}

// CAC reference
async function loadCacReturns() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EFCHI?interval=1mo&range=10y";
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const d = await r.json();
  const ts = d?.chart?.result?.[0]?.timestamp ?? [];
  const closes = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  const byMonth = {};
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] && closes[i]) {
      const date = new Date(ts[i] * 1000);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      byMonth[key] = ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100;
    }
  }
  return byMonth;
}
const cacByMonth = await loadCacReturns();

// Strategy runner — uses returnFromPub90d (retail-realistic)
function runStrategy({ label, filter, topN = 20, minN = 3, horizon = "90d" }) {
  const matching = allBts.filter(filter);
  const retField = horizon === "30d" ? "returnFromPub30d"
                 : horizon === "365d" ? "returnFromPub365d"
                 : "returnFromPub90d";

  const byMonth = new Map();
  for (const bt of matching) {
    if (bt[retField] == null) continue;
    const pd = bt.declaration.pubDate;
    const key = `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(bt);
  }

  const months = [...byMonth.keys()].sort();
  const TRANSACTION_COST = 1.0;
  const HOLD_MONTHS = horizon === "30d" ? 1 : horizon === "365d" ? 12 : 3;
  const monthlyReturns = [];
  const monthDetails = [];

  for (const m of months) {
    const pool = byMonth.get(m).sort((a, b) =>
      (b.declaration.signalScore ?? 0) - (a.declaration.signalScore ?? 0)
    );
    const top = pool.slice(0, topN);
    if (top.length < minN) continue;
    const avgRaw = mean(top.map((bt) => bt[retField] ?? 0));
    const netHorizon = avgRaw - TRANSACTION_COST;
    const monthlyEquiv = netHorizon / HOLD_MONTHS;
    monthlyReturns.push(monthlyEquiv);
    monthDetails.push({ month: m, n: top.length, rawReturn: avgRaw, monthlyNet: monthlyEquiv });
  }

  if (monthlyReturns.length < 12) return { label, insufficient: true, count: matching.length };

  const avgMonthly = mean(monthlyReturns);
  const stdMonthly = std(monthlyReturns);
  const totalReturn = monthlyReturns.reduce((acc, r) => acc * (1 + r / 100), 1);
  const years = monthlyReturns.length / 12;
  const cagr = (Math.pow(totalReturn, 1 / years) - 1) * 100;
  const sharpe = stdMonthly > 0 ? (avgMonthly / stdMonthly) * Math.sqrt(12) : 0;

  let peak = 1, maxDD = 0, equity = 1;
  for (const r of monthlyReturns) {
    equity *= 1 + r / 100;
    if (equity > peak) peak = equity;
    const dd = (equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }

  let beatCac = 0, totalCacMonths = 0;
  for (const d of monthDetails) {
    const cac = cacByMonth[d.month];
    if (cac != null) { totalCacMonths++; if (d.monthlyNet > cac) beatCac++; }
  }

  const winRate = (monthlyReturns.filter((r) => r > 0).length / monthlyReturns.length) * 100;

  return {
    label,
    matching: matching.length,
    months: monthlyReturns.length,
    cagr,
    sharpe,
    maxDDPct: maxDD * 100,
    winRate,
    beatCacPct: totalCacMonths ? (beatCac / totalCacMonths) * 100 : 0,
  };
}

// ── Strategies (RETAIL perspective, using pubDate-based returns) ────────────
const strategies = [
  // Baselines
  { label: "ALL buys (noise baseline)", filter: () => true },
  { label: "Score ≥ 40", filter: (bt) => (bt.declaration.signalScore ?? 0) >= 40 },
  { label: "Score ≥ 50", filter: (bt) => (bt.declaration.signalScore ?? 0) >= 50 },
  { label: "Score ≥ 60", filter: (bt) => (bt.declaration.signalScore ?? 0) >= 60 },

  // Freshness only (no score filter)
  { label: "Fresh ≤ 3j (delay tx→pub)", filter: (bt) => bt._freshnessDays != null && bt._freshnessDays <= 3 },
  { label: "Fresh ≤ 5j", filter: (bt) => bt._freshnessDays != null && bt._freshnessDays <= 5 },

  // Cluster
  { label: "Cluster only (≥2 insiders ±30j)", filter: (bt) => bt.declaration.isCluster === true },
  { label: "Cluster + Fresh ≤ 5j", filter: (bt) =>
    bt.declaration.isCluster === true && bt._freshnessDays != null && bt._freshnessDays <= 5 },

  // Role
  { label: "PDG/CFO only", filter: (bt) => ["ceo", "cfo"].includes(roleCategory(bt.declaration.insiderFunction)) },
  { label: "PDG/CFO + Fresh ≤ 5j", filter: (bt) =>
    ["ceo", "cfo"].includes(roleCategory(bt.declaration.insiderFunction))
    && bt._freshnessDays != null && bt._freshnessDays <= 5 },
  { label: "PDG/CFO + Cluster + Fresh ≤ 5j", filter: (bt) =>
    ["ceo", "cfo"].includes(roleCategory(bt.declaration.insiderFunction))
    && bt.declaration.isCluster === true
    && bt._freshnessDays != null && bt._freshnessDays <= 5 },

  // Size
  { label: "Amount ≥ 500k€", filter: (bt) => (bt.declaration.totalAmount ?? 0) >= 500_000 },
  { label: "Amount ≥ 500k€ + Cluster", filter: (bt) =>
    (bt.declaration.totalAmount ?? 0) >= 500_000 && bt.declaration.isCluster === true },
  { label: "Amount ≥ 500k€ + Cluster + Fresh ≤ 5j", filter: (bt) =>
    (bt.declaration.totalAmount ?? 0) >= 500_000
    && bt.declaration.isCluster === true
    && bt._freshnessDays != null && bt._freshnessDays <= 5 },

  // Conviction
  { label: "%mcap ≥ 0.05% + Cluster", filter: (bt) =>
    (bt.declaration.pctOfMarketCap ?? 0) >= 0.05 && bt.declaration.isCluster === true },

  // Best candidates
  { label: "★ CLUSTER + PDG/CFO/Dir + Fresh ≤ 5j", filter: (bt) =>
    bt.declaration.isCluster === true
    && ["ceo", "cfo", "director"].includes(roleCategory(bt.declaration.insiderFunction))
    && bt._freshnessDays != null && bt._freshnessDays <= 5 },
  { label: "★ CLUSTER + Amount ≥ 250k€ + Fresh ≤ 5j", filter: (bt) =>
    bt.declaration.isCluster === true
    && (bt.declaration.totalAmount ?? 0) >= 250_000
    && bt._freshnessDays != null && bt._freshnessDays <= 5 },
];

console.log(`${C.bold}${C.cyan}STRATEGY RACE — RETAIL returns (pubDate+1 entry), top-20 rebalance, T+90 hold${C.reset}\n`);

const headers = ["Stratégie", "n décl", "mois", "CAGR", "Sharpe", "MaxDD", "Win%", "Beat CAC%"];
const widths = [48, 7, 5, 9, 7, 7, 6, 9];
function pad(s, w, align = "l") { s = String(s); if (s.length > w) return s.slice(0, w - 1) + "…"; return align === "r" ? s.padStart(w) : s.padEnd(w); }
function row(cells, color = "") { console.log(color + cells.map((c, i) => pad(c, widths[i], i === 0 ? "l" : "r")).join(" │ ") + C.reset); }

row(headers, C.dim);
console.log(C.dim + "─".repeat(widths.reduce((a, b) => a + b + 3, 0)) + C.reset);

const results = strategies.map((s) => runStrategy(s));
for (const r of results) {
  if (r.insufficient) { row([r.label, r.matching, "—", "n/a", "—", "—", "—", "—"], C.dim); continue; }
  const color = r.cagr > 8 ? C.green : r.cagr > 0 ? "" : C.red;
  row([
    r.label,
    r.matching,
    r.months,
    (r.cagr > 0 ? "+" : "") + r.cagr.toFixed(1) + "%",
    r.sharpe.toFixed(2),
    r.maxDDPct.toFixed(0) + "%",
    r.winRate.toFixed(0) + "%",
    r.beatCacPct.toFixed(0) + "%",
  ], color);
}

// CAC benchmark
const cacValues = Object.values(cacByMonth);
const cacMonthly = mean(cacValues);
const cacStd = std(cacValues);
const cacTotal = cacValues.reduce((acc, r) => acc * (1 + r / 100), 1);
const cacCagr = (Math.pow(cacTotal, 1 / (cacValues.length / 12)) - 1) * 100;
const cacSharpe = cacStd ? (cacMonthly / cacStd) * Math.sqrt(12) : 0;
console.log();
console.log(`${C.bold}BENCHMARK — CAC 40 buy & hold :${C.reset} CAGR ${cacCagr > 0 ? "+" : ""}${cacCagr.toFixed(2)}% · Sharpe ${cacSharpe.toFixed(2)}\n`);

// Winner
const valid = results.filter((r) => !r.insufficient);
const bySharpe = [...valid].sort((a, b) => b.sharpe - a.sharpe);
const byCagr   = [...valid].sort((a, b) => b.cagr - a.cagr);
const byBeat   = [...valid].sort((a, b) => b.beatCacPct - a.beatCacPct);

console.log(`${C.bold}${C.green}✓ BEST BY SHARPE :${C.reset} ${bySharpe[0].label}`);
console.log(`  Sharpe ${bySharpe[0].sharpe.toFixed(2)} · CAGR ${(bySharpe[0].cagr > 0 ? "+" : "") + bySharpe[0].cagr.toFixed(1)}% · MaxDD ${bySharpe[0].maxDDPct.toFixed(0)}%\n`);

console.log(`${C.bold}${C.green}✓ BEST BY CAGR :${C.reset} ${byCagr[0].label}`);
console.log(`  CAGR ${(byCagr[0].cagr > 0 ? "+" : "") + byCagr[0].cagr.toFixed(1)}% · ${byCagr[0].matching.toLocaleString("fr-FR")} signaux historiques\n`);

console.log(`${C.bold}${C.green}✓ BEST BY BEAT-CAC :${C.reset} ${byBeat[0].label}`);
console.log(`  Bat CAC ${byBeat[0].beatCacPct.toFixed(0)}% des mois\n`);

await p.$disconnect();
