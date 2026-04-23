/**
 * Local preview of the daily digest HTML.
 *   npx tsx scripts/preview-digest.ts > /tmp/digest.html && open /tmp/digest.html
 */
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { renderDailyDigest, type PortfolioAlert } from "../src/lib/email";
import type { RecoItem } from "../src/lib/recommendation-engine";

const prisma = new PrismaClient();

(async () => {
  // Fake some realistic recos for preview (no Next.js cache available in CLI)
  const sampleReco = (over: Partial<RecoItem>): RecoItem => ({
    declarationId: "demo-" + Math.random(),
    action: "BUY",
    company: { name: "ABEO", slug: "abeo", yahooSymbol: "ABEO.PA", logoUrl: null },
    insider: { name: "Olivier ESTEVES", slug: null, function: "Président-Directeur Général", role: "PDG/DG" },
    totalAmount: 3_300_000,
    pctOfMarketCap: 4.73,
    signalScore: 55,
    pubDate: new Date().toISOString(),
    transactionDate: new Date().toISOString(),
    isin: "FR0013185857",
    isCluster: false,
    amfLink: "https://bdif.amf-france.org",
    recoScore: 72,
    scoreBreakdown: { signalPts: 16, winRatePts: 17, returnPts: 15, recencyPts: 14, convictionPts: 10 },
    expectedReturn90d: 12.4,
    historicalWinRate90d: 62,
    historicalAvgReturn365d: 18.1,
    sampleSize: 885,
    marketCap: 70_000_000,
    size: "Small",
    analystReco: "buy",
    targetMean: 11.2,
    currentPrice: 8.08,
    badges: ["Cluster", "PDG/DG", ">2% mcap", "Qualité"],
    ...over,
  });

  const topBuys: RecoItem[] = [
    sampleReco({ company: { name: "ABEO", slug: "abeo", yahooSymbol: "ABEO.PA", logoUrl: null }, recoScore: 78, expectedReturn90d: 14.2, badges: ["Cluster", "PDG/DG", ">1M€", "Value"] }),
    sampleReco({ company: { name: "BALYO", slug: "balyo", yahooSymbol: "BALYO.PA", logoUrl: null }, insider: { name: "SILVER BANDS 4 (US) CORP.", function: "Actionnaire majoritaire", role: "Actionnaire" }, recoScore: 66, expectedReturn90d: 8.6, badges: ["Cluster", "Small-cap", ">0.5% mcap"] }),
    sampleReco({ company: { name: "LAURENT-PERRIER", slug: "laurent-perrier", yahooSymbol: "LPE.PA", logoUrl: null }, insider: { name: "STEPHANE DALYAC", function: "Directeur Général", role: "PDG/DG" }, recoScore: 61, expectedReturn90d: 9.6, badges: ["PDG/DG", ">200k€", "Qualité"] }),
  ];

  const topSells: RecoItem[] = [
    sampleReco({
      action: "SELL",
      company: { name: "TELEPERFORMANCE", slug: "teleperformance", yahooSymbol: "TEP.PA", logoUrl: null },
      insider: { name: "Moulay Hafid Elalamy", function: "Membre du Conseil", role: "CA/Board" },
      totalAmount: 186_700_000,
      pctOfMarketCap: 5.19,
      recoScore: 69,
      expectedReturn90d: -18.5,
      historicalWinRate90d: 83,
      badges: ["CA/Board", ">1M€", ">2% mcap"],
    }),
    sampleReco({
      action: "SELL",
      company: { name: "GETLINK SE", slug: "getlink-se", yahooSymbol: "GET.PA", logoUrl: null },
      insider: { name: "Getlink SE", function: "Conseil d'Administration", role: "CA/Board" },
      totalAmount: 166_700_000,
      recoScore: 56,
      expectedReturn90d: -31.1,
      historicalWinRate90d: 89,
      badges: ["Cluster", "Score ≥65", ">0.5% mcap"],
    }),
  ];

  // Fake some portfolio alerts to preview the full layout
  const portfolioAlerts: PortfolioAlert[] = [
    {
      action: "SELL",
      company: { name: "SANOFI", slug: "sanofi" },
      insider: { name: "Paul Hudson", role: "PDG/DG" },
      amount: 2_800_000,
      pctOfMarketCap: 0.12,
      signalScore: 68,
      userPosition: { quantity: 80, pnlPct: 12.4 },
      pubDate: new Date().toISOString(),
      amfLink: "https://bdif.amf-france.org",
    },
    {
      action: "BUY",
      company: { name: "DASSAULT SYSTÈMES", slug: "dassault-systemes" },
      insider: { name: "Pascal Daloz", role: "CFO/DAF" },
      amount: 450_000,
      pctOfMarketCap: 0.03,
      signalScore: 58,
      userPosition: { quantity: 200, pnlPct: -3.5 },
      pubDate: new Date().toISOString(),
      amfLink: "https://bdif.amf-france.org",
    },
  ];

  const { subject, html } = renderDailyDigest({
    to: "preview@example.com",
    firstName: "Simon",
    portfolioAlerts,
    buyRecos: topBuys,
    sellRecos: topSells,
  });

  console.log("SUBJECT:", subject);
  fs.writeFileSync("/tmp/digest-preview.html", html);
  console.log("HTML size:", html.length, "bytes");
  console.log("→ open /tmp/digest-preview.html");

  await prisma.$disconnect();
})();
