/**
 * MCP tool execution. Each function returns a plain JSON-serializable object.
 * The JSON-RPC handler wraps the result in { content: [{ type: "text", text: JSON.stringify(...) }] }.
 *
 * Every tool is READ-ONLY. BigInt values are converted to Number for JSON.
 */

import { prisma } from "../prisma";
import type { Prisma } from "@prisma/client";
import {
  getWinningStrategySignals,
  STRATEGY_PROOF,
  WINNING_STRATEGY,
} from "../winning-strategy";

const clamp = (n: number, min: number, max: number) =>
  Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : min;

const bigintToNum = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));
};

const toolCtx = (startedAt: number, extra?: Record<string, unknown>) => ({
  latencyMs: Date.now() - startedAt,
  generatedAt: new Date().toISOString(),
  ...extra,
});

// ═══════════════════════════════════════════════════════════════════════════════
// DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

export async function search_companies(args: { query: string; limit?: number }) {
  const t0 = Date.now();
  const query = String(args.query ?? "").trim();
  const limit = clamp(Number(args.limit ?? 10), 1, 50);
  if (query.length < 2) return { results: [], meta: toolCtx(t0, { error: "query too short (min 2 chars)" }) };

  const rows = await prisma.company.findMany({
    where: {
      OR: [
        { name:        { contains: query, mode: "insensitive" } },
        { slug:        { contains: query.toLowerCase() } },
        { yahooSymbol: { contains: query, mode: "insensitive" } },
        { isin:        { contains: query, mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: [{ marketCap: "desc" }, { name: "asc" }],
    select: {
      name: true, slug: true, isin: true, yahooSymbol: true, market: true,
      marketCap: true, currentPrice: true,
      logoUrl: true,
      _count: { select: { declarations: true } },
    },
  });

  return bigintToNum({
    count: rows.length,
    results: rows.map((c) => ({
      name: c.name,
      slug: c.slug,
      isin: c.isin,
      yahooSymbol: c.yahooSymbol,
      market: c.market,
      marketCapEur: c.marketCap,
      currentPrice: c.currentPrice,
      logoUrl: c.logoUrl,
      declarationsCount: c._count.declarations,
    })),
    meta: toolCtx(t0),
  });
}

export async function search_insiders(args: { query: string; limit?: number }) {
  const t0 = Date.now();
  const query = String(args.query ?? "").trim();
  const limit = clamp(Number(args.limit ?? 10), 1, 50);
  if (query.length < 2) return { results: [], meta: toolCtx(t0, { error: "query too short (min 2 chars)" }) };

  const rows = await prisma.insider.findMany({
    where: {
      name: { contains: query, mode: "insensitive", not: { contains: "PERSONNE ETROITEMENT" } },
    },
    take: limit,
    orderBy: { name: "asc" },
    select: {
      name: true, slug: true, gender: true,
      _count: { select: { declarations: true, companies: true } },
    },
  });

  return {
    count: rows.length,
    results: rows.map((i) => ({
      name: i.name,
      slug: i.slug,
      gender: i.gender,
      declarationsCount: i._count.declarations,
      companiesCount: i._count.companies,
    })),
    meta: toolCtx(t0),
  };
}

export async function search_declarations(args: Record<string, unknown>) {
  const t0 = Date.now();
  const where: Prisma.DeclarationWhereInput = { type: "DIRIGEANTS", pdfParsed: true };

  if (args.from) where.pubDate = { ...(where.pubDate as object ?? {}), gte: new Date(String(args.from)) };
  if (args.to)   where.pubDate = { ...(where.pubDate as object ?? {}), lte: new Date(String(args.to)) };
  if (args.minScore != null) where.signalScore = { ...(where.signalScore as object ?? {}), gte: Number(args.minScore) };
  if (args.maxScore != null) where.signalScore = { ...(where.signalScore as object ?? {}), lte: Number(args.maxScore) };
  if (String(args.direction).toUpperCase() === "BUY")  where.transactionNature = { contains: "Acquisition", mode: "insensitive" };
  if (String(args.direction).toUpperCase() === "SELL") where.transactionNature = { contains: "Cession",     mode: "insensitive" };
  if (args.cluster === true)  where.isCluster = true;
  if (args.cluster === false) where.isCluster = false;
  if (args.minAmount != null) where.totalAmount = { gte: Number(args.minAmount) };
  if (args.isin)    where.isin = String(args.isin);
  if (args.company) where.company = { name: { contains: String(args.company), mode: "insensitive" } };
  if (args.insider) where.insiderName = { contains: String(args.insider), mode: "insensitive" };

  const sortField = ["pubDate", "signalScore", "amount"].includes(String(args.sort)) ? String(args.sort) : "pubDate";
  const sortKey = sortField === "amount" ? "totalAmount" : sortField;
  const order = args.order === "asc" ? "asc" : "desc";
  const limit = clamp(Number(args.limit ?? 20), 1, 200);
  const offset = Math.max(0, Number(args.offset ?? 0));

  const [total, rows] = await Promise.all([
    prisma.declaration.count({ where }),
    prisma.declaration.findMany({
      where,
      orderBy: { [sortKey]: order } as Prisma.DeclarationOrderByWithRelationInput,
      take: limit,
      skip: offset,
      select: {
        amfId: true, pubDate: true, transactionDate: true,
        transactionNature: true, insiderName: true, insiderFunction: true,
        isin: true, unitPrice: true, volume: true, totalAmount: true, currency: true,
        pctOfMarketCap: true, signalScore: true, isCluster: true,
        company: { select: { name: true, slug: true, yahooSymbol: true } },
      },
    }),
  ]);

  return {
    total, offset, limit,
    count: rows.length,
    results: rows.map((d) => ({
      amfId: d.amfId,
      pubDate: d.pubDate.toISOString(),
      transactionDate: d.transactionDate?.toISOString() ?? null,
      company: d.company,
      insider: { name: d.insiderName, role: d.insiderFunction },
      transaction: {
        nature: d.transactionNature,
        isin: d.isin,
        unitPrice: d.unitPrice,
        volume: d.volume,
        amount: d.totalAmount,
        currency: d.currency,
      },
      signal: {
        score: d.signalScore,
        pctOfMarketCap: d.pctOfMarketCap,
        isCluster: d.isCluster,
      },
    })),
    meta: toolCtx(t0),
  };
}

export async function search_global(args: { query: string; limit?: number }) {
  const t0 = Date.now();
  const query = String(args.query ?? "").trim();
  const limit = clamp(Number(args.limit ?? 8), 1, 25);
  if (query.length < 2) return { companies: [], insiders: [], meta: toolCtx(t0, { error: "query too short" }) };

  const [cos, ins] = await Promise.all([
    prisma.company.findMany({
      where: {
        OR: [
          { name:        { contains: query, mode: "insensitive" } },
          { yahooSymbol: { contains: query, mode: "insensitive" } },
          { isin:        { contains: query, mode: "insensitive" } },
        ],
      },
      take: limit, orderBy: { marketCap: "desc" },
      select: { name: true, slug: true, yahooSymbol: true, isin: true, marketCap: true, _count: { select: { declarations: true } } },
    }),
    prisma.insider.findMany({
      where: { name: { contains: query, mode: "insensitive", not: { contains: "PERSONNE ETROITEMENT" } } },
      take: limit, orderBy: { name: "asc" },
      select: { name: true, slug: true, _count: { select: { declarations: true } } },
    }),
  ]);

  return bigintToNum({
    query,
    companies: cos.map((c) => ({ ...c, marketCapEur: c.marketCap, declarationsCount: c._count.declarations })),
    insiders: ins.map((i) => ({ name: i.name, slug: i.slug, declarationsCount: i._count.declarations })),
    meta: toolCtx(t0),
  });
}

export async function search_top_signals(args: { direction?: string; lookbackDays?: number; minScore?: number; limit?: number }) {
  const t0 = Date.now();
  const direction = String(args.direction ?? "BUY").toUpperCase();
  const lookbackDays = clamp(Number(args.lookbackDays ?? 7), 1, 90);
  const minScore = clamp(Number(args.minScore ?? 40), 0, 100);
  const limit = clamp(Number(args.limit ?? 10), 1, 50);
  const since = new Date(Date.now() - lookbackDays * 86400_000);

  const whereDir = direction === "SELL"
    ? { transactionNature: { contains: "Cession", mode: "insensitive" as const } }
    : { transactionNature: { contains: "Acquisition", mode: "insensitive" as const } };

  const rows = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS", pdfParsed: true,
      pubDate: { gte: since },
      signalScore: { gte: minScore },
      ...whereDir,
    },
    orderBy: { signalScore: "desc" },
    take: limit,
    select: {
      amfId: true, pubDate: true,
      transactionNature: true, insiderName: true, insiderFunction: true,
      totalAmount: true, pctOfMarketCap: true,
      signalScore: true, isCluster: true,
      company: { select: { name: true, slug: true, yahooSymbol: true, marketCap: true, currentPrice: true } },
    },
  });

  return bigintToNum({
    direction, lookbackDays, minScore, count: rows.length,
    results: rows.map((d) => ({
      amfId: d.amfId,
      pubDate: d.pubDate.toISOString(),
      company: { ...d.company, marketCapEur: d.company.marketCap },
      insider: { name: d.insiderName, role: d.insiderFunction },
      transaction: { nature: d.transactionNature, amount: d.totalAmount },
      signal: { score: d.signalScore, pctOfMarketCap: d.pctOfMarketCap, isCluster: d.isCluster },
    })),
    meta: toolCtx(t0),
  });
}

export async function get_winning_strategy_signals(args: Record<string, unknown>) {
  const t0 = Date.now();
  const lookbackDays = clamp(Number(args.lookbackDays ?? 90), 1, 365);
  const limit = clamp(Number(args.limit ?? 20), 1, 50);

  const signals = await getWinningStrategySignals({ lookbackDays, limit });

  return {
    strategy: {
      name: "Sigma Winning Strategy v1",
      description: "Bat le CAC 40 chaque année 2022-2025. 6 filtres combinés.",
      criteria: WINNING_STRATEGY,
      historicalProof: STRATEGY_PROOF,
    },
    filters: { lookbackDays, limit },
    count: signals.length,
    signals,
    meta: toolCtx(t0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENRICHMENT
// ═══════════════════════════════════════════════════════════════════════════════

export async function get_company(args: { slug: string }) {
  const t0 = Date.now();
  const c = await prisma.company.findUnique({
    where: { slug: String(args.slug) },
    select: {
      name: true, slug: true, isin: true, market: true, description: true, yahooSymbol: true,
      marketCap: true, sharesOut: true, revenue: true, ebitda: true, netIncome: true,
      totalDebt: true, freeCashFlow: true, dilutedEps: true, fiscalYearEnd: true,
      trailingPE: true, forwardPE: true, priceToBook: true, beta: true, debtToEquity: true,
      returnOnEquity: true, returnOnAssets: true, profitMargin: true,
      heldByInsiders: true, heldByInstitutions: true, shortRatio: true,
      analystReco: true, analystScore: true, targetMean: true, targetHigh: true, targetLow: true, numAnalysts: true,
      currentPrice: true, fiftyTwoWeekHigh: true, fiftyTwoWeekLow: true,
      fiftyDayAverage: true, twoHundredDayAverage: true, dividendYield: true,
      logoUrl: true,
      priceAt: true, financialsAt: true, analystAt: true,
      _count: { select: { declarations: true, insiders: true } },
    },
  });

  if (!c) return { error: `Company '${args.slug}' not found`, meta: toolCtx(t0) };

  return bigintToNum({
    ...c,
    marketCap:   c.marketCap,
    sharesOut:   c.sharesOut,
    revenue:     c.revenue,
    ebitda:      c.ebitda,
    netIncome:   c.netIncome,
    totalDebt:   c.totalDebt,
    freeCashFlow: c.freeCashFlow,
    declarationsCount: c._count.declarations,
    insidersCount: c._count.insiders,
    priceAt:    c.priceAt?.toISOString() ?? null,
    financialsAt: c.financialsAt?.toISOString() ?? null,
    analystAt:  c.analystAt?.toISOString() ?? null,
    meta: toolCtx(t0),
  });
}

export async function get_company_declarations(args: Record<string, unknown>) {
  const t0 = Date.now();
  const slug = String(args.slug);
  const limit = clamp(Number(args.limit ?? 30), 1, 200);
  const offset = Math.max(0, Number(args.offset ?? 0));
  const direction = String(args.direction ?? "").toUpperCase();
  const minScore = args.minScore != null ? Number(args.minScore) : null;

  const co = await prisma.company.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!co) return { error: `Company '${slug}' not found`, meta: toolCtx(t0) };

  const whereDir =
    direction === "BUY"  ? { transactionNature: { contains: "Acquisition", mode: "insensitive" as const } } :
    direction === "SELL" ? { transactionNature: { contains: "Cession",     mode: "insensitive" as const } } : {};
  const whereScore = minScore != null ? { signalScore: { gte: minScore } } : {};

  const [total, rows] = await Promise.all([
    prisma.declaration.count({ where: { companyId: co.id, type: "DIRIGEANTS", ...whereDir, ...whereScore } }),
    prisma.declaration.findMany({
      where: { companyId: co.id, type: "DIRIGEANTS", ...whereDir, ...whereScore },
      orderBy: { pubDate: "desc" },
      take: limit, skip: offset,
      select: {
        amfId: true, pubDate: true, transactionDate: true,
        transactionNature: true, insiderName: true, insiderFunction: true,
        isin: true, unitPrice: true, volume: true, totalAmount: true,
        pctOfMarketCap: true, signalScore: true, isCluster: true,
      },
    }),
  ]);

  return {
    company: { name: co.name, slug },
    total, offset, limit, count: rows.length,
    results: rows.map((d) => ({
      amfId: d.amfId,
      pubDate: d.pubDate.toISOString(),
      transactionDate: d.transactionDate?.toISOString() ?? null,
      insider: { name: d.insiderName, role: d.insiderFunction },
      transaction: { nature: d.transactionNature, isin: d.isin, unitPrice: d.unitPrice, volume: d.volume, amount: d.totalAmount },
      signal: { score: d.signalScore, pctOfMarketCap: d.pctOfMarketCap, isCluster: d.isCluster },
    })),
    meta: toolCtx(t0),
  };
}

export async function get_insider(args: { slug: string }) {
  const t0 = Date.now();
  const i = await prisma.insider.findUnique({
    where: { slug: String(args.slug) },
    select: {
      name: true, slug: true, gender: true, createdAt: true,
      companies: {
        select: { function: true, company: { select: { name: true, slug: true, yahooSymbol: true, marketCap: true } } },
      },
      _count: { select: { declarations: true } },
    },
  });
  if (!i) return { error: `Insider '${args.slug}' not found`, meta: toolCtx(t0) };

  const agg = await prisma.declaration.aggregate({
    where: { insider: { slug: String(args.slug) }, signalScore: { not: null } },
    _avg: { signalScore: true },
    _max: { signalScore: true },
    _min: { signalScore: true },
  });

  return bigintToNum({
    name: i.name, slug: i.slug, gender: i.gender,
    declarationsCount: i._count.declarations,
    companies: i.companies.map((c) => ({
      function: c.function,
      company: { ...c.company, marketCapEur: c.company.marketCap },
    })),
    stats: { avgScore: agg._avg.signalScore, maxScore: agg._max.signalScore, minScore: agg._min.signalScore },
    meta: toolCtx(t0),
  });
}

export async function get_insider_declarations(args: Record<string, unknown>) {
  const t0 = Date.now();
  const slug = String(args.slug);
  const limit = clamp(Number(args.limit ?? 30), 1, 200);
  const offset = Math.max(0, Number(args.offset ?? 0));

  const ins = await prisma.insider.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!ins) return { error: `Insider '${slug}' not found`, meta: toolCtx(t0) };

  const [total, rows] = await Promise.all([
    prisma.declaration.count({ where: { insiderId: ins.id, type: "DIRIGEANTS" } }),
    prisma.declaration.findMany({
      where: { insiderId: ins.id, type: "DIRIGEANTS" },
      orderBy: { pubDate: "desc" },
      take: limit, skip: offset,
      select: {
        amfId: true, pubDate: true, transactionDate: true,
        transactionNature: true, insiderFunction: true,
        isin: true, unitPrice: true, volume: true, totalAmount: true,
        pctOfMarketCap: true, signalScore: true, isCluster: true,
        company: { select: { name: true, slug: true, yahooSymbol: true } },
      },
    }),
  ]);

  return {
    insider: { name: ins.name, slug },
    total, offset, limit, count: rows.length,
    results: rows.map((d) => ({
      amfId: d.amfId,
      pubDate: d.pubDate.toISOString(),
      transactionDate: d.transactionDate?.toISOString() ?? null,
      company: d.company,
      insider: { role: d.insiderFunction },
      transaction: { nature: d.transactionNature, isin: d.isin, unitPrice: d.unitPrice, volume: d.volume, amount: d.totalAmount },
      signal: { score: d.signalScore, pctOfMarketCap: d.pctOfMarketCap, isCluster: d.isCluster },
    })),
    meta: toolCtx(t0),
  };
}

export async function get_declaration(args: { amfId: string }) {
  const t0 = Date.now();
  const d = await prisma.declaration.findUnique({
    where: { amfId: String(args.amfId) },
    select: {
      amfId: true, pubDate: true, transactionDate: true, link: true, description: true,
      transactionNature: true, instrumentType: true, isin: true,
      unitPrice: true, volume: true, totalAmount: true, currency: true, transactionVenue: true,
      insiderName: true, insiderFunction: true,
      pctOfMarketCap: true, pctOfInsiderFlow: true, insiderCumNet: true,
      signalScore: true, isCluster: true, scoredAt: true,
      company: { select: { name: true, slug: true, yahooSymbol: true, marketCap: true, currentPrice: true } },
      insider: { select: { name: true, slug: true } },
      backtestResult: {
        select: {
          direction: true, priceAtTrade: true,
          price30d: true, price60d: true, price90d: true, price160d: true, price365d: true, price730d: true,
          return30d: true, return60d: true, return90d: true, return160d: true, return365d: true, return730d: true,
          computedAt: true,
        },
      },
    },
  });
  if (!d) return { error: `Declaration '${args.amfId}' not found`, meta: toolCtx(t0) };

  return bigintToNum({
    amfId: d.amfId,
    pubDate: d.pubDate.toISOString(),
    transactionDate: d.transactionDate?.toISOString() ?? null,
    description: d.description,
    pdfUrl: d.link,
    company: { ...d.company, marketCapEur: d.company.marketCap },
    insider: { name: d.insiderName, slug: d.insider?.slug ?? null, role: d.insiderFunction },
    transaction: {
      nature: d.transactionNature, instrument: d.instrumentType, isin: d.isin,
      unitPrice: d.unitPrice, volume: d.volume, amount: d.totalAmount, currency: d.currency, venue: d.transactionVenue,
    },
    signal: {
      score: d.signalScore, pctOfMarketCap: d.pctOfMarketCap, pctOfInsiderFlow: d.pctOfInsiderFlow,
      insiderCumNet: d.insiderCumNet, isCluster: d.isCluster, scoredAt: d.scoredAt?.toISOString() ?? null,
    },
    backtest: d.backtestResult
      ? { ...d.backtestResult, computedAt: d.backtestResult.computedAt.toISOString() }
      : null,
    meta: toolCtx(t0),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

export async function get_site_stats() {
  const t0 = Date.now();
  const now = new Date();
  const [total, dirigeants, d24h, d7d, d30d, cos, cosEnriched, insiders, bts, avgScore] = await Promise.all([
    prisma.declaration.count(),
    prisma.declaration.count({ where: { type: "DIRIGEANTS" } }),
    prisma.declaration.count({ where: { pubDate: { gte: new Date(now.getTime() - 86400_000) } } }),
    prisma.declaration.count({ where: { pubDate: { gte: new Date(now.getTime() - 7 * 86400_000) } } }),
    prisma.declaration.count({ where: { pubDate: { gte: new Date(now.getTime() - 30 * 86400_000) } } }),
    prisma.company.count(),
    prisma.company.count({ where: { marketCap: { not: null } } }),
    prisma.insider.count(),
    prisma.backtestResult.count(),
    prisma.declaration.aggregate({ where: { signalScore: { not: null } }, _avg: { signalScore: true } }),
  ]);

  return {
    declarations: { total, typeDirigeants: dirigeants, last24h: d24h, last7d: d7d, last30d: d30d, avgSignalScore: avgScore._avg.signalScore },
    companies: { total: cos, enriched: cosEnriched, enrichedPct: Math.round((cosEnriched / Math.max(1, cos)) * 100) },
    insiders: { total: insiders },
    backtests: { total: bts },
    meta: toolCtx(t0),
  };
}

export async function get_system_health() {
  const t0 = Date.now();
  const [lastDecl, lastCreate, lastScore, lastBt, lastFin, lastPrice] = await Promise.all([
    prisma.declaration.findFirst({ where: { type: "DIRIGEANTS" }, orderBy: { pubDate: "desc" }, select: { pubDate: true } }),
    prisma.declaration.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.declaration.findFirst({ where: { scoredAt: { not: null } }, orderBy: { scoredAt: "desc" }, select: { scoredAt: true } }),
    prisma.backtestResult.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } }),
    prisma.company.findFirst({ where: { financialsAt: { not: null } }, orderBy: { financialsAt: "desc" }, select: { financialsAt: true } }),
    prisma.company.findFirst({ where: { priceAt: { not: null } }, orderBy: { priceAt: "desc" }, select: { priceAt: true } }),
  ]);
  const dbT0 = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const dbLatencyMs = Date.now() - dbT0;

  return {
    status: "ok",
    database: { reachable: true, latencyMs: dbLatencyMs },
    freshness: {
      lastAmfPublicationAt: lastDecl?.pubDate?.toISOString() ?? null,
      lastIngestAt: lastCreate?.createdAt?.toISOString() ?? null,
      lastScoringAt: lastScore?.scoredAt?.toISOString() ?? null,
      lastBacktestAt: lastBt?.computedAt?.toISOString() ?? null,
      lastFinancialsAt: lastFin?.financialsAt?.toISOString() ?? null,
      lastPriceAt: lastPrice?.priceAt?.toISOString() ?? null,
    },
    meta: toolCtx(t0),
  };
}

export async function get_backtest_stats(args: Record<string, unknown>) {
  const t0 = Date.now();
  const direction = String(args.direction ?? "").toUpperCase();
  const minScore = args.minScore != null ? Number(args.minScore) : null;

  const declWhere: Prisma.DeclarationWhereInput = { type: "DIRIGEANTS" };
  if (minScore != null) declWhere.signalScore = { gte: minScore };
  if (args.from)        declWhere.pubDate = { ...(declWhere.pubDate as object ?? {}), gte: new Date(String(args.from)) };
  if (args.to)          declWhere.pubDate = { ...(declWhere.pubDate as object ?? {}), lte: new Date(String(args.to)) };

  const where: Prisma.BacktestResultWhereInput = { declaration: declWhere };
  if (direction === "BUY" || direction === "SELL") where.direction = direction;

  const [total, agg, wins90Buy, buys90Total, wins90Sell, sells90Total] = await Promise.all([
    prisma.backtestResult.count({ where }),
    prisma.backtestResult.aggregate({
      where,
      _avg: { return30d: true, return60d: true, return90d: true, return160d: true, return365d: true, return730d: true },
      _count: { return30d: true, return60d: true, return90d: true, return160d: true, return365d: true, return730d: true },
    }),
    prisma.backtestResult.count({ where: { ...where, direction: "BUY",  return90d: { gt: 0 } } }),
    prisma.backtestResult.count({ where: { ...where, direction: "BUY",  return90d: { not: null } } }),
    prisma.backtestResult.count({ where: { ...where, direction: "SELL", return90d: { lt: 0 } } }),
    prisma.backtestResult.count({ where: { ...where, direction: "SELL", return90d: { not: null } } }),
  ]);

  return {
    filters: { direction: direction || "ALL", minScore, from: args.from, to: args.to },
    total,
    averageReturnsPct: {
      T30: agg._avg.return30d, T60: agg._avg.return60d, T90: agg._avg.return90d,
      T160: agg._avg.return160d, T365: agg._avg.return365d, T730: agg._avg.return730d,
    },
    sampleCounts: {
      T30: agg._count.return30d, T60: agg._count.return60d, T90: agg._count.return90d,
      T160: agg._count.return160d, T365: agg._count.return365d, T730: agg._count.return730d,
    },
    winRates90d: {
      BUY: buys90Total ? wins90Buy / buys90Total : null,
      SELL: sells90Total ? wins90Sell / sells90Total : null,
    },
    meta: toolCtx(t0),
  };
}

export async function get_account_usage(_args: Record<string, unknown>, ctx: { keyId: string }) {
  const t0 = Date.now();
  const k = await prisma.apiKey.findUnique({
    where: { id: ctx.keyId },
    select: {
      name: true, prefix: true, scopes: true,
      totalRequests: true, requestsToday: true,
      lastUsedAt: true, createdAt: true,
    },
  });
  if (!k) return { error: "Key not found (unexpected)", meta: toolCtx(t0) };
  return {
    name: k.name, prefix: k.prefix, scopes: k.scopes,
    totalRequests: k.totalRequests,
    requestsToday: k.requestsToday,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
    meta: toolCtx(t0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPOSITE
// ═══════════════════════════════════════════════════════════════════════════════

export async function get_company_full_profile(args: { slug: string }) {
  const t0 = Date.now();
  const slug = String(args.slug);
  const [identity, declResult] = await Promise.all([
    get_company({ slug }),
    get_company_declarations({ slug, limit: 10 }),
  ]);

  if ("error" in identity) return { error: identity.error, meta: toolCtx(t0) };

  const co = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
  const scoreAgg = co
    ? await prisma.declaration.aggregate({
        where: { companyId: co.id, signalScore: { not: null } },
        _avg: { signalScore: true }, _max: { signalScore: true }, _count: { _all: true },
      })
    : null;

  const btStats = co
    ? await prisma.backtestResult.aggregate({
        where: { declaration: { companyId: co.id } },
        _avg: { return90d: true, return365d: true },
        _count: { _all: true },
      })
    : null;

  return {
    identity,
    recentDeclarations: "results" in declResult ? declResult.results : [],
    signalStats: scoreAgg
      ? {
          avgScore: scoreAgg._avg.signalScore,
          maxScore: scoreAgg._max.signalScore,
          totalDeclarations: scoreAgg._count._all,
        }
      : null,
    backtestStats: btStats
      ? {
          count: btStats._count._all,
          avgReturn90dPct: btStats._avg.return90d,
          avgReturn365dPct: btStats._avg.return365d,
        }
      : null,
    meta: toolCtx(t0),
  };
}

export async function get_insider_activity_summary(args: { slug: string }) {
  const t0 = Date.now();
  const slug = String(args.slug);

  const insider = await prisma.insider.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, gender: true,
      companies: {
        select: {
          function: true,
          company: { select: { name: true, slug: true, yahooSymbol: true, marketCap: true } },
        },
      },
    },
  });
  if (!insider) return { error: `Insider '${slug}' not found`, meta: toolCtx(t0) };

  const [buys, sells, lastTrade, scoreAgg, amountSums] = await Promise.all([
    prisma.declaration.count({
      where: {
        insiderId: insider.id,
        transactionNature: { contains: "Acquisition", mode: "insensitive" },
      },
    }),
    prisma.declaration.count({
      where: {
        insiderId: insider.id,
        transactionNature: { contains: "Cession", mode: "insensitive" },
      },
    }),
    prisma.declaration.findFirst({
      where: { insiderId: insider.id },
      orderBy: { pubDate: "desc" },
      select: {
        amfId: true, pubDate: true, transactionNature: true, totalAmount: true,
        signalScore: true, company: { select: { name: true, slug: true } },
      },
    }),
    prisma.declaration.aggregate({
      where: { insiderId: insider.id, signalScore: { not: null } },
      _avg: { signalScore: true }, _max: { signalScore: true }, _min: { signalScore: true },
    }),
    prisma.declaration.groupBy({
      by: ["transactionNature"],
      where: { insiderId: insider.id, totalAmount: { not: null } },
      _sum: { totalAmount: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 5,
    }),
  ]);

  return bigintToNum({
    insider: { name: insider.name, slug: insider.slug, gender: insider.gender },
    companies: insider.companies.map((c) => ({
      function: c.function,
      company: { ...c.company, marketCapEur: c.company.marketCap },
    })),
    counts: { buys, sells, total: buys + sells },
    amountsByNature: amountSums.map((s) => ({ nature: s.transactionNature, totalAmount: s._sum.totalAmount })),
    scoreStats: { avg: scoreAgg._avg.signalScore, max: scoreAgg._max.signalScore, min: scoreAgg._min.signalScore },
    lastTrade: lastTrade
      ? { ...lastTrade, pubDate: lastTrade.pubDate.toISOString() }
      : null,
    meta: toolCtx(t0),
  });
}

export async function compare_companies(args: { slugs: string[] }) {
  const t0 = Date.now();
  const slugs = Array.isArray(args.slugs) ? args.slugs.slice(0, 5) : [];
  if (slugs.length < 2) return { error: "Au moins 2 slugs requis", meta: toolCtx(t0) };

  const companies = await prisma.company.findMany({
    where: { slug: { in: slugs } },
    select: {
      name: true, slug: true, yahooSymbol: true,
      marketCap: true, currentPrice: true,
      trailingPE: true, forwardPE: true, priceToBook: true,
      profitMargin: true, returnOnEquity: true, debtToEquity: true,
      analystReco: true, analystScore: true, targetMean: true, numAnalysts: true,
      dividendYield: true,
      _count: { select: { declarations: true } },
    },
  });

  const since90 = new Date(Date.now() - 90 * 86400_000);
  const insiderActivity = await Promise.all(
    companies.map((c) =>
      prisma.declaration.aggregate({
        where: { company: { slug: c.slug }, pubDate: { gte: since90 } },
        _count: { _all: true },
        _avg: { signalScore: true },
        _sum: { totalAmount: true },
      })
    )
  );

  return bigintToNum({
    companies: companies.map((c, i) => ({
      ...c,
      marketCapEur: c.marketCap,
      declarationsCount: c._count.declarations,
      activity90d: {
        count: insiderActivity[i]._count._all,
        avgScore: insiderActivity[i]._avg.signalScore,
        totalAmount: insiderActivity[i]._sum.totalAmount,
      },
    })),
    meta: toolCtx(t0),
  });
}

export async function find_clustered_trades(args: Record<string, unknown>) {
  const t0 = Date.now();
  const lookbackDays = clamp(Number(args.lookbackDays ?? 30), 7, 180);
  const minInsiders = clamp(Number(args.minInsiders ?? 2), 2, 10);
  const direction = String(args.direction ?? "").toUpperCase();
  const limit = clamp(Number(args.limit ?? 10), 1, 30);
  const since = new Date(Date.now() - lookbackDays * 86400_000);

  const whereDir =
    direction === "BUY"  ? { transactionNature: { contains: "Acquisition", mode: "insensitive" as const } } :
    direction === "SELL" ? { transactionNature: { contains: "Cession",     mode: "insensitive" as const } } : {};

  // Fetch decls in window, then group by companyId in JS (simpler + handles distinct insider count)
  const rawDecls = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      pubDate: { gte: since },
      ...whereDir,
      insiderName: { not: null },
    },
    select: { companyId: true, insiderName: true },
  });

  const insidersByCompany = new Map<string, Set<string>>();
  for (const d of rawDecls) {
    const n = d.insiderName!;
    if (!insidersByCompany.has(d.companyId)) insidersByCompany.set(d.companyId, new Set());
    insidersByCompany.get(d.companyId)!.add(n);
  }

  const companyIds = [...insidersByCompany.entries()]
    .filter(([, s]) => s.size >= minInsiders)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, limit)
    .map(([cid]) => cid);

  if (companyIds.length === 0) return { count: 0, results: [], meta: toolCtx(t0) };
  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: {
      id: true, name: true, slug: true, yahooSymbol: true, marketCap: true, logoUrl: true,
    },
  });
  const coById = new Map(companies.map((c) => [c.id, c]));

  // For each company, grab the actual decls in window + distinct insider count
  const detailed = await Promise.all(
    companyIds.map(async (cid) => {
      const co = coById.get(cid);
      if (!co) return null;
      const decls = await prisma.declaration.findMany({
        where: {
          companyId: cid, type: "DIRIGEANTS",
          pubDate: { gte: since },
          ...whereDir,
        },
        orderBy: { pubDate: "desc" },
        select: {
          amfId: true, pubDate: true, transactionNature: true,
          insiderName: true, insiderFunction: true, totalAmount: true, signalScore: true,
        },
      });
      const insiders = new Set(decls.map((d) => d.insiderName ?? "__"));
      const avgScore = decls.filter((d) => d.signalScore != null)
        .reduce((s, d, _, a) => s + (d.signalScore ?? 0) / a.length, 0);
      return {
        company: { ...co, marketCapEur: co.marketCap },
        distinctInsiders: insiders.size,
        tradeCount: decls.length,
        avgScore: avgScore || null,
        totalAmount: decls.reduce((s, d) => s + (d.totalAmount ?? 0), 0),
        trades: decls.slice(0, 5).map((d) => ({
          amfId: d.amfId,
          pubDate: d.pubDate.toISOString(),
          insider: d.insiderName,
          role: d.insiderFunction,
          nature: d.transactionNature,
          amount: d.totalAmount,
          score: d.signalScore,
        })),
      };
    })
  );

  const results = detailed.filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.distinctInsiders - a.distinctInsiders);

  return bigintToNum({
    lookbackDays, minInsiders, direction: direction || "ALL",
    count: results.length,
    results,
    meta: toolCtx(t0),
  });
}

export async function analyze_declaration(args: { amfId: string }) {
  const t0 = Date.now();
  const amfId = String(args.amfId);
  const detail = await get_declaration({ amfId });
  if ("error" in detail) return detail;

  // 5 other recent trades on the same company
  const co = await prisma.company.findUnique({ where: { slug: detail.company.slug }, select: { id: true } });
  const otherTrades = co
    ? await prisma.declaration.findMany({
        where: { companyId: co.id, amfId: { not: amfId }, type: "DIRIGEANTS" },
        orderBy: { pubDate: "desc" },
        take: 5,
        select: {
          amfId: true, pubDate: true, transactionNature: true,
          insiderName: true, totalAmount: true, signalScore: true,
        },
      })
    : [];

  return {
    declaration: detail,
    context: {
      otherRecentTradesOnSameCompany: otherTrades.map((t) => ({
        amfId: t.amfId, pubDate: t.pubDate.toISOString(),
        insider: t.insiderName, nature: t.transactionNature,
        amount: t.totalAmount, score: t.signalScore,
      })),
    },
    meta: toolCtx(t0),
  };
}

export async function watch_isins(args: Record<string, unknown>) {
  const t0 = Date.now();
  const isins = Array.isArray(args.isins) ? args.isins.slice(0, 50).map((s) => String(s)) : [];
  if (isins.length === 0) return { error: "isins[] is required", meta: toolCtx(t0) };

  const lookbackDays = clamp(Number(args.lookbackDays ?? 7), 1, 90);
  const minScore = args.minScore != null ? Number(args.minScore) : 30;
  const since = new Date(Date.now() - lookbackDays * 86400_000);

  const decls = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS", pdfParsed: true,
      isin: { in: isins },
      pubDate: { gte: since },
      signalScore: { gte: minScore },
    },
    orderBy: [{ signalScore: "desc" }, { pubDate: "desc" }],
    take: 50,
    select: {
      amfId: true, pubDate: true,
      transactionNature: true, insiderName: true, insiderFunction: true,
      isin: true, totalAmount: true, pctOfMarketCap: true, signalScore: true, isCluster: true,
      company: { select: { name: true, slug: true, yahooSymbol: true } },
    },
  });

  const byIsin: Record<string, unknown[]> = Object.fromEntries(isins.map((i) => [i, []]));
  for (const d of decls) {
    const k = d.isin ?? "__unknown";
    (byIsin[k] ??= []).push({
      amfId: d.amfId,
      pubDate: d.pubDate.toISOString(),
      company: d.company,
      insider: { name: d.insiderName, role: d.insiderFunction },
      transaction: { nature: d.transactionNature, amount: d.totalAmount },
      signal: { score: d.signalScore, pctOfMarketCap: d.pctOfMarketCap, isCluster: d.isCluster },
    });
  }

  return {
    lookbackDays, minScore, isinsMonitored: isins.length, hits: decls.length,
    byIsin,
    meta: toolCtx(t0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════════════════════════════════════

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { keyId: string; userId: string }
): Promise<unknown> {
  switch (name) {
    case "search_companies":              return search_companies(args as { query: string; limit?: number });
    case "search_insiders":               return search_insiders(args as { query: string; limit?: number });
    case "search_declarations":           return search_declarations(args);
    case "search_global":                 return search_global(args as { query: string; limit?: number });
    case "search_top_signals":            return search_top_signals(args);
    case "get_winning_strategy_signals":  return get_winning_strategy_signals(args);
    case "get_company":                   return get_company(args as { slug: string });
    case "get_company_declarations":      return get_company_declarations(args);
    case "get_insider":                   return get_insider(args as { slug: string });
    case "get_insider_declarations":      return get_insider_declarations(args);
    case "get_declaration":               return get_declaration(args as { amfId: string });
    case "get_site_stats":                return get_site_stats();
    case "get_system_health":             return get_system_health();
    case "get_backtest_stats":            return get_backtest_stats(args);
    case "get_account_usage":             return get_account_usage(args, ctx);
    case "get_company_full_profile":      return get_company_full_profile(args as { slug: string });
    case "get_insider_activity_summary":  return get_insider_activity_summary(args as { slug: string });
    case "compare_companies":             return compare_companies(args as { slugs: string[] });
    case "find_clustered_trades":         return find_clustered_trades(args);
    case "analyze_declaration":           return analyze_declaration(args as { amfId: string });
    case "watch_isins":                   return watch_isins(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
