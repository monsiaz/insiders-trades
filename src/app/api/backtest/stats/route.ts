/**
 * GET /api/backtest/stats
 * Returns aggregated backtest statistics. Cached 1h.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stddev(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const mean = avg(nums)!;
  const variance = nums.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / nums.length;
  return Math.sqrt(variance);
}

function winRate(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return (nums.filter((n) => n > 0).length / nums.length) * 100;
}

interface GroupStats {
  count: number;
  avgReturn30d: number | null;
  avgReturn60d: number | null;
  avgReturn90d: number | null;
  avgReturn180d: number | null;
  winRate90d: number | null;
  medianReturn90d: number | null;
  stddevReturn90d: number | null;
  best90d: number | null;
  worst90d: number | null;
}

function aggregateGroup(
  rows: Array<{ return30d: number | null; return60d: number | null; return90d: number | null; return180d: number | null }>
): GroupStats {
  const r30 = rows.map((r) => r.return30d).filter((v): v is number => v != null);
  const r60 = rows.map((r) => r.return60d).filter((v): v is number => v != null);
  const r90 = rows.map((r) => r.return90d).filter((v): v is number => v != null);
  const r180 = rows.map((r) => r.return180d).filter((v): v is number => v != null);

  return {
    count: rows.length,
    avgReturn30d: avg(r30),
    avgReturn60d: avg(r60),
    avgReturn90d: avg(r90),
    avgReturn180d: avg(r180),
    winRate90d: winRate(r90),
    medianReturn90d: median(r90),
    stddevReturn90d: stddev(r90),
    best90d: r90.length > 0 ? Math.max(...r90) : null,
    worst90d: r90.length > 0 ? Math.min(...r90) : null,
  };
}

function scoreLabel(score: number | null): string {
  if (score == null) return "Unknown";
  if (score < 30) return "0-30";
  if (score < 50) return "30-50";
  if (score < 70) return "50-70";
  return "70-100";
}

function functionLabel(fn: string | null): string {
  if (!fn) return "Autre";
  const f = fn.toLowerCase();
  if (f.includes("président") || f.includes("directeur général") || f.includes("ceo") || f.includes("pdg")) return "CEO/DG";
  if (f.includes("directeur financier") || f.includes("daf") || f.includes("cfo") || f.includes("chief financial")) return "CFO/DAF";
  if (f.includes("administrateur") || f.includes("conseil") || f.includes("board")) return "Board/CA";
  return "Autre";
}

function mcapLabel(pct: number | null): string {
  if (pct == null) return "Unknown";
  if (pct < 0.01) return "<0.01%";
  if (pct < 0.1) return "0.01-0.1%";
  if (pct < 1) return "0.1-1%";
  return ">1%";
}

export async function GET() {
  // Fetch all backtest results with related declaration data
  const results = await prisma.backtestResult.findMany({
    select: {
      return30d: true,
      return60d: true,
      return90d: true,
      return180d: true,
      declaration: {
        select: {
          signalScore: true,
          insiderFunction: true,
          transactionNature: true,
          isCluster: true,
          pctOfMarketCap: true,
          transactionDate: true,
          totalAmount: true,
          insiderName: true,
          company: { select: { name: true, slug: true } },
        },
      },
    },
  });

  if (results.length === 0) {
    return NextResponse.json(
      { total: 0, byScoreBucket: {}, byFunction: {}, byYear: {}, byCluster: {}, byMcapBucket: {}, topTrades: [], insights: [] },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } }
    );
  }

  // Overall stats
  const r90all = results.map((r) => r.return90d).filter((v): v is number => v != null);
  const overall: GroupStats = aggregateGroup(results);

  // By score bucket
  const scoreBuckets = new Map<string, typeof results>();
  for (const r of results) {
    const label = scoreLabel(r.declaration.signalScore);
    if (!scoreBuckets.has(label)) scoreBuckets.set(label, []);
    scoreBuckets.get(label)!.push(r);
  }
  const byScoreBucket: Record<string, GroupStats> = {};
  for (const [label, rows] of scoreBuckets) {
    byScoreBucket[label] = aggregateGroup(rows);
  }

  // By insider function
  const fnBuckets = new Map<string, typeof results>();
  for (const r of results) {
    const label = functionLabel(r.declaration.insiderFunction);
    if (!fnBuckets.has(label)) fnBuckets.set(label, []);
    fnBuckets.get(label)!.push(r);
  }
  const byFunction: Record<string, GroupStats> = {};
  for (const [label, rows] of fnBuckets) {
    byFunction[label] = aggregateGroup(rows);
  }

  // By year
  const yearBuckets = new Map<string, typeof results>();
  for (const r of results) {
    const year = r.declaration.transactionDate
      ? String(new Date(r.declaration.transactionDate).getFullYear())
      : "Unknown";
    if (!yearBuckets.has(year)) yearBuckets.set(year, []);
    yearBuckets.get(year)!.push(r);
  }
  const byYear: Record<string, GroupStats> = {};
  for (const [year, rows] of yearBuckets) {
    byYear[year] = aggregateGroup(rows);
  }

  // By cluster
  const clusterBuckets = new Map<string, typeof results>();
  for (const r of results) {
    const label = r.declaration.isCluster ? "Cluster" : "Isolé";
    if (!clusterBuckets.has(label)) clusterBuckets.set(label, []);
    clusterBuckets.get(label)!.push(r);
  }
  const byCluster: Record<string, GroupStats> = {};
  for (const [label, rows] of clusterBuckets) {
    byCluster[label] = aggregateGroup(rows);
  }

  // By mcap bucket
  const mcapBuckets = new Map<string, typeof results>();
  for (const r of results) {
    const label = mcapLabel(r.declaration.pctOfMarketCap);
    if (!mcapBuckets.has(label)) mcapBuckets.set(label, []);
    mcapBuckets.get(label)!.push(r);
  }
  const byMcapBucket: Record<string, GroupStats> = {};
  for (const [label, rows] of mcapBuckets) {
    byMcapBucket[label] = aggregateGroup(rows);
  }

  // Scatter data (score vs return90d), capped at 500 points
  const scatter = results
    .filter((r) => r.return90d != null && r.declaration.signalScore != null)
    .slice(0, 500)
    .map((r) => ({
      score: r.declaration.signalScore!,
      return90d: r.return90d!,
      company: r.declaration.company.name,
    }));

  // Top 20 best trades by return90d
  const topTrades = results
    .filter((r) => r.return90d != null)
    .sort((a, b) => (b.return90d ?? 0) - (a.return90d ?? 0))
    .slice(0, 20)
    .map((r) => ({
      company: r.declaration.company,
      insiderName: r.declaration.insiderName,
      insiderFunction: r.declaration.insiderFunction,
      totalAmount: r.declaration.totalAmount,
      signalScore: r.declaration.signalScore,
      transactionDate: r.declaration.transactionDate?.toISOString() ?? null,
      return30d: r.return30d,
      return60d: r.return60d,
      return90d: r.return90d,
      return180d: r.return180d,
    }));

  // Generate insights
  const insights: string[] = [];

  const ceoStats = byFunction["CEO/DG"];
  const ceoHighScore = results.filter(
    (r) => functionLabel(r.declaration.insiderFunction) === "CEO/DG" && (r.declaration.signalScore ?? 0) >= 70
  );
  if (ceoHighScore.length > 5) {
    const g = aggregateGroup(ceoHighScore);
    if (g.avgReturn90d != null) {
      const sign = g.avgReturn90d >= 0 ? "+" : "";
      insights.push(
        `Les achats de PDG/DG avec score ≥70 ont généré un rendement moyen de ${sign}${g.avgReturn90d.toFixed(1)}% à 90j (${ceoHighScore.length} trades)`
      );
    }
  } else if (ceoStats && ceoStats.avgReturn90d != null) {
    const sign = ceoStats.avgReturn90d >= 0 ? "+" : "";
    insights.push(
      `Les achats de PDG/DG ont généré un rendement moyen de ${sign}${ceoStats.avgReturn90d.toFixed(1)}% à 90j (${ceoStats.count} trades)`
    );
  }

  const cluster = byCluster["Cluster"];
  const isolé = byCluster["Isolé"];
  if (cluster && isolé && cluster.avgReturn90d != null && isolé.avgReturn90d != null) {
    const diff = cluster.avgReturn90d - isolé.avgReturn90d;
    const sign = diff >= 0 ? "+" : "";
    insights.push(
      `Les achats en cluster (plusieurs dirigeants) ${diff >= 0 ? "sur" : "sous"}performent de ${sign}${diff.toFixed(1)}% vs les achats isolés à 90j`
    );
  }

  const bigMcap = byMcapBucket[">1%"] ?? byMcapBucket["0.1-1%"];
  if (bigMcap && bigMcap.winRate90d != null) {
    const label = byMcapBucket[">1%"] ? ">1%" : ">0.1%";
    insights.push(
      `Les achats représentant ${label} de la capitalisation ont un taux de réussite de ${bigMcap.winRate90d.toFixed(0)}% à 90j (${bigMcap.count} trades)`
    );
  }

  const high = byScoreBucket["70-100"];
  const low = byScoreBucket["0-30"];
  if (high && low && high.avgReturn90d != null && low.avgReturn90d != null) {
    insights.push(
      `Score 70-100 : rendement moyen ${high.avgReturn90d >= 0 ? "+" : ""}${high.avgReturn90d.toFixed(1)}% à 90j vs ${low.avgReturn90d >= 0 ? "+" : ""}${low.avgReturn90d.toFixed(1)}% pour score 0-30`
    );
  }

  if (overall.winRate90d != null) {
    insights.push(
      `Taux de réussite global : ${overall.winRate90d.toFixed(0)}% des achats sont positifs à 90j sur ${results.length} trades backtestés`
    );
  }

  return NextResponse.json(
    {
      total: results.length,
      overall,
      byScoreBucket,
      byFunction,
      byYear,
      byCluster,
      byMcapBucket,
      scatter,
      topTrades,
      insights,
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } }
  );
}
