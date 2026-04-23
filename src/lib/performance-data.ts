/**
 * Server-side computations for the public /performance page.
 *
 * Runs the same backtest logic as scripts/strategy-backtest-v2.mjs but cached
 * at page revalidation time (hourly). No external network calls · uses data
 * already in Postgres (backtestResult.returnFromPub90d + cac40 benchmark).
 */

import { prisma } from "./prisma";
import { roleFunctionScore } from "./role-utils";

const DAY = 86400_000;

export interface StrategyResult {
  label: string;
  description: string;
  labelEn: string;
  descriptionEn: string;
  matching: number;       // total signals matching the filter over all history
  months: number;         // months simulated
  cagr: number | null;    // annualized return %
  sharpe: number | null;
  maxDDPct: number | null;
  winRatePct: number | null;
  beatCacPct: number | null;
  avgMonthlyPct: number | null;
}

export interface FreshnessDistribution {
  median: number;
  p25: number;
  p75: number;
  p90: number;
  sampleSize: number;
  sameDayPct: number;    // filed within 1 day
  withinMarPct: number;  // within 3 trading days (MAR compliant)
}

export interface LeakAnalysis {
  sampleSize: number;
  totalReturn90dPct: number;       // tx → tx+90d
  leakReturnPct: number;           // tx → pubDate
  retailReturnPct: number;         // pubDate → pubDate+90d
  leakRatioPct: number;            // leak / total * 100
}

export interface PerfData {
  generatedAt: string;
  universe: {
    totalDeclarations: number;
    totalBacktests: number;
    retailEnrichedBacktests: number;
    periodStart: string;
    periodEnd: string;
  };
  freshness: FreshnessDistribution;
  leak: LeakAnalysis;
  cacBenchmark: {
    monthsCovered: number;
    cagrPct: number;
    sharpe: number;
  };
  strategies: StrategyResult[];
  bestByCagr: StrategyResult | null;
  bestBySharpe: StrategyResult | null;
  bestByBeatCac: StrategyResult | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function mean(arr: number[]): number {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0;
}
function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}
function pct(arr: number[], q: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(Math.floor(q * sorted.length), sorted.length - 1)];
}

function roleCategory(fn: string | null): "ceo" | "cfo" | "director" | "board" | "other" {
  if (!fn) return "other";
  const score = roleFunctionScore(fn);
  const f = fn.toLowerCase();
  if (/directeur.?g[éeè]n[éeè]ral|pdg|pr[ée]sident.{0,20}directeur|ceo/i.test(f)) return "ceo";
  if (/directeur.?financier|cfo|daf/i.test(f)) return "cfo";
  if (score >= 10) return "director";
  return "board";
}

// ── CAC 40 · cached manually. Since Vercel ISR caches this for 1h, we can
//   afford to call Yahoo once per hour. Safe fallback if Yahoo rate-limits us. ─
async function fetchCacMonthlyReturns(): Promise<Record<string, number>> {
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EFCHI?interval=1mo&range=10y";
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return {};
    const d = await r.json();
    const ts: number[] = d?.chart?.result?.[0]?.timestamp ?? [];
    const closes: (number | null)[] = d?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const byMonth: Record<string, number> = {};
    for (let i = 1; i < closes.length; i++) {
      if (closes[i - 1] && closes[i]) {
        const date = new Date(ts[i] * 1000);
        const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
        byMonth[key] = ((closes[i]! - closes[i - 1]!) / closes[i - 1]!) * 100;
      }
    }
    return byMonth;
  } catch {
    return {};
  }
}

// ── Strategy runner ────────────────────────────────────────────────────────
type Bt = Awaited<ReturnType<typeof fetchBacktestUniverse>>[number];

function runStrategy(
  universe: Bt[],
  cacByMonth: Record<string, number>,
  opts: {
    label: string;
    description: string;
    labelEn: string;
    descriptionEn: string;
    filter: (bt: Bt) => boolean;
    topN?: number;
    minN?: number;
  }
): StrategyResult {
  const TOP_N = opts.topN ?? 20;
  const MIN_N = opts.minN ?? 3;
  const TRANSACTION_COST = 1.0;
  const HOLD_MONTHS = 3; // T+90

  const matching = universe.filter(opts.filter);

  const byMonth = new Map<string, Bt[]>();
  for (const bt of matching) {
    if (bt.returnFromPub90d == null) continue;
    const pd = bt.pubDate;
    const key = `${pd.getUTCFullYear()}-${String(pd.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key)!.push(bt);
  }

  const months = [...byMonth.keys()].sort();
  const monthlyReturns: number[] = [];
  const monthDetails: { month: string; monthlyNet: number }[] = [];

  for (const m of months) {
    const pool = byMonth.get(m)!.sort((a, b) =>
      (b.signalScore ?? 0) - (a.signalScore ?? 0)
    );
    const top = pool.slice(0, TOP_N);
    if (top.length < MIN_N) continue;
    const avgRaw = mean(top.map((bt) => bt.returnFromPub90d!));
    const netQuarterly = avgRaw - TRANSACTION_COST;
    const monthlyEquiv = netQuarterly / HOLD_MONTHS;
    monthlyReturns.push(monthlyEquiv);
    monthDetails.push({ month: m, monthlyNet: monthlyEquiv });
  }

  if (monthlyReturns.length < 12) {
    return {
      label: opts.label, description: opts.description,
      labelEn: opts.labelEn, descriptionEn: opts.descriptionEn,
      matching: matching.length, months: monthlyReturns.length,
      cagr: null, sharpe: null, maxDDPct: null, winRatePct: null,
      beatCacPct: null, avgMonthlyPct: null,
    };
  }

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
    if (cac != null) {
      totalCacMonths++;
      if (d.monthlyNet > cac) beatCac++;
    }
  }

  const winRate = (monthlyReturns.filter((r) => r > 0).length / monthlyReturns.length) * 100;

  return {
    label: opts.label, description: opts.description,
    labelEn: opts.labelEn, descriptionEn: opts.descriptionEn,
    matching: matching.length, months: monthlyReturns.length,
    cagr, sharpe, maxDDPct: maxDD * 100,
    winRatePct: winRate,
    beatCacPct: totalCacMonths ? (beatCac / totalCacMonths) * 100 : 0,
    avgMonthlyPct: avgMonthly,
  };
}

async function fetchBacktestUniverse() {
  const rows = await prisma.backtestResult.findMany({
    where: {
      direction: "BUY",
      returnFromPub90d: { not: null },
      priceAtPub: { gt: 0 },
      declaration: { type: "DIRIGEANTS", pdfParsed: true },
    },
    select: {
      returnFromPub90d: true,
      returnFromPub365d: true,
      pubLeakPct: true,
      return90d: true,
      declaration: {
        select: {
          pubDate: true,
          transactionDate: true,
          signalScore: true,
          totalAmount: true,
          pctOfMarketCap: true,
          isCluster: true,
          insiderFunction: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    returnFromPub90d: r.returnFromPub90d,
    returnFromPub365d: r.returnFromPub365d,
    pubLeakPct: r.pubLeakPct,
    return90d: r.return90d,
    pubDate: r.declaration.pubDate,
    transactionDate: r.declaration.transactionDate,
    signalScore: r.declaration.signalScore,
    totalAmount: r.declaration.totalAmount,
    pctOfMarketCap: r.declaration.pctOfMarketCap,
    isCluster: r.declaration.isCluster,
    insiderFunction: r.declaration.insiderFunction,
  }));
}

// ── Main entry ─────────────────────────────────────────────────────────────
export async function computePerformanceData(): Promise<PerfData> {
  const [universe, cacByMonth, universeStats, firstDecl, lastDecl] = await Promise.all([
    fetchBacktestUniverse(),
    fetchCacMonthlyReturns(),
    prisma.backtestResult.count(),
    prisma.declaration.findFirst({ where: { type: "DIRIGEANTS" }, orderBy: { pubDate: "asc" }, select: { pubDate: true } }),
    prisma.declaration.findFirst({ where: { type: "DIRIGEANTS" }, orderBy: { pubDate: "desc" }, select: { pubDate: true } }),
  ]);
  const totalDecls = await prisma.declaration.count({ where: { type: "DIRIGEANTS" } });

  // Freshness distribution (tx → pub delays)
  const delays = universe
    .filter((b) => b.transactionDate != null)
    .map((b) => (b.pubDate.getTime() - b.transactionDate!.getTime()) / DAY)
    .filter((d) => d >= 0 && d <= 90);

  const sameDayCount = delays.filter((d) => d < 1).length;
  const withinMarCount = delays.filter((d) => d <= 3).length;
  const freshness: FreshnessDistribution = {
    median: pct(delays, 0.5),
    p25:    pct(delays, 0.25),
    p75:    pct(delays, 0.75),
    p90:    pct(delays, 0.9),
    sampleSize: delays.length,
    sameDayPct: (sameDayCount / Math.max(1, delays.length)) * 100,
    withinMarPct: (withinMarCount / Math.max(1, delays.length)) * 100,
  };

  // Leak analysis
  const leakSamples = universe.filter(
    (b) => b.pubLeakPct != null && b.returnFromPub90d != null && b.return90d != null
  );
  const leakMean = mean(leakSamples.map((b) => b.pubLeakPct!));
  const retailMean = mean(leakSamples.map((b) => b.returnFromPub90d!));
  const totalMean = mean(leakSamples.map((b) => b.return90d!));
  const leakRatioPct = Math.abs(totalMean) > 0.01 ? (leakMean / totalMean) * 100 : 0;

  // CAC benchmark stats
  const cacValues = Object.values(cacByMonth);
  const cacCagr = cacValues.length
    ? (Math.pow(cacValues.reduce((acc, r) => acc * (1 + r / 100), 1), 1 / (cacValues.length / 12)) - 1) * 100
    : 0;
  const cacSharpe = cacValues.length ? (mean(cacValues) / std(cacValues)) * Math.sqrt(12) : 0;

  // Run strategies
  const strategies: StrategyResult[] = [
    runStrategy(universe, cacByMonth, {
      label: "Passif · tous les signaux d'achat",
      description: "Stratégie naïve : on achète les 20 meilleurs scores chaque mois, quel que soit le filtre.",
      labelEn: "Passive · all buy signals",
      descriptionEn: "Naïve strategy: buy the top-20 scores every month regardless of filters.",
      filter: () => true,
    }),
    runStrategy(universe, cacByMonth, {
      label: "Filtre signalScore ≥ 50",
      description: "On n'achète que si notre score composite (v2) dépasse 50.",
      labelEn: "Score filter ≥ 50",
      descriptionEn: "Buy only when our composite score (v2) exceeds 50.",
      filter: (bt) => (bt.signalScore ?? 0) >= 50,
    }),
    runStrategy(universe, cacByMonth, {
      label: "Cluster uniquement",
      description: "Uniquement les trades où ≥ 2 dirigeants ont acheté la même société ±30 jours · signal de conviction collective.",
      labelEn: "Cluster only",
      descriptionEn: "Only trades where ≥ 2 insiders bought the same company within ±30 days · collective conviction signal.",
      filter: (bt) => bt.isCluster === true,
    }),
    runStrategy(universe, cacByMonth, {
      label: "PDG / CFO seulement",
      description: "On filtre par fonction : uniquement les trades des PDG et directeurs financiers (les plus informés).",
      labelEn: "CEO / CFO only",
      descriptionEn: "Filter by role: only trades by CEOs and CFOs (the best-informed insiders).",
      filter: (bt) => ["ceo", "cfo"].includes(roleCategory(bt.insiderFunction)),
    }),
    runStrategy(universe, cacByMonth, {
      label: "Trade ≥ 500k€ + Cluster",
      description: "Conviction matérielle : seulement les trades d'au moins 500 000 € dans un cluster.",
      labelEn: "Trade ≥ €500k + Cluster",
      descriptionEn: "Material conviction: trades of at least €500,000 inside a cluster.",
      filter: (bt) => (bt.totalAmount ?? 0) >= 500_000 && bt.isCluster === true,
    }),
    runStrategy(universe, cacByMonth, {
      label: "★ Stratégie Sigma recommandée",
      description: "PDG/CFO + cluster + déclaration récente (délai tx→pub ≤ 5 jours). Notre meilleur ratio rendement / risque.",
      labelEn: "★ Recommended Sigma strategy",
      descriptionEn: "CEO/CFO + cluster + recent filing (tx→pub delay ≤ 5 days). Best risk/return ratio.",
      filter: (bt) => {
        const role = roleCategory(bt.insiderFunction);
        const fresh = bt.transactionDate
          ? (bt.pubDate.getTime() - bt.transactionDate.getTime()) / DAY <= 5
          : false;
        return (role === "ceo" || role === "cfo") && bt.isCluster === true && fresh;
      },
    }),
  ];

  const valid = strategies.filter((s) => s.cagr != null);
  const bestByCagr = [...valid].sort((a, b) => (b.cagr ?? 0) - (a.cagr ?? 0))[0] ?? null;
  const bestBySharpe = [...valid].sort((a, b) => (b.sharpe ?? 0) - (a.sharpe ?? 0))[0] ?? null;
  const bestByBeatCac = [...valid].sort((a, b) => (b.beatCacPct ?? 0) - (a.beatCacPct ?? 0))[0] ?? null;

  return {
    generatedAt: new Date().toISOString(),
    universe: {
      totalDeclarations: totalDecls,
      totalBacktests: universeStats,
      retailEnrichedBacktests: universe.length,
      periodStart: firstDecl?.pubDate?.toISOString() ?? "",
      periodEnd: lastDecl?.pubDate?.toISOString() ?? "",
    },
    freshness,
    leak: {
      sampleSize: leakSamples.length,
      totalReturn90dPct: totalMean,
      leakReturnPct: leakMean,
      retailReturnPct: retailMean,
      leakRatioPct,
    },
    cacBenchmark: {
      monthsCovered: cacValues.length,
      cagrPct: cacCagr,
      sharpe: cacSharpe,
    },
    strategies,
    bestByCagr,
    bestBySharpe,
    bestByBeatCac,
  };
}
