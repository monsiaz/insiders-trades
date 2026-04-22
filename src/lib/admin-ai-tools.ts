/**
 * Read-only tools exposed to the Admin AI assistant.
 *
 * The admin-facing chat endpoint uses OpenAI tool-calling. Each tool is a
 * safe, auditable function that reads (never writes) from Postgres and
 * returns structured data that the model can reason about.
 *
 * NEVER add tools that mutate data here — write operations must go through
 * the dedicated admin endpoints (/api/admin/users, /api/admin/alerts).
 */

import { prisma } from "./prisma";
import { getAlertsConfig } from "./settings";

// ── OpenAI tool schema (function-calling style) ──────────────────────────────

export const ADMIN_TOOLS_SCHEMA = [
  {
    type: "function" as const,
    function: {
      name: "get_site_stats",
      description:
        "Retourne un tableau de bord rapide du site : compteurs globaux, fraîcheur des données, état du backtest.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_top_signals",
      description:
        "Retourne les signaux les plus forts récents (achats ou ventes) ordonnés par signalScore. Utile pour résumer l'actualité insider.",
      parameters: {
        type: "object",
        properties: {
          direction: {
            type: "string",
            enum: ["BUY", "SELL", "ALL"],
            description: "BUY = acquisitions, SELL = cessions, ALL = les deux",
          },
          lookbackDays: { type: "number", description: "Fenêtre en jours (1-90)", default: 7 },
          limit: { type: "number", description: "Max 20", default: 10 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_recent_declarations",
      description: "Dernières déclarations AMF parsées (pour vérifier l'activité de la pipeline).",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", default: 10 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_users",
      description: "Liste les utilisateurs enregistrés avec leurs métadonnées clés.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", default: 25 },
          withPortfolio: {
            type: "boolean",
            description: "Si true, ne retourne que les users qui ont au moins 1 position",
            default: false,
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_user_detail",
      description: "Détail d'un utilisateur (par email). Inclut rôles, statut, crédits, positions.",
      parameters: {
        type: "object",
        properties: { email: { type: "string" } },
        required: ["email"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_company_stats",
      description:
        "Statistiques sur une société (par nom partiel ou ticker) : nb déclarations, score moyen, dernier mouvement.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_alerts_config",
      description: "État actuel de la configuration des alertes email (fréquence, seuil, triggers).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_backtest_summary",
      description: "Synthèse backtest : nb de trades, retours moyens T+30/90/365, win rates par direction.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
];

// ── Tool implementations ─────────────────────────────────────────────────────

export async function runAdminTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    switch (name) {
      case "get_site_stats":          return await getSiteStats();
      case "get_top_signals":         return await getTopSignals(args);
      case "get_recent_declarations": return await getRecentDeclarations(args);
      case "list_users":              return await listUsers(args);
      case "get_user_detail":         return await getUserDetail(args);
      case "get_company_stats":       return await getCompanyStats(args);
      case "get_alerts_config":       return await getAlertsConfig();
      case "get_backtest_summary":    return await getBacktestSummary();
      default: return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err) };
  }
}

async function getSiteStats() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000);
  const yesterday = new Date(now.getTime() - 86400_000);

  const [
    declTotal,
    decl7d,
    decl24h,
    companiesTotal,
    companiesEnriched,
    insidersTotal,
    backtestsTotal,
    usersTotal,
    usersAdmins,
    positionsTotal,
    lastDecl,
  ] = await Promise.all([
    prisma.declaration.count(),
    prisma.declaration.count({ where: { pubDate: { gte: sevenDaysAgo } } }),
    prisma.declaration.count({ where: { pubDate: { gte: yesterday } } }),
    prisma.company.count(),
    prisma.company.count({ where: { marketCap: { not: null } } }),
    prisma.insider.count(),
    prisma.backtestResult.count(),
    prisma.user.count(),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.portfolioPosition.count(),
    prisma.declaration.findFirst({ orderBy: { pubDate: "desc" }, select: { pubDate: true } }),
  ]);

  return {
    declarations: { total: declTotal, last7d: decl7d, last24h: decl24h },
    companies: { total: companiesTotal, enriched: companiesEnriched, enrichedPct: Math.round((companiesEnriched / Math.max(1, companiesTotal)) * 100) },
    insiders: { total: insidersTotal },
    backtests: { total: backtestsTotal },
    users: { total: usersTotal, admins: usersAdmins },
    portfolio: { positions: positionsTotal },
    freshness: { lastDeclarationPubAt: lastDecl?.pubDate?.toISOString() ?? null },
  };
}

async function getTopSignals(args: Record<string, unknown>) {
  const direction = String(args.direction ?? "ALL").toUpperCase();
  const lookbackDays = Math.max(1, Math.min(90, Number(args.lookbackDays ?? 7)));
  const limit = Math.max(1, Math.min(20, Number(args.limit ?? 10)));
  const since = new Date(Date.now() - lookbackDays * 86400_000);

  const whereDirection =
    direction === "BUY" ? { transactionNature: { contains: "Acquisition", mode: "insensitive" as const } } :
    direction === "SELL" ? { transactionNature: { contains: "Cession", mode: "insensitive" as const } } :
    {};

  const rows = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      pdfParsed: true,
      pubDate: { gte: since },
      signalScore: { not: null },
      ...whereDirection,
    },
    orderBy: { signalScore: "desc" },
    take: limit,
    select: {
      pubDate: true,
      transactionNature: true,
      insiderName: true,
      insiderFunction: true,
      totalAmount: true,
      pctOfMarketCap: true,
      signalScore: true,
      isCluster: true,
      company: { select: { name: true, slug: true } },
    },
  });

  return rows.map((r) => ({
    date: r.pubDate.toISOString().slice(0, 10),
    company: r.company.name,
    slug: r.company.slug,
    insider: r.insiderName,
    role: r.insiderFunction,
    nature: r.transactionNature,
    amountEur: r.totalAmount,
    pctMcap: r.pctOfMarketCap,
    score: r.signalScore,
    cluster: r.isCluster,
  }));
}

async function getRecentDeclarations(args: Record<string, unknown>) {
  const limit = Math.max(1, Math.min(50, Number(args.limit ?? 10)));
  const rows = await prisma.declaration.findMany({
    where: { type: "DIRIGEANTS", pdfParsed: true },
    orderBy: { pubDate: "desc" },
    take: limit,
    select: {
      pubDate: true,
      transactionNature: true,
      insiderName: true,
      insiderFunction: true,
      totalAmount: true,
      signalScore: true,
      company: { select: { name: true, slug: true } },
    },
  });
  return rows.map((r) => ({
    date: r.pubDate.toISOString(),
    company: r.company.name,
    slug: r.company.slug,
    insider: r.insiderName,
    role: r.insiderFunction,
    nature: r.transactionNature,
    amountEur: r.totalAmount,
    score: r.signalScore,
  }));
}

async function listUsers(args: Record<string, unknown>) {
  const limit = Math.max(1, Math.min(100, Number(args.limit ?? 25)));
  const withPortfolio = Boolean(args.withPortfolio);

  const users = await prisma.user.findMany({
    where: withPortfolio
      ? { positions: { some: {} } }
      : undefined,
    take: limit,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isBanned: true,
      alertEnabled: true,
      credits: true,
      createdAt: true,
      lastLoginAt: true,
      _count: { select: { positions: true } },
    },
  });

  return users.map((u) => ({
    email: u.email,
    name: [u.firstName, u.lastName].filter(Boolean).join(" ") || null,
    role: u.role,
    isBanned: u.isBanned,
    alertEnabled: u.alertEnabled,
    credits: u.credits,
    positions: u._count.positions,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  }));
}

async function getUserDetail(args: Record<string, unknown>) {
  const email = String(args.email ?? "").trim().toLowerCase();
  if (!email) return { error: "email requis" };

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isBanned: true,
      bannedReason: true,
      alertEnabled: true,
      credits: true,
      portfolioCash: true,
      lastLoginAt: true,
      lastAlertAt: true,
      createdAt: true,
      positions: {
        select: {
          name: true,
          isin: true,
          quantity: true,
          buyingPrice: true,
          currentPrice: true,
          pnl: true,
          pnlPct: true,
          fromApp: true,
        },
      },
    },
  });

  if (!user) return { error: `utilisateur introuvable : ${email}` };

  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    lastAlertAt: user.lastAlertAt?.toISOString() ?? null,
  };
}

async function getCompanyStats(args: Record<string, unknown>) {
  const query = String(args.query ?? "").trim();
  if (!query) return { error: "query requis" };

  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { yahooSymbol: { contains: query, mode: "insensitive" } },
        { slug: { contains: query.toLowerCase() } },
        { isin: { contains: query, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      isin: true,
      yahooSymbol: true,
      marketCap: true,
      currentPrice: true,
      priceAt: true,
      trailingPE: true,
      analystReco: true,
      targetMean: true,
      _count: { select: { declarations: true } },
    },
  });

  if (!company) return { error: `société introuvable : ${query}` };

  const [lastDecl, topSignal, avgScore] = await Promise.all([
    prisma.declaration.findFirst({
      where: { companyId: company.id },
      orderBy: { pubDate: "desc" },
      select: { pubDate: true, insiderName: true, transactionNature: true, totalAmount: true, signalScore: true },
    }),
    prisma.declaration.findFirst({
      where: { companyId: company.id, signalScore: { not: null } },
      orderBy: { signalScore: "desc" },
      select: { pubDate: true, signalScore: true, transactionNature: true, insiderName: true, totalAmount: true },
    }),
    prisma.declaration.aggregate({
      where: { companyId: company.id, signalScore: { not: null } },
      _avg: { signalScore: true },
    }),
  ]);

  return {
    company: {
      name: company.name,
      slug: company.slug,
      isin: company.isin,
      yahooSymbol: company.yahooSymbol,
      marketCapEur: company.marketCap ? Number(company.marketCap) : null,
      currentPrice: company.currentPrice,
      priceAt: company.priceAt?.toISOString() ?? null,
      trailingPE: company.trailingPE,
      analystReco: company.analystReco,
      targetMean: company.targetMean,
    },
    totals: {
      declarations: company._count.declarations,
      avgSignalScore: avgScore._avg.signalScore,
    },
    lastDeclaration: lastDecl && {
      pubDate: lastDecl.pubDate.toISOString(),
      insider: lastDecl.insiderName,
      nature: lastDecl.transactionNature,
      amountEur: lastDecl.totalAmount,
      score: lastDecl.signalScore,
    },
    topSignal: topSignal && {
      pubDate: topSignal.pubDate.toISOString(),
      insider: topSignal.insiderName,
      nature: topSignal.transactionNature,
      amountEur: topSignal.totalAmount,
      score: topSignal.signalScore,
    },
  };
}

async function getBacktestSummary() {
  const [buyCount, sellCount, agg] = await Promise.all([
    prisma.backtestResult.count({ where: { direction: "BUY" } }),
    prisma.backtestResult.count({ where: { direction: "SELL" } }),
    prisma.backtestResult.aggregate({
      _avg: { return30d: true, return60d: true, return90d: true, return365d: true, return730d: true },
    }),
  ]);

  return {
    counts: { buy: buyCount, sell: sellCount, total: buyCount + sellCount },
    averageReturnsPct: {
      T30:  agg._avg.return30d,
      T60:  agg._avg.return60d,
      T90:  agg._avg.return90d,
      T365: agg._avg.return365d,
      T730: agg._avg.return730d,
    },
  };
}
