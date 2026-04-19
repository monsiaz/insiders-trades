/**
 * scripts/analyze-signals.ts — Deep signal analysis
 *
 * Runs locally against the full DB to find which patterns
 * historically predict the best returns.
 *
 * Outputs a JSON report + console summary.
 *
 * Run: npx tsx scripts/analyze-signals.ts
 */

import { prisma } from "../src/lib/prisma";
import fs from "fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TradeRow {
  id: string;
  amfId: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  insiderName: string | null;
  insiderFunction: string | null;
  transactionNature: string | null;
  totalAmount: number | null;
  transactionDate: Date | null;
  pubDate: Date;
  signalScore: number | null;
  isCluster: boolean | null;
  pctOfMarketCap: number | null;
  pctOfInsiderFlow: number | null;
  insiderCumNet: number | null;
  isin: string | null;
  marketCap: bigint | null;
  return30d: number | null;
  return60d: number | null;
  return90d: number | null;
  return160d: number | null;
}

// ─── Stats helpers ───────────────────────────────────────────────────────────

function avg(ns: number[]): number | null {
  return ns.length === 0 ? null : ns.reduce((a, b) => a + b, 0) / ns.length;
}
function median(ns: number[]): number | null {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function winRate(ns: number[]): number | null {
  return ns.length === 0 ? null : (ns.filter((n) => n > 0).length / ns.length) * 100;
}
function sharpe(ns: number[], rf = 0): number | null {
  if (ns.length < 3) return null;
  const a = avg(ns)!;
  const sd = Math.sqrt(ns.reduce((s, n) => s + (n - a) ** 2, 0) / ns.length);
  return sd === 0 ? null : (a - rf) / sd;
}

interface GroupResult {
  n: number;
  avg30: number | null;
  avg90: number | null;
  avg180: number | null;
  med90: number | null;
  win90: number | null;
  sharpe90: number | null;
}

function group(trades: Pick<TradeRow, "return30d" | "return90d" | "return160d">[]): GroupResult {
  const r30 = trades.map((t) => t.return30d).filter((v): v is number => v != null);
  const r90 = trades.map((t) => t.return90d).filter((v): v is number => v != null);
  const r180 = trades.map((t) => t.return160d).filter((v): v is number => v != null);
  return {
    n: trades.length,
    avg30: avg(r30),
    avg90: avg(r90),
    avg180: avg(r180),
    med90: median(r90),
    win90: winRate(r90),
    sharpe90: sharpe(r90),
  };
}

function fmt(v: number | null, d = 1): string {
  if (v == null) return "  —  ";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}
function fmtS(v: number | null): string {
  if (v == null) return "  —  ";
  return v.toFixed(2);
}

function print(label: string, g: GroupResult) {
  console.log(
    `  ${label.padEnd(38)} n=${String(g.n).padStart(4)}  avg90=${fmt(g.avg90).padStart(8)}  med90=${fmt(g.med90).padStart(8)}  win=${g.win90 != null ? g.win90.toFixed(0) + "%" : "—"}  SR=${fmtS(g.sharpe90)}`
  );
}

// ─── Signal classifiers ───────────────────────────────────────────────────────

function insiderRoleScore(fn: string | null): string {
  if (!fn) return "Unknown";
  const f = fn.toLowerCase();
  if (f.includes("président") || f.includes("directeur général") || f.includes("pdg") || f.includes("ceo")) return "PDG/DG";
  if (f.includes("directeur financier") || f.includes("daf") || f.includes("cfo")) return "CFO/DAF";
  if (f.includes("directeur") || f.includes("chief")) return "Directeur";
  if (f.includes("administrateur") || f.includes("conseil") || f.includes("board")) return "CA/Board";
  if (f.includes("dirigeant") || f.includes("manager")) return "Manager";
  return "Autre";
}

function companySizeLabel(mcap: bigint | null): string {
  if (!mcap) return "Unknown";
  const mc = Number(mcap);
  if (mc < 50_000_000) return "Micro (<50M€)";
  if (mc < 300_000_000) return "Small (50-300M€)";
  if (mc < 2_000_000_000) return "Mid (300M-2B€)";
  if (mc < 10_000_000_000) return "Large (2-10B€)";
  return "Mega (>10B€)";
}

function mcapPctLabel(pct: number | null): string {
  if (pct == null) return "Unknown";
  if (pct < 0.005) return "<0.005%";
  if (pct < 0.02) return "0.005-0.02%";
  if (pct < 0.1) return "0.02-0.1%";
  if (pct < 0.5) return "0.1-0.5%";
  if (pct < 2) return "0.5-2%";
  return ">2%";
}

function amountLabel(amt: number | null): string {
  if (!amt) return "Unknown";
  if (amt < 10_000) return "<10k€";
  if (amt < 50_000) return "10-50k€";
  if (amt < 200_000) return "50-200k€";
  if (amt < 1_000_000) return "200k-1M€";
  if (amt < 5_000_000) return "1-5M€";
  return ">5M€";
}

function seasonLabel(d: Date | null): string {
  if (!d) return "Unknown";
  const m = d.getMonth(); // 0=jan
  if (m <= 1 || m === 11) return "Q4/Q1 (déc-fév)";
  if (m <= 4) return "Q2 (mar-mai)";
  if (m <= 7) return "Q3 (juin-août)";
  return "Q4 (sep-nov)";
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Loading all backtest trades...\n");

  // Fetch all results with rich context
  const rawResults = await prisma.backtestResult.findMany({
    where: { priceAtTrade: { gt: 0 } },
    select: {
      return30d: true,
      return60d: true,
      return90d: true,
      return160d: true,
      declaration: {
        select: {
          id: true,
          amfId: true,
          companyId: true,
          insiderName: true,
          insiderFunction: true,
          transactionNature: true,
          totalAmount: true,
          transactionDate: true,
          pubDate: true,
          signalScore: true,
          isCluster: true,
          pctOfMarketCap: true,
          pctOfInsiderFlow: true,
          insiderCumNet: true,
          isin: true,
          company: { select: { name: true, slug: true, marketCap: true, isin: true } },
        },
      },
    },
  });

  // Flatten
  const trades: TradeRow[] = rawResults.map((r) => ({
    id: r.declaration.id,
    amfId: r.declaration.amfId,
    companyId: r.declaration.companyId,
    companyName: r.declaration.company.name,
    companySlug: r.declaration.company.slug,
    insiderName: r.declaration.insiderName,
    insiderFunction: r.declaration.insiderFunction,
    transactionNature: r.declaration.transactionNature,
    totalAmount: r.declaration.totalAmount ? Number(r.declaration.totalAmount) : null,
    transactionDate: r.declaration.transactionDate,
    pubDate: r.declaration.pubDate,
    signalScore: r.declaration.signalScore,
    isCluster: r.declaration.isCluster,
    pctOfMarketCap: r.declaration.pctOfMarketCap,
    pctOfInsiderFlow: r.declaration.pctOfInsiderFlow,
    insiderCumNet: r.declaration.insiderCumNet ? Number(r.declaration.insiderCumNet) : null,
    isin: r.declaration.isin,
    marketCap: r.declaration.company.marketCap,
    return30d: r.return30d,
    return60d: r.return60d,
    return90d: r.return90d,
    return160d: r.return160d,
  }));

  console.log(`📊 ${trades.length} backtest trades loaded\n`);

  // ── Detect behavioral patterns ────────────────────────────────────────────

  // Group all trades by (insiderName, companyId) to detect patterns
  const tradesByInsiderCompany = new Map<string, TradeRow[]>();
  const tradesByCompany = new Map<string, TradeRow[]>();
  const tradesByInsider = new Map<string, TradeRow[]>();

  for (const t of trades) {
    const ik = `${t.insiderName ?? "?"}::${t.companyId}`;
    if (!tradesByInsiderCompany.has(ik)) tradesByInsiderCompany.set(ik, []);
    tradesByInsiderCompany.get(ik)!.push(t);

    if (!tradesByCompany.has(t.companyId)) tradesByCompany.set(t.companyId, []);
    tradesByCompany.get(t.companyId)!.push(t);

    const ik2 = t.insiderName ?? "?";
    if (!tradesByInsider.has(ik2)) tradesByInsider.set(ik2, []);
    tradesByInsider.get(ik2)!.push(t);
  }

  // Fetch ALL declaration history (not just backtest) to detect DCA / first-buy etc.
  const allDecls = await prisma.declaration.findMany({
    where: { type: "DIRIGEANTS", pdfParsed: true, insiderName: { not: null } },
    select: {
      companyId: true,
      insiderName: true,
      transactionNature: true,
      totalAmount: true,
      transactionDate: true,
      pubDate: true,
    },
    orderBy: { transactionDate: "asc" },
  });

  // Build per-insider-company history
  const historyByIC = new Map<string, typeof allDecls>();
  for (const d of allDecls) {
    const k = `${d.insiderName}::${d.companyId}`;
    if (!historyByIC.has(k)) historyByIC.set(k, []);
    historyByIC.get(k)!.push(d);
  }

  // Annotate each trade with behavioral patterns
  type Annotated = TradeRow & {
    isDca: boolean;          // >= 3 buys in past 12 months by same insider+company
    isFirstBuy: boolean;     // First ever buy of this stock by this insider
    isReversal: boolean;     // Insider sold in past 6 months, now buying
    isBigAccum: boolean;     // Buying > 50% of their total historic flow in one shot
    isLowFloat: boolean;     // Trade > 1% of mcap
    isHighConviction: boolean; // Score >= 65 AND amount > 100k AND CEO/DG
    nearEarnings: boolean;   // Within 60 days before known filing dates (Q1=mar, Q2=jun, Q3=sep, Q4=dec)
    consecutiveBuys: number; // How many consecutive buy sessions
  };

  const annotated: Annotated[] = trades.map((t) => {
    const k = `${t.insiderName ?? "?"}::${t.companyId}`;
    const history = (historyByIC.get(k) ?? []).filter((h) => {
      const d = h.transactionDate ?? h.pubDate;
      const td = t.transactionDate ?? t.pubDate;
      return d <= td; // only history before this trade
    });

    const buyHistory = history.filter((h) => (h.transactionNature ?? "").toLowerCase().includes("acqui"));
    const sellHistory = history.filter((h) => (h.transactionNature ?? "").toLowerCase().includes("cession"));

    const tDate = t.transactionDate ?? t.pubDate;
    const past12m = new Date(tDate.getTime() - 365 * 86400_000);
    const past6m = new Date(tDate.getTime() - 180 * 86400_000);
    const past30d = new Date(tDate.getTime() - 30 * 86400_000);

    const recentBuys = buyHistory.filter((h) => (h.transactionDate ?? h.pubDate) >= past12m);
    const recentSells = sellHistory.filter((h) => (h.transactionDate ?? h.pubDate) >= past6m);
    const recentBuys30d = buyHistory.filter((h) => (h.transactionDate ?? h.pubDate) >= past30d);

    const totalHistoricBuys = buyHistory.reduce((s, h) => s + Number(h.totalAmount ?? 0), 0);
    const isDca = recentBuys.length >= 2; // 2+ buys in past 12m (this is the 3rd+)
    const isFirstBuy = buyHistory.filter((h) => {
      const d = h.transactionDate ?? h.pubDate;
      return d < tDate;
    }).length === 0;

    const isReversal = recentSells.length > 0 && recentBuys30d.length === 0; // sold then buying
    const isBigAccum = totalHistoricBuys > 0 && t.totalAmount != null
      ? (t.totalAmount / totalHistoricBuys) > 0.5
      : false;

    const isLowFloat = (t.pctOfMarketCap ?? 0) > 1;

    const role = insiderRoleScore(t.insiderFunction);
    const isHighConviction = (t.signalScore ?? 0) >= 65
      && (t.totalAmount ?? 0) >= 100_000
      && (role === "PDG/DG" || role === "CFO/DAF" || role === "Directeur");

    // Consecutive buys: how many buys in the past 30 days at this company
    const companyHistory = (allDecls.filter((d) =>
      d.companyId === t.companyId &&
      (d.transactionDate ?? d.pubDate) <= tDate &&
      (d.transactionDate ?? d.pubDate) >= past30d &&
      (d.transactionNature ?? "").toLowerCase().includes("acqui")
    ));
    const consecutiveBuys = new Set(companyHistory.map((d) => d.insiderName)).size;

    // Near earnings: typical reporting months (Feb, Mar, Apr, Jul, Aug, Sep, Oct, Nov)
    const month = tDate.getMonth();
    const nearEarnings = [1, 2, 3, 6, 7, 8, 9, 10].includes(month);

    return { ...t, isDca, isFirstBuy, isReversal, isBigAccum, isLowFloat, isHighConviction, nearEarnings, consecutiveBuys };
  });

  // ── Analysis sections ─────────────────────────────────────────────────────

  const header = (title: string) => console.log(`\n${"═".repeat(70)}\n  ${title}\n${"═".repeat(70)}`);
  const sub = (title: string) => console.log(`\n  ── ${title} ──`);

  // 1. OVERALL
  header("1. OVERALL PERFORMANCE");
  print("All trades", group(annotated));
  print("Signal score ≥ 50", group(annotated.filter((t) => (t.signalScore ?? 0) >= 50)));
  print("Signal score ≥ 65", group(annotated.filter((t) => (t.signalScore ?? 0) >= 65)));
  print("Signal score ≥ 75", group(annotated.filter((t) => (t.signalScore ?? 0) >= 75)));

  // 2. INSIDER ROLE
  header("2. PERFORMANCE BY INSIDER ROLE");
  const roles = [...new Set(annotated.map((t) => insiderRoleScore(t.insiderFunction)))];
  for (const role of ["PDG/DG", "CFO/DAF", "Directeur", "CA/Board", "Manager", "Autre", "Unknown"]) {
    const group_ = annotated.filter((t) => insiderRoleScore(t.insiderFunction) === role);
    if (group_.length >= 5) print(role, group(group_));
  }

  // 3. COMPANY SIZE
  header("3. PERFORMANCE BY COMPANY SIZE");
  for (const label of ["Micro (<50M€)", "Small (50-300M€)", "Mid (300M-2B€)", "Large (2-10B€)", "Mega (>10B€)"]) {
    const g = annotated.filter((t) => companySizeLabel(t.marketCap) === label);
    if (g.length >= 5) print(label, group(g));
  }

  // 4. TRANSACTION SIZE (% OF MCAP)
  header("4. PERFORMANCE BY TRANSACTION SIZE (% OF MARKET CAP)");
  for (const label of ["<0.005%", "0.005-0.02%", "0.02-0.1%", "0.1-0.5%", "0.5-2%", ">2%"]) {
    const g = annotated.filter((t) => mcapPctLabel(t.pctOfMarketCap) === label);
    if (g.length >= 5) print(label, group(g));
  }

  // 5. AMOUNT BUCKETS
  header("5. PERFORMANCE BY TRADE AMOUNT");
  for (const label of ["<10k€", "10-50k€", "50-200k€", "200k-1M€", "1-5M€", ">5M€"]) {
    const g = annotated.filter((t) => amountLabel(t.totalAmount) === label);
    if (g.length >= 5) print(label, group(g));
  }

  // 6. BEHAVIORAL PATTERNS
  header("6. BEHAVIORAL PATTERNS");
  print("DCA (≥2 buys in 12m before)", group(annotated.filter((t) => t.isDca)));
  print("First-ever buy (initiateur)", group(annotated.filter((t) => t.isFirstBuy)));
  print("Reversal (vendu puis racheté)", group(annotated.filter((t) => t.isReversal)));
  print("Big accumulation (>50% total flow)", group(annotated.filter((t) => t.isBigAccum)));
  print("Low float trade (>1% mcap)", group(annotated.filter((t) => t.isLowFloat)));
  print("High conviction (score≥65+CEO+100k€)", group(annotated.filter((t) => t.isHighConviction)));
  print("Near earnings season", group(annotated.filter((t) => t.nearEarnings)));
  print("Cluster (≥2 insiders same month)", group(annotated.filter((t) => t.isCluster)));

  // 7. CLUSTER DEPTH
  header("7. CLUSTER DEPTH (nb insiders buying same period)");
  for (const depth of [1, 2, 3, 4, 5]) {
    const g = annotated.filter((t) => t.consecutiveBuys === depth);
    if (g.length >= 5) print(`${depth} insider(s) in 30d`, group(g));
  }
  const deep = annotated.filter((t) => t.consecutiveBuys >= 3);
  if (deep.length >= 5) print("3+ insiders (deep cluster)", group(deep));

  // 8. SEASONALITY
  header("8. SEASONALITY");
  for (const label of ["Q4/Q1 (déc-fév)", "Q2 (mar-mai)", "Q3 (juin-août)", "Q4 (sep-nov)"]) {
    const g = annotated.filter((t) => seasonLabel(t.transactionDate) === label);
    if (g.length >= 5) print(label, group(g));
  }

  // 9. COMBINATION SIGNALS (the money shots)
  header("9. SIGNAL COMBINATIONS — Finding alpha");
  const combos: Array<[string, Annotated[]]> = [
    ["PDG/DG + score≥60", annotated.filter((t) => insiderRoleScore(t.insiderFunction) === "PDG/DG" && (t.signalScore ?? 0) >= 60)],
    ["PDG/DG + first buy", annotated.filter((t) => insiderRoleScore(t.insiderFunction) === "PDG/DG" && t.isFirstBuy)],
    ["PDG/DG + cluster", annotated.filter((t) => insiderRoleScore(t.insiderFunction) === "PDG/DG" && t.isCluster)],
    ["PDG/DG + small cap", annotated.filter((t) => insiderRoleScore(t.insiderFunction) === "PDG/DG" && companySizeLabel(t.marketCap) === "Small (50-300M€)")],
    ["Cluster + score≥60", annotated.filter((t) => t.isCluster && (t.signalScore ?? 0) >= 60)],
    ["Cluster + first buy", annotated.filter((t) => t.isCluster && t.isFirstBuy)],
    ["Cluster + small cap", annotated.filter((t) => t.isCluster && companySizeLabel(t.marketCap) === "Small (50-300M€)")],
    ["Cluster + >0.1% mcap", annotated.filter((t) => t.isCluster && (t.pctOfMarketCap ?? 0) >= 0.1)],
    ["First buy + >0.1% mcap", annotated.filter((t) => t.isFirstBuy && (t.pctOfMarketCap ?? 0) >= 0.1)],
    ["High conviction (all)", annotated.filter((t) => t.isHighConviction)],
    ["Big accum + cluster", annotated.filter((t) => t.isBigAccum && t.isCluster)],
    ["Score≥70 + cluster", annotated.filter((t) => (t.signalScore ?? 0) >= 70 && t.isCluster)],
    ["Score≥70 + first buy", annotated.filter((t) => (t.signalScore ?? 0) >= 70 && t.isFirstBuy)],
    ["Score≥70 + small/micro", annotated.filter((t) => (t.signalScore ?? 0) >= 70 && ["Small (50-300M€)", "Micro (<50M€)"].includes(companySizeLabel(t.marketCap)))],
    ["DCA + cluster", annotated.filter((t) => t.isDca && t.isCluster)],
    ["Reversal + big amount", annotated.filter((t) => t.isReversal && (t.totalAmount ?? 0) >= 100_000)],
    ["Deep cluster (3+) + score≥50", annotated.filter((t) => t.consecutiveBuys >= 3 && (t.signalScore ?? 0) >= 50)],
  ];

  const comboResults: Array<{ name: string; n: number; avg90: number | null; win90: number | null; sharpe: number | null }> = [];
  for (const [name, g] of combos) {
    if (g.length >= 5) {
      const r = group(g);
      print(name, r);
      comboResults.push({ name, n: r.n, avg90: r.avg90, win90: r.win90, sharpe: r.sharpe90 });
    }
  }

  // 10. BEST COMBINATIONS RANKED BY SHARPE
  header("10. RANKING BY SHARPE RATIO (T+90)");
  const ranked = comboResults
    .filter((c) => c.sharpe != null && c.n >= 10)
    .sort((a, b) => (b.sharpe ?? 0) - (a.sharpe ?? 0));

  console.log(`\n  ${"Signal".padEnd(40)} ${"n".padStart(4)}  ${"avg90".padStart(8)}  ${"win%".padStart(6)}  ${"sharpe".padStart(7)}`);
  console.log("  " + "-".repeat(70));
  for (const c of ranked.slice(0, 15)) {
    const row = [
      c.name.padEnd(40),
      String(c.n).padStart(4),
      fmt(c.avg90).padStart(8),
      (c.win90 != null ? c.win90.toFixed(0) + "%" : "—").padStart(6),
      fmtS(c.sharpe).padStart(7),
    ].join("  ");
    console.log(`  ${row}`);
  }

  // 11. PER-YEAR BREAKDOWN FOR TOP SIGNALS
  header("11. YEAR-BY-YEAR FOR TOP SIGNALS");
  const topSignal = ranked[0];
  if (topSignal) {
    const topTrades = combos.find(([name]) => name === topSignal.name)?.[1] ?? [];
    const years = [...new Set(topTrades.map((t) => (t.transactionDate ?? t.pubDate).getFullYear()))].sort();
    console.log(`\n  Top signal: ${topSignal.name}`);
    for (const year of years) {
      const g = topTrades.filter((t) => (t.transactionDate ?? t.pubDate).getFullYear() === year);
      if (g.length >= 3) print(`  ${year}`, group(g));
    }
  }

  // 12. TOP 30 TRADES BY SHARPE INDIVIDUAL (best risk-adjusted single trades)
  header("12. TOP 20 TRADES BY RETURN T+90");
  const topByReturn = annotated
    .filter((t) => t.return90d != null)
    .sort((a, b) => (b.return90d ?? 0) - (a.return90d ?? 0))
    .slice(0, 20);

  console.log(`\n  ${"Company".padEnd(25)} ${"Insider".padEnd(20)} ${"Role".padEnd(12)} ${"Amount".padStart(10)} ${"Score".padStart(6)} ${"T+90".padStart(8)} ${"T+180".padStart(8)}`);
  console.log("  " + "-".repeat(95));
  for (const t of topByReturn) {
    const row = [
      t.companyName.slice(0, 24).padEnd(25),
      (t.insiderName ?? "—").slice(0, 19).padEnd(20),
      insiderRoleScore(t.insiderFunction).padEnd(12),
      (t.totalAmount ? (t.totalAmount >= 1e6 ? `${(t.totalAmount / 1e6).toFixed(1)}M€` : `${(t.totalAmount / 1e3).toFixed(0)}k€`) : "—").padStart(10),
      String(Math.round(t.signalScore ?? 0)).padStart(6),
      fmt(t.return90d).padStart(8),
      fmt(t.return160d).padStart(8),
    ].join("  ");
    console.log(`  ${row}`);
  }

  // 13. WORST SIGNALS (negative alpha)
  header("13. SIGNALS TO AVOID (worst avg return)");
  const worstCombos = comboResults
    .filter((c) => c.avg90 != null && c.n >= 10)
    .sort((a, b) => (a.avg90 ?? 0) - (b.avg90 ?? 0))
    .slice(0, 5);
  for (const c of worstCombos) {
    const [, g] = combos.find(([name]) => name === c.name) ?? [];
    if (g) print(c.name, group(g));
  }

  // ── Save full annotated dataset ────────────────────────────────────────────

  const reportPath = "/tmp/signal-analysis.json";
  const report = {
    generatedAt: new Date().toISOString(),
    totalTrades: annotated.length,
    overall: group(annotated),
    byRole: Object.fromEntries(
      ["PDG/DG", "CFO/DAF", "Directeur", "CA/Board", "Manager", "Autre"].map((r) => [
        r,
        group(annotated.filter((t) => insiderRoleScore(t.insiderFunction) === r)),
      ])
    ),
    bySize: Object.fromEntries(
      ["Micro (<50M€)", "Small (50-300M€)", "Mid (300M-2B€)", "Large (2-10B€)", "Mega (>10B€)"].map((l) => [
        l,
        group(annotated.filter((t) => companySizeLabel(t.marketCap) === l)),
      ])
    ),
    byMcapPct: Object.fromEntries(
      ["<0.005%", "0.005-0.02%", "0.02-0.1%", "0.1-0.5%", "0.5-2%", ">2%"].map((l) => [
        l,
        group(annotated.filter((t) => mcapPctLabel(t.pctOfMarketCap) === l)),
      ])
    ),
    byAmount: Object.fromEntries(
      ["<10k€", "10-50k€", "50-200k€", "200k-1M€", "1-5M€", ">5M€"].map((l) => [
        l,
        group(annotated.filter((t) => amountLabel(t.totalAmount) === l)),
      ])
    ),
    byBehavior: {
      dca: group(annotated.filter((t) => t.isDca)),
      firstBuy: group(annotated.filter((t) => t.isFirstBuy)),
      reversal: group(annotated.filter((t) => t.isReversal)),
      bigAccum: group(annotated.filter((t) => t.isBigAccum)),
      lowFloat: group(annotated.filter((t) => t.isLowFloat)),
      highConviction: group(annotated.filter((t) => t.isHighConviction)),
      cluster: group(annotated.filter((t) => !!t.isCluster)),
    },
    byCombination: Object.fromEntries(
      comboResults.map((c) => [c.name, { n: c.n, avg90: c.avg90, win90: c.win90, sharpe: c.sharpe }])
    ),
    topCombinations: ranked.slice(0, 10).map((c) => ({ ...c })),
    topTrades: topByReturn.slice(0, 30).map((t) => ({
      company: t.companyName,
      insider: t.insiderName,
      role: insiderRoleScore(t.insiderFunction),
      amount: t.totalAmount,
      score: t.signalScore,
      date: t.transactionDate?.toISOString(),
      return30d: t.return30d,
      return90d: t.return90d,
      return160d: t.return160d,
      isDca: t.isDca,
      isFirstBuy: t.isFirstBuy,
      isCluster: t.isCluster,
      isHighConviction: t.isHighConviction,
    })),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report saved to ${reportPath}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
