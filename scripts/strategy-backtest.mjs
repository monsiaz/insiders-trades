/**
 * Compare multiple strategies on the same historical data to find which
 * filters actually generate alpha vs the CAC 40.
 *
 * Each strategy is a filter on declarations. We rebalance every 30 days:
 *   - Pick the top-N BUY signals matching the filter, published in the last 14d.
 *   - Hold for 90 days using stored return90d.
 *   - Apply 1% roundtrip transaction costs.
 *
 * Output: annualized return, Sharpe, max DD, win rate, % months beating CAC.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m" };

function mean(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0; }
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

// Load all necessary data ONCE
console.log(`${C.cyan}Loading backtest data…${C.reset}`);
const allBts = await p.backtestResult.findMany({
  where: {
    direction: "BUY",
    return90d: { not: null },
    priceAtTrade: { gt: 0 },
    declaration: { type: "DIRIGEANTS", pdfParsed: true },
  },
  select: {
    return90d: true,
    declaration: {
      select: {
        pubDate: true,
        signalScore: true,
        totalAmount: true,
        pctOfMarketCap: true,
        isCluster: true,
        transactionNature: true,
        insiderFunction: true,
        company: { select: { slug: true, marketCap: true, analystReco: true } },
      },
    },
  },
});
console.log(`${C.dim}  ${allBts.length} backtest records loaded${C.reset}\n`);

// Normalize role
function roleCategory(fn) {
  if (!fn) return "other";
  const f = fn.toLowerCase();
  if (/directeur.?g[éeè]n[éeè]ral|pdg|pr[ée]sident.{0,20}directeur|pr[ée]sident.{0,20}conseil|managing director|ceo/i.test(f)) return "ceo";
  if (/directeur.?financier|cfo|daf/i.test(f)) return "cfo";
  if (/directeur|director/i.test(f)) return "director";
  if (/membre.{0,20}conseil|administrateur|board/i.test(f)) return "board";
  return "other";
}

// Fetch CAC 40 monthly returns aligned to our data period
async function loadCacReturns() {
  try {
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
  } catch {
    return {};
  }
}
const cacByMonth = await loadCacReturns();

// ── Strategy runner ─────────────────────────────────────────────────────────
function runStrategy({ label, filter, topN = 20, minN = 3 }) {
  const matching = allBts.filter((bt) => filter(bt));

  // Group by publication month
  const byMonth = new Map();
  for (const bt of matching) {
    const pd = bt.declaration.pubDate;
    const key = `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(bt);
  }

  const months = [...byMonth.keys()].sort();
  const TRANSACTION_COST = 1.0;
  const HOLD_MONTHS = 3;
  const monthlyReturns = [];
  const details = [];

  for (const m of months) {
    const pool = byMonth.get(m).sort((a, b) =>
      (b.declaration.signalScore ?? 0) - (a.declaration.signalScore ?? 0)
    );
    const top = pool.slice(0, topN);
    if (top.length < minN) continue;
    const avgRaw = mean(top.map((bt) => bt.return90d ?? 0));
    const netQuarterly = avgRaw - TRANSACTION_COST;
    const monthlyEquiv = netQuarterly / HOLD_MONTHS;
    monthlyReturns.push(monthlyEquiv);
    details.push({ month: m, n: top.length, rawReturn90d: avgRaw, monthlyNet: monthlyEquiv });
  }

  if (monthlyReturns.length < 12) {
    return { label, insufficient: true, count: matching.length };
  }

  // Stats
  const avgMonthly = mean(monthlyReturns);
  const stdMonthly = std(monthlyReturns);
  const totalReturn = monthlyReturns.reduce((acc, r) => acc * (1 + r / 100), 1);
  const years = monthlyReturns.length / 12;
  const cagr = (Math.pow(totalReturn, 1 / years) - 1) * 100;
  const sharpe = stdMonthly > 0 ? (avgMonthly / stdMonthly) * Math.sqrt(12) : 0;

  // Max drawdown
  let peak = 1, maxDD = 0;
  let equity = 1;
  for (const r of monthlyReturns) {
    equity *= 1 + r / 100;
    if (equity > peak) peak = equity;
    const dd = (equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  const maxDDPct = maxDD * 100;

  // % months beating CAC
  let beatCac = 0, totalCacMonths = 0;
  for (const d of details) {
    const cac = cacByMonth[d.month];
    if (cac != null) {
      totalCacMonths++;
      if (d.monthlyNet > cac) beatCac++;
    }
  }
  const beatCacPct = totalCacMonths ? (beatCac / totalCacMonths) * 100 : 0;

  const winMonths = monthlyReturns.filter((r) => r > 0).length;
  const winRatePct = (winMonths / monthlyReturns.length) * 100;

  return {
    label,
    matching: matching.length,
    monthsSimulated: monthlyReturns.length,
    avgMonthly,
    stdMonthly,
    cagr,
    sharpe,
    maxDDPct,
    winRatePct,
    beatCacPct,
  };
}

// ── Strategies to test ──────────────────────────────────────────────────────
const strategies = [
  {
    label: "Baseline · all BUY signals (score≥0)",
    filter: () => true,
  },
  {
    label: "Score ≥ 40",
    filter: (bt) => (bt.declaration.signalScore ?? 0) >= 40,
  },
  {
    label: "Score ≥ 50",
    filter: (bt) => (bt.declaration.signalScore ?? 0) >= 50,
  },
  {
    label: "Score ≥ 60",
    filter: (bt) => (bt.declaration.signalScore ?? 0) >= 60,
  },
  {
    label: "Score ≥ 70",
    filter: (bt) => (bt.declaration.signalScore ?? 0) >= 70,
  },
  {
    label: "Cluster trades only (≥2 insiders ±30j)",
    filter: (bt) => bt.declaration.isCluster === true,
  },
  {
    label: "Score ≥ 50 + Cluster",
    filter: (bt) => (bt.declaration.signalScore ?? 0) >= 50 && bt.declaration.isCluster === true,
  },
  {
    label: "PDG / CFO only (score ≥ 50)",
    filter: (bt) => {
      const role = roleCategory(bt.declaration.insiderFunction);
      return (role === "ceo" || role === "cfo") && (bt.declaration.signalScore ?? 0) >= 50;
    },
  },
  {
    label: "Score ≥ 60 + amount ≥ 100k€",
    filter: (bt) => (bt.declaration.signalScore ?? 0) >= 60 && (bt.declaration.totalAmount ?? 0) >= 100_000,
  },
  {
    label: "Score ≥ 60 + Cluster + amount ≥ 100k€",
    filter: (bt) => (bt.declaration.signalScore ?? 0) >= 60
                  && bt.declaration.isCluster === true
                  && (bt.declaration.totalAmount ?? 0) >= 100_000,
  },
  {
    label: "Score ≥ 50 + %mcap ≥ 0.1% (conviction)",
    filter: (bt) => (bt.declaration.signalScore ?? 0) >= 50
                  && (bt.declaration.pctOfMarketCap ?? 0) >= 0.1,
  },
  {
    label: "Score ≥ 60 + PDG/CFO + Acquisition pure",
    filter: (bt) => {
      const role = roleCategory(bt.declaration.insiderFunction);
      const isPureBuy = /Acquisition$/.test(bt.declaration.transactionNature ?? "");
      return (bt.declaration.signalScore ?? 0) >= 60
        && (role === "ceo" || role === "cfo")
        && isPureBuy;
    },
  },
  {
    label: "Score ≥ 60 + analystReco favorable (buy/strong_buy)",
    filter: (bt) => (bt.declaration.signalScore ?? 0) >= 60
                  && /buy|strong_buy/i.test(bt.declaration.company.analystReco ?? ""),
  },
  {
    label: "BEST MIX · Score ≥ 60 + Cluster + PDG/CFO/Dir",
    filter: (bt) => {
      const role = roleCategory(bt.declaration.insiderFunction);
      return (bt.declaration.signalScore ?? 0) >= 60
        && bt.declaration.isCluster === true
        && (role === "ceo" || role === "cfo" || role === "director");
    },
  },
];

// ── Run all strategies ──────────────────────────────────────────────────────
console.log(`${C.bold}${C.cyan}COMPARATIF DE 14 STRATÉGIES (portefeuille top-20 rebalancement mensuel, frais 1%)${C.reset}\n`);

const results = strategies.map(runStrategy);

// Header
const headers = ["Stratégie", "n décl", "mois", "CAGR", "Sharpe", "MaxDD", "Win%", "Beat CAC%"];
const colWidths = [54, 7, 5, 9, 7, 7, 6, 9];
function padCell(s, w, align = "l") {
  s = String(s);
  if (s.length > w) return s.slice(0, w - 1) + "…";
  return align === "r" ? s.padStart(w) : s.padEnd(w);
}
function row(cells, color = "") {
  const line = cells.map((c, i) => padCell(c, colWidths[i], i === 0 ? "l" : "r")).join(" │ ");
  console.log(`${color}${line}${C.reset}`);
}
row(headers, C.dim);
console.log(C.dim + "─".repeat(colWidths.reduce((a, b) => a + b + 3, 0)) + C.reset);

for (const r of results) {
  if (r.insufficient) {
    row([r.label, r.matching, "—", "n/a", "—", "—", "—", "—"], C.dim);
    continue;
  }
  // Color code by CAGR
  const color = r.cagr > 10 ? C.green : r.cagr > 0 ? "" : C.red;
  row([
    r.label,
    r.matching,
    r.monthsSimulated,
    (r.cagr > 0 ? "+" : "") + r.cagr.toFixed(2) + "%",
    r.sharpe.toFixed(2),
    r.maxDDPct.toFixed(1) + "%",
    r.winRatePct.toFixed(0) + "%",
    r.beatCacPct.toFixed(0) + "%",
  ], color);
}

// CAC reference
console.log();
const cacValues = Object.values(cacByMonth);
const cacMonthly = mean(cacValues);
const cacStd = std(cacValues);
const cacTotal = cacValues.reduce((acc, r) => acc * (1 + r / 100), 1);
const cacYears = cacValues.length / 12;
const cacCagr = (Math.pow(cacTotal, 1 / cacYears) - 1) * 100;
const cacSharpe = cacStd ? (cacMonthly / cacStd) * Math.sqrt(12) : 0;
console.log(`${C.bold}BENCHMARK — CAC 40 buy & hold :${C.reset}`);
console.log(`  ${C.dim}CAGR ${(cacCagr > 0 ? "+" : "") + cacCagr.toFixed(2)}% · Sharpe ${cacSharpe.toFixed(2)} sur ${cacValues.length} mois${C.reset}\n`);

// Best pick
const best = results.filter((r) => !r.insufficient).sort((a, b) => b.cagr - a.cagr)[0];
if (best) {
  console.log(`${C.bold}${C.green}✓ MEILLEURE STRATÉGIE :${C.reset} ${best.label}`);
  console.log(`  CAGR ${(best.cagr > 0 ? "+" : "") + best.cagr.toFixed(2)}% · Sharpe ${best.sharpe.toFixed(2)} · bat CAC ${best.beatCacPct.toFixed(0)}% des mois`);
  console.log(`  Nombre de signaux disponibles : ${best.matching.toLocaleString("fr-FR")}`);
  console.log(`  Alpha vs CAC 40 : ${(best.cagr - cacCagr > 0 ? "+" : "") + (best.cagr - cacCagr).toFixed(2)} points/an`);
}

await p.$disconnect();
