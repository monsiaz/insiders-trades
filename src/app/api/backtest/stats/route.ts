/**
 * GET /api/backtest/stats
 * Deep backtest analytics — 6 time horizons + 23 signal combos
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeRole } from "@/lib/role-utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ── Stats helpers ──────────────────────────────────────────────────────────

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
function sharpe(ns: number[]): number | null {
  if (ns.length < 3) return null;
  const a = avg(ns)!;
  const sd = Math.sqrt(ns.reduce((s, n) => s + (n - a) ** 2, 0) / ns.length);
  return sd === 0 ? null : a / sd;
}

interface GroupStats {
  count: number;
  avgReturn30d: number | null;
  avgReturn60d: number | null;
  avgReturn90d: number | null;
  avgReturn160d: number | null;
  avgReturn365d: number | null;
  avgReturn730d: number | null;
  winRate90d: number | null;
  winRate365d: number | null;
  medianReturn90d: number | null;
  medianReturn365d: number | null;
  sharpe90d: number | null;
  sharpe365d: number | null;
  best90d: number | null;
  worst90d: number | null;
}

type ReturnRow = {
  return30d: number | null;
  return60d: number | null;
  return90d: number | null;
  return160d: number | null;
  return365d: number | null;
  return730d: number | null;
};

function aggregateGroup(rows: ReturnRow[]): GroupStats {
  const r30   = rows.map((r) => r.return30d).filter((v): v is number => v != null);
  const r60   = rows.map((r) => r.return60d).filter((v): v is number => v != null);
  const r90   = rows.map((r) => r.return90d).filter((v): v is number => v != null);
  const r160  = rows.map((r) => r.return160d).filter((v): v is number => v != null);
  const r365  = rows.map((r) => r.return365d).filter((v): v is number => v != null);
  const r730  = rows.map((r) => r.return730d).filter((v): v is number => v != null);
  return {
    count: rows.length,
    avgReturn30d:  avg(r30),
    avgReturn60d:  avg(r60),
    avgReturn90d:  avg(r90),
    avgReturn160d: avg(r160),
    avgReturn365d: avg(r365),
    avgReturn730d: avg(r730),
    winRate90d:    winRate(r90),
    winRate365d:   winRate(r365),
    medianReturn90d:  median(r90),
    medianReturn365d: median(r365),
    sharpe90d:  sharpe(r90),
    sharpe365d: sharpe(r365),
    best90d:  r90.length > 0 ? Math.max(...r90) : null,
    worst90d: r90.length > 0 ? Math.min(...r90) : null,
  };
}

// ── Classifiers ────────────────────────────────────────────────────────────

function roleLabel(fn: string | null): string {
  return normalizeRole(fn);
}

function sizeLabel(mcap: bigint | number | null | undefined): string {
  if (mcap == null) return "Unknown";
  const mc = Number(mcap);
  if (!mc) return "Unknown";
  if (mc < 50_000_000)    return "Micro";
  if (mc < 300_000_000)   return "Small";
  if (mc < 2_000_000_000) return "Mid";
  if (mc < 10_000_000_000) return "Large";
  return "Mega";
}

function mcapPctLabel(pct: number | null): string {
  if (pct == null) return "Unknown";
  if (pct < 0.02) return "<0.02%";
  if (pct < 0.1)  return "0.02-0.1%";
  if (pct < 0.5)  return "0.1-0.5%";
  if (pct < 2)    return "0.5-2%";
  return ">2%";
}

function amountLabel(amt: number | null): string {
  if (!amt) return "Unknown";
  if (amt < 10_000)    return "<10k€";
  if (amt < 50_000)    return "10-50k€";
  if (amt < 200_000)   return "50-200k€";
  if (amt < 1_000_000) return "200k-1M€";
  return ">1M€";
}

function clusterDepthLabel(n: number): string {
  if (n <= 1) return "1 insider";
  if (n === 2) return "2 insiders";
  if (n === 3) return "3 insiders";
  if (n === 4) return "4 insiders";
  return "5+ insiders";
}

function seasonLabel(d: Date | null): string {
  if (!d) return "Unknown";
  const m = d.getMonth();
  if (m <= 1) return "Jan-Fév";
  if (m <= 4) return "Mar-Mai";
  if (m <= 7) return "Juin-Août";
  return "Sep-Déc";
}

function scoreLabel(score: number | null): string {
  if (score == null) return "Unknown";
  if (score < 30) return "0-30";
  if (score < 50) return "30-50";
  if (score < 65) return "50-65";
  if (score < 80) return "65-80";
  return "80+";
}

// ── Main handler ───────────────────────────────────────────────────────────

export async function GET() {
  const raw = await prisma.backtestResult.findMany({
    where: { priceAtTrade: { gt: 0 } },
    select: {
      direction: true,
      return30d: true, return60d: true, return90d: true,
      return160d: true, return365d: true, return730d: true,
      declaration: {
        select: {
          id: true, amfId: true, companyId: true,
          signalScore: true, insiderFunction: true, insiderName: true,
          transactionNature: true, totalAmount: true, isCluster: true,
          pctOfMarketCap: true, pctOfInsiderFlow: true, insiderCumNet: true,
          transactionDate: true, pubDate: true, isin: true,
          company: { select: { name: true, slug: true, marketCap: true } },
          insider: { select: { gender: true } },
        },
      },
    },
  });

  if (raw.length === 0) {
    return NextResponse.json({ total: 0 });
  }

  // Load all declaration history for behavioral pattern detection
  const allDecls = await prisma.declaration.findMany({
    where: { type: "DIRIGEANTS", pdfParsed: true, insiderName: { not: null } },
    select: {
      companyId: true, insiderName: true,
      transactionNature: true, totalAmount: true,
      transactionDate: true, pubDate: true, insiderFunction: true,
    },
    orderBy: { transactionDate: "asc" },
  });

  // Index by insider+company for O(1) lookup
  const historyByIC = new Map<string, typeof allDecls>();
  for (const d of allDecls) {
    const k = `${d.insiderName}::${d.companyId}`;
    if (!historyByIC.has(k)) historyByIC.set(k, []);
    historyByIC.get(k)!.push(d);
  }

  // Index company history for cascade detection
  const historyByCompany = new Map<string, typeof allDecls>();
  for (const d of allDecls) {
    if (!historyByCompany.has(d.companyId)) historyByCompany.set(d.companyId, []);
    historyByCompany.get(d.companyId)!.push(d);
  }

  // ── Annotate each result ──────────────────────────────────────────────────

  type Row = ReturnRow & {
    declaration: typeof raw[0]["declaration"];
    direction: string;
    isDca: boolean;
    isFirstBuy: boolean;
    isBigAccum: boolean;
    isLowFloat: boolean;
    consecutiveBuys: number;
    consecutiveBuys90d: number;
    role: string;
    size: string;
    isFirstCFOBuy: boolean;
    hasCascade: boolean;
    isPostEarnings: boolean;
    isPDGDCA: boolean;
  };

  const rows: Row[] = raw.map((r) => {
    const d = r.declaration;
    const tDate = d.transactionDate ?? d.pubDate;
    const tMs = tDate.getTime();

    const icKey = `${d.insiderName ?? "?"}::${d.companyId}`;
    const fullHistory = historyByIC.get(icKey) ?? [];
    const history = fullHistory.filter((h) => (h.transactionDate ?? h.pubDate) <= tDate);
    const buyHistory = history.filter((h) => (h.transactionNature ?? "").toLowerCase().includes("acqui"));

    const past12m = new Date(tMs - 365 * 86400_000);
    const past90d  = new Date(tMs - 90  * 86400_000);
    const past30d  = new Date(tMs - 30  * 86400_000);

    const recentBuys12m = buyHistory.filter((h) => (h.transactionDate ?? h.pubDate) >= past12m);
    const recentBuys90d = buyHistory.filter((h) => (h.transactionDate ?? h.pubDate) >= past90d);
    const priorBuys = buyHistory.filter((h) => (h.transactionDate ?? h.pubDate) < tDate);

    const totalHistoric = buyHistory.reduce((s, h) => s + Number(h.totalAmount ?? 0), 0);
    const amt = d.totalAmount ? Number(d.totalAmount) : 0;

    // Count distinct insiders buying in last 30d
    const coHistory = historyByCompany.get(d.companyId) ?? [];
    const recentCooBuyers = new Set(
      coHistory.filter((h) =>
        (h.transactionDate ?? h.pubDate) <= tDate &&
        (h.transactionDate ?? h.pubDate) >= past30d &&
        (h.transactionNature ?? "").toLowerCase().includes("acqui")
      ).map((h) => h.insiderName)
    );
    const clusterSize = recentCooBuyers.size;

    // Was this CFO's first buy ever?
    const role = roleLabel(d.insiderFunction);
    const isFirstCFOBuy = role === "CFO/DAF" && priorBuys.length === 0;

    // 4+ distinct insiders same company in 30d = cascade
    const hasCascade = clusterSize >= 4;

    // Seasonal post-earnings check (April=3, July=6, October=9)
    const month = tDate.getMonth();
    const isPostEarnings = [3, 6, 9].includes(month);

    // PDG doing DCA
    const isPDGDCA = role === "PDG/DG" && recentBuys12m.length >= 2;

    return {
      ...r,
      direction: r.direction ?? "BUY",
      isDca: recentBuys12m.length >= 2,
      isFirstBuy: priorBuys.length === 0,
      isBigAccum: totalHistoric > 0 && amt > 0 ? amt / totalHistoric > 0.5 : false,
      isLowFloat: (d.pctOfMarketCap ?? 0) > 1,
      consecutiveBuys: clusterSize,
      consecutiveBuys90d: recentBuys90d.length,
      role,
      size: sizeLabel(d.company.marketCap),
      isFirstCFOBuy,
      hasCascade,
      isPostEarnings,
      isPDGDCA,
    };
  });

  // Split rows by direction
  const buyRows  = rows.filter((r) => r.direction === "BUY");
  const sellRows = rows.filter((r) => r.direction === "SELL");

  const overall     = aggregateGroup(rows);
  const overallBuys = aggregateGroup(buyRows);
  const overallSells = aggregateGroup(sellRows);

  // For sells: "win" = price DROP (return < 0 = insider sold before decline)
  // We compute a special "sell accuracy" metric: % times the price dropped
  function sellAccuracy(ns: number[]): number | null {
    const valid = ns.filter((v) => v != null) as number[];
    return valid.length === 0 ? null : (valid.filter((v) => v < 0).length / valid.length) * 100;
  }

  const sellStats = {
    count: sellRows.length,
    avgReturn90d:   overallSells.avgReturn90d,
    avgReturn365d:  overallSells.avgReturn365d,
    avgReturn730d:  overallSells.avgReturn730d,
    // accuracy = % of time price dropped (sell signal confirmed)
    accuracy90d:    sellAccuracy(sellRows.map(r => r.return90d).filter((v): v is number => v != null)),
    accuracy365d:   sellAccuracy(sellRows.map(r => r.return365d).filter((v): v is number => v != null)),
    bySellRole:     Object.fromEntries(
      ["PDG/DG", "CFO/DAF", "Directeur", "CA/Board", "Autre"].map((role) => {
        const g = sellRows.filter((r) => r.role === role);
        if (g.length < 3) return [role, null];
        const r90 = g.map(r => r.return90d).filter((v): v is number => v != null);
        const r365 = g.map(r => r.return365d).filter((v): v is number => v != null);
        return [role, {
          count: g.length,
          avgReturn90d: avg(r90),
          avgReturn365d: avg(r365),
          accuracy90d: sellAccuracy(r90),
          accuracy365d: sellAccuracy(r365),
        }];
      }).filter(([, v]) => v !== null)
    ),
    topSellsTrades: sellRows
      .filter((r) => r.return365d != null || r.return90d != null)
      .sort((a, b) => (a.return365d ?? a.return90d ?? 0) - (b.return365d ?? b.return90d ?? 0))
      .slice(0, 20)
      .map((r) => ({
        company: { name: r.declaration.company.name, slug: r.declaration.company.slug },
        insiderName: r.declaration.insiderName,
        role: r.role,
        totalAmount: r.declaration.totalAmount ? Number(r.declaration.totalAmount) : null,
        transactionDate: r.declaration.transactionDate?.toISOString() ?? r.declaration.pubDate.toISOString(),
        return30d: r.return30d, return90d: r.return90d, return365d: r.return365d,
      })),
  };

  // ── Group helpers (buy-only for signal analysis) ───────────────────────────

  function byKey<T>(items: Row[], keyFn: (r: Row) => T): Map<T, Row[]> {
    const map = new Map<T, Row[]>();
    for (const r of items) {
      const k = keyFn(r);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return map;
  }

  function toRecord(map: Map<string, Row[]>): Record<string, GroupStats> {
    const out: Record<string, GroupStats> = {};
    for (const [k, v] of map) out[k] = aggregateGroup(v);
    return out;
  }

  // All analysis below is BUY-only for signal discovery
  const byScore        = toRecord(byKey(buyRows, (r) => scoreLabel(r.declaration.signalScore)));
  const byRole         = toRecord(byKey(buyRows, (r) => r.role));
  const bySize         = toRecord(byKey(buyRows, (r) => r.size));
  const byMcapPct      = toRecord(byKey(buyRows, (r) => mcapPctLabel(r.declaration.pctOfMarketCap)));
  const byAmount       = toRecord(byKey(buyRows, (r) => amountLabel(r.declaration.totalAmount ? Number(r.declaration.totalAmount) : null)));
  const bySeason       = toRecord(byKey(buyRows, (r) => seasonLabel(r.declaration.transactionDate)));
  const byYear         = toRecord(byKey(rows, (r) => String((r.declaration.transactionDate ?? r.declaration.pubDate).getFullYear())));
  const byClusterDepth = toRecord(byKey(buyRows, (r) => clusterDepthLabel(r.consecutiveBuys)));

  const byBehavior: Record<string, GroupStats> = {
    "DCA (≥2 achats / 12m)":         aggregateGroup(buyRows.filter((r) => r.isDca)),
    "Premier achat insider":          aggregateGroup(buyRows.filter((r) => r.isFirstBuy)),
    "Grosse accumulation (>50% hist)": aggregateGroup(buyRows.filter((r) => r.isBigAccum)),
    "Trade >1% market cap":           aggregateGroup(buyRows.filter((r) => r.isLowFloat)),
    "Cluster (2+ insiders)":          aggregateGroup(buyRows.filter((r) => r.consecutiveBuys >= 2)),
    "Deep cluster (3+)":              aggregateGroup(buyRows.filter((r) => r.consecutiveBuys >= 3)),
    "Cascade (4+ insiders)":          aggregateGroup(buyRows.filter((r) => r.hasCascade)),
    "Post-résultats (Avr/Jul/Oct)":   aggregateGroup(buyRows.filter((r) => r.isPostEarnings)),
  };

  // ── 23 Signal combinations ────────────────────────────────────────────────

  const comboDefs: Array<{ name: string; category: string; rows: Row[] }> = [
    // ─ Role-based
    { name: "CFO/DAF buys",       category: "Rôle",      rows: buyRows.filter((r) => r.role === "CFO/DAF") },
    { name: "PDG/DG buys",        category: "Rôle",      rows: buyRows.filter((r) => r.role === "PDG/DG") },
    { name: "Premier achat CFO",  category: "Rôle",      rows: buyRows.filter((r) => r.isFirstCFOBuy) },
    { name: "PDG + DCA (≥2/an)",  category: "Rôle",      rows: buyRows.filter((r) => r.isPDGDCA) },

    // ─ Cluster / structure
    { name: "Cluster 2+ insiders",   category: "Cluster", rows: buyRows.filter((r) => r.consecutiveBuys >= 2) },
    { name: "Deep cluster 3+",       category: "Cluster", rows: buyRows.filter((r) => r.consecutiveBuys >= 3) },
    { name: "Cascade 4+ insiders",   category: "Cluster", rows: buyRows.filter((r) => r.hasCascade) },
    { name: "PDG + cluster",         category: "Cluster", rows: buyRows.filter((r) => r.role === "PDG/DG" && r.consecutiveBuys >= 2) },
    { name: "DCA + cluster",         category: "Cluster", rows: buyRows.filter((r) => r.isDca && r.consecutiveBuys >= 2) },

    // ─ Conviction
    { name: ">2% market cap",          category: "Conviction", rows: buyRows.filter((r) => (r.declaration.pctOfMarketCap ?? 0) >= 2) },
    { name: ">0.5% mcap PDG/DG",       category: "Conviction", rows: buyRows.filter((r) => r.role === "PDG/DG" && (r.declaration.pctOfMarketCap ?? 0) >= 0.5) },
    { name: "Premier achat + >1% mcap",category: "Conviction", rows: buyRows.filter((r) => r.isFirstBuy && (r.declaration.pctOfMarketCap ?? 0) >= 1) },
    { name: ">500k€ + PDG",            category: "Conviction", rows: buyRows.filter((r) => r.role === "PDG/DG" && (r.declaration.totalAmount ? Number(r.declaration.totalAmount) : 0) >= 500_000) },

    // ─ Company size
    { name: "Mid-cap (300M-2B€)",  category: "Taille", rows: buyRows.filter((r) => r.size === "Mid") },
    { name: "Small-cap (<300M€)",  category: "Taille", rows: buyRows.filter((r) => r.size === "Small") },
    { name: "Micro-cap (<50M€)",   category: "Taille", rows: buyRows.filter((r) => r.size === "Micro") },
    { name: "CFO + Mid-cap",       category: "Taille", rows: buyRows.filter((r) => r.role === "CFO/DAF" && r.size === "Mid") },
    { name: "CFO + Small/Micro",   category: "Taille", rows: buyRows.filter((r) => r.role === "CFO/DAF" && ["Small", "Micro"].includes(r.size)) },

    // ─ Score-based
    { name: "Score ≥65",          category: "Score", rows: buyRows.filter((r) => (r.declaration.signalScore ?? 0) >= 65) },
    { name: "Score ≥80 (ultra)",  category: "Score", rows: buyRows.filter((r) => (r.declaration.signalScore ?? 0) >= 80) },
    { name: "Score ≥65 + PDG/DG", category: "Score", rows: buyRows.filter((r) => (r.declaration.signalScore ?? 0) >= 65 && r.role === "PDG/DG") },
    { name: "Score ≥65 + cluster",category: "Score", rows: buyRows.filter((r) => (r.declaration.signalScore ?? 0) >= 65 && r.consecutiveBuys >= 2) },

    // ─ Timing
    { name: "Post-résultats (Avr/Jul/Oct)", category: "Timing", rows: buyRows.filter((r) => r.isPostEarnings) },
    { name: "Mars-Mai (Q2)",               category: "Timing", rows: buyRows.filter((r) => seasonLabel(r.declaration.transactionDate) === "Mar-Mai") },
    { name: "Premier achat + cluster",     category: "Timing", rows: buyRows.filter((r) => r.isFirstBuy && r.consecutiveBuys >= 2) },
  ];

  const signalCombos = comboDefs
    .filter(({ rows: g }) => g.length >= 5)
    .map(({ name, category, rows: g }) => {
      const stats = aggregateGroup(g);
      return { name, category, ...stats };
    })
    .sort((a, b) => (b.sharpe90d ?? -99) - (a.sharpe90d ?? -99));

  // ── Scatter ───────────────────────────────────────────────────────────────

  const scatter = rows
    .filter((r) => r.return90d != null && r.declaration.signalScore != null)
    .slice(0, 800)
    .map((r) => ({
      score: r.declaration.signalScore!,
      return90d: r.return90d!,
      company: r.declaration.company.name,
      role: r.role,
    }));

  // ── Top 30 trades by 1y return ────────────────────────────────────────────

  const topTrades = rows
    .filter((r) => r.return365d != null || r.return90d != null)
    .sort((a, b) => (b.return365d ?? b.return90d ?? 0) - (a.return365d ?? a.return90d ?? 0))
    .slice(0, 30)
    .map((r) => ({
      company: { name: r.declaration.company.name, slug: r.declaration.company.slug },
      insiderName: r.declaration.insiderName,
      insiderFunction: r.declaration.insiderFunction,
      role: r.role,
      totalAmount: r.declaration.totalAmount ? Number(r.declaration.totalAmount) : null,
      signalScore: r.declaration.signalScore,
      transactionDate: r.declaration.transactionDate?.toISOString() ?? null,
      return30d: r.return30d, return60d: r.return60d, return90d: r.return90d,
      return160d: r.return160d, return365d: r.return365d, return730d: r.return730d,
      isDca: r.isDca, isFirstBuy: r.isFirstBuy, isCluster: r.consecutiveBuys >= 2,
      consecutiveBuys: r.consecutiveBuys,
      pctOfMarketCap: r.declaration.pctOfMarketCap,
    }));

  // ── Smart insights ────────────────────────────────────────────────────────

  const insights: Array<{ icon: string; title: string; text: string; highlight: string }> = [];

  const cfo = byRole["CFO/DAF"];
  if (cfo && cfo.avgReturn90d != null && cfo.count >= 5) {
    insights.push({
      icon: "TrendingUp",
      title: "Signal CFO/DAF — rare et puissant",
      text: `Les achats de Directeurs Financiers sont le signal le plus prédictif : rendement moyen de +${cfo.avgReturn90d.toFixed(1)}% à T+90, +${cfo.avgReturn365d?.toFixed(1) ?? "—"}% à T+365 avec ${cfo.winRate365d?.toFixed(0)}% de succès sur 1 an.`,
      highlight: `+${cfo.avgReturn365d?.toFixed(1) ?? cfo.avgReturn90d.toFixed(1)}%/an`,
    });
  }

  const deepCluster = byBehavior["Deep cluster (3+)"];
  if (deepCluster && deepCluster.avgReturn90d != null && deepCluster.count >= 3) {
    insights.push({
      icon: "Users",
      title: "3 insiders simultanés — signal de conviction",
      text: `Quand 3+ dirigeants achètent la même société en 30 jours : +${deepCluster.avgReturn90d.toFixed(1)}% T+90, ${deepCluster.winRate90d?.toFixed(0)}% de succès. Le rendement grimpe à +${deepCluster.avgReturn365d?.toFixed(1) ?? "—"}% sur 1 an.`,
      highlight: `${deepCluster.count} occurrences`,
    });
  }

  const q2 = bySeason["Mar-Mai"];
  if (q2 && q2.avgReturn90d != null) {
    insights.push({
      icon: "Calendar",
      title: "Saisonnalité — Mars-Mai, la meilleure fenêtre",
      text: `Les achats d'initiés en Mars-Mai génèrent +${q2.avgReturn90d.toFixed(1)}% à T+90 vs ${bySeason["Jan-Fév"]?.avgReturn90d?.toFixed(1) ?? "—"}% en Jan-Fév. Coïncide avec la publication des résultats annuels.`,
      highlight: "Q2 = peak",
    });
  }

  const bigMcap = rows.filter((r) => (r.declaration.pctOfMarketCap ?? 0) >= 2);
  if (bigMcap.length >= 3) {
    const g = aggregateGroup(bigMcap);
    insights.push({
      icon: "Target",
      title: ">2% de la capitalisation — conviction extrême",
      text: `Ces trades représentent un signal de conviction maximale de la part du dirigeant : +${g.avgReturn90d?.toFixed(1) ?? "—"}% T+90, +${g.avgReturn365d?.toFixed(1) ?? "—"}% T+365, ${g.winRate365d?.toFixed(0) ?? "—"}% de réussite.`,
      highlight: `${g.count} trades`,
    });
  }

  const mid = bySize["Mid"];
  const small = bySize["Small"];
  if (mid && small) {
    insights.push({
      icon: "Building2",
      title: "Small & Mid-cap — le meilleur terrain",
      text: `Les insiders de mid-cap génèrent +${mid.avgReturn365d?.toFixed(1) ?? "—"}% sur 1 an vs +${bySize["Large"]?.avgReturn365d?.toFixed(1) ?? "—"}% sur Large-cap. Moins de couverture analytique = alpha plus accessible.`,
      highlight: "Mid > Large",
    });
  }

  const cascade = byBehavior["Cascade (4+ insiders)"];
  if (cascade && cascade.count >= 3) {
    insights.push({
      icon: "Layers",
      title: "Cascade 4+ insiders — conviction collective",
      text: `Lorsque 4 dirigeants ou plus achètent simultanément, le rendement à 1 an est de +${cascade.avgReturn365d?.toFixed(1) ?? "—"}% avec ${cascade.winRate365d?.toFixed(0) ?? "—"}% de taux de succès (${cascade.count} cas historiques).`,
      highlight: `${cascade.count} cas`,
    });
  }

  // ── Gender analysis ──────────────────────────────────────────────────────
  // Use insiderId-linked gender OR infer from insiderFunction (feminine morphology)

  function getGender(r: (typeof rows)[0]): "M" | "F" | null {
    // Prefer the stored gender on the Insider record
    const stored = r.declaration.insider?.gender as "M" | "F" | null | undefined;
    if (stored) return stored;
    // Fallback: feminine function morphology
    const fn = r.declaration.insiderFunction ?? "";
    if (/administratrice|directrice|présidente|presidente|gérante|gerante|représentante|dirigeante/i.test(fn)) return "F";
    return null;
  }

  const maleRows   = buyRows.filter((r) => getGender(r) === "M");
  const femaleRows = buyRows.filter((r) => getGender(r) === "F");
  const maleStats  = aggregateGroup(maleRows);
  const femaleStats = aggregateGroup(femaleRows);

  const byGender = {
    M: { ...maleStats,  count: maleRows.length,  label: "Hommes" },
    F: { ...femaleStats, count: femaleRows.length, label: "Femmes" },
    unknown: {
      ...aggregateGroup(buyRows.filter(r => !getGender(r))),
      count: buyRows.filter(r => !getGender(r)).length,
      label: "Non déterminé",
    },
  };

  // Gender insight
  if (maleRows.length >= 10 && femaleRows.length >= 5) {
    const fAvg = femaleStats.avgReturn365d;
    const mAvg = maleStats.avgReturn365d;
    if (fAvg != null && mAvg != null) {
      const diff = fAvg - mAvg;
      insights.push({
        icon: diff > 0 ? "TrendingUp" : "TrendingDown",
        title: diff > 0
          ? "Femmes dirigeantes — signal plus fort"
          : "Signal homme vs femme — analyse comparative",
        text: `Sur ${femaleRows.length} achats de femmes dirigeantes vs ${maleRows.length} d'hommes : F→+${fAvg.toFixed(1)}% vs M→+${mAvg.toFixed(1)}% à T+365. Win rate F:${femaleStats.winRate365d?.toFixed(0) ?? "—"}% vs M:${maleStats.winRate365d?.toFixed(0) ?? "—"}%.`,
        highlight: `${diff > 0 ? "F" : "M"} +${Math.abs(diff).toFixed(1)}%`,
      });
    }
  }

  return NextResponse.json(
    {
      total: rows.length,
      totalBuys: buyRows.length,
      totalSells: sellRows.length,
      overall,
      overallBuys,
      sellStats,
      byGender,
      byScore,
      byRole,
      bySize,
      byMcapPct,
      byAmount,
      bySeason,
      byYear,
      byClusterDepth,
      byBehavior,
      signalCombos,
      scatter,
      topTrades,
      insights,
    },
    { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=300" } }
  );
}
