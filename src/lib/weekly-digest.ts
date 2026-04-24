/**
 * Weekly digest — every Monday 8h UTC (10h Paris).
 *
 * Structure:
 *   1. OpenAI-generated narrative (FR) — market context + portfolio analysis
 *   2. Portfolio snapshot (positions + P&L + crowdfunding interest)
 *   3. Actions à faire (VENDRE / RENFORCER / SURVEILLER / ACHETER)
 *   4. Top 5 BUY recos of the week
 *   5. Footer CTA
 */

import { prisma } from "./prisma";
import type { RecoItem } from "./recommendation-engine";

export interface WeeklyDigestPayload {
  to: string;
  firstName: string | null;
  narrative: string;          // OpenAI-generated analysis paragraph
  portfolioSnap: PortfolioSnap[];
  actions: WeeklyAction[];
  topBuys: RecoItem[];
  topSells: RecoItem[];
  weekLabel: string;          // e.g. "Semaine du 21 avril 2026"
}

export interface PortfolioSnap {
  name: string;
  assetType: string;
  totalInvested: number;
  currentValue: number | null;
  pnl: number | null;
  pnlPct: number | null;
  annualYield: number | null;
  /** Accrued interest for crowdfunding positions (= pnl) */
  accruedInterest: number | null;
}

export type ActionType = "SELL" | "REINFORCE" | "WATCH" | "BUY";

export interface WeeklyAction {
  type: ActionType;
  company: string;
  companySlug: string;
  reason: string;
  signalScore?: number;
  amount?: number | null;
}

// ── OpenAI narrative ─────────────────────────────────────────────────────────

async function generateNarrative(opts: {
  firstName: string | null;
  portfolio: PortfolioSnap[];
  topBuys: RecoItem[];
  topSells: RecoItem[];
  actions: WeeklyAction[];
  apiKey: string | undefined;
}): Promise<string> {
  const { firstName, portfolio, topBuys, topSells, actions, apiKey } = opts;

  if (!apiKey) return "";

  const totalInvested = portfolio.reduce((s, p) => s + p.totalInvested, 0);
  const totalCurrent  = portfolio.reduce((s, p) => s + (p.currentValue ?? p.totalInvested), 0);
  const totalPnl      = totalCurrent - totalInvested;
  const totalPnlPct   = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  const portfolioCtx = portfolio.map((p) =>
    `${p.name}: ${p.pnlPct != null ? `${p.pnlPct >= 0 ? "+" : ""}${p.pnlPct.toFixed(1)}%` : "NC"}` +
    (p.assetType === "CROWDFUNDING" ? ` (crowdfunding ${p.annualYield ?? "?"}%/an)` : "")
  ).join(", ");

  const buysCtx = topBuys.slice(0, 3).map((r) =>
    `${r.company.name} (score ${r.recoScore}, ${r.insider.name} — ${r.insider.function})`
  ).join("; ");

  const sellsCtx = topSells.slice(0, 2).map((r) =>
    `${r.company.name} (score ${r.recoScore})`
  ).join("; ");

  const actionsCtx = actions.map((a) =>
    `${a.type} ${a.company}: ${a.reason}`
  ).join("; ");

  const prompt = `Tu es un analyste senior spécialiste de l'investissement insider pour particuliers français (PEA-PME).
Rédige un paragraphe de récap hebdomadaire en français, naturel et professionnel (4-5 phrases max), pour ${firstName ?? "l'investisseur"}.

Données de la semaine :
- Portefeuille global : ${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(1)}% (${totalPnl >= 0 ? "+" : ""}${Math.round(totalPnl).toLocaleString("fr-FR")} €)
- Positions : ${portfolioCtx || "aucune"}
- Top achats détectés : ${buysCtx || "aucun signal fort"}
- Top ventes détectées : ${sellsCtx || "aucune"}
- Actions suggérées : ${actionsCtx || "maintenir le portefeuille"}

Instructions :
- Commence directement par l'analyse (pas de "Bonjour", pas de ponctuation d'ouverture).
- Sois concis, précis, factuel.
- Mentionne 1-2 opportunités ou risques concrets.
- Termine par une recommandation d'action claire.
- Pas de formatage markdown ni de listes.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 300,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return "";
    const data = await res.json();
    return (data.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return "";
  }
}

// ── Portfolio snapshot ───────────────────────────────────────────────────────

async function getPortfolioSnap(userId: string): Promise<PortfolioSnap[]> {
  const positions = await prisma.portfolioPosition.findMany({
    where: { userId },
    orderBy: { totalInvested: "desc" },
  });
  return positions.map((p) => ({
    name: p.name,
    assetType: p.assetType,
    totalInvested: p.totalInvested,
    currentValue: p.currentValue,
    pnl: p.pnl,
    pnlPct: p.pnlPct,
    annualYield: p.annualYield,
    accruedInterest: p.assetType === "CROWDFUNDING" ? (p.pnl ?? null) : null,
  }));
}

// ── Actions to take ──────────────────────────────────────────────────────────

const ACTION_WINDOW_DAYS = 7;  // look back 7 days for signals on portfolio holdings
const MIN_SCORE_SELL_ALERT = 40;
const MIN_SCORE_BUY_ALERT  = 35;

async function computeActions(
  userId: string,
  topBuys: RecoItem[],
): Promise<WeeklyAction[]> {
  const actions: WeeklyAction[] = [];

  // 1. Insider SELL signals on positions the user holds
  const positions = await prisma.portfolioPosition.findMany({
    where: { userId, isin: { not: null } },
    select: { isin: true, name: true },
  });
  const isins = positions.map((p) => p.isin!).filter(Boolean);

  if (isins.length > 0) {
    const since = new Date(Date.now() - ACTION_WINDOW_DAYS * 86400_000);
    const sellDecls = await prisma.declaration.findMany({
      where: {
        type: "DIRIGEANTS",
        isin: { in: isins },
        pubDate: { gte: since },
        transactionNature: { contains: "cession", mode: "insensitive" },
        signalScore: { gte: MIN_SCORE_SELL_ALERT },
      },
      orderBy: { signalScore: "desc" },
      take: 5,
      select: {
        isin: true, insiderName: true, insiderFunction: true,
        signalScore: true, totalAmount: true,
        company: { select: { name: true, slug: true } },
      },
    });

    for (const d of sellDecls) {
      actions.push({
        type: "SELL",
        company: d.company.name,
        companySlug: d.company.slug,
        reason: `${d.insiderName ?? "Dirigeant"} cède (score ${d.signalScore ?? "?"})${d.totalAmount ? ` · ${Math.round(Number(d.totalAmount)).toLocaleString("fr-FR")} €` : ""}`,
        signalScore: d.signalScore ?? undefined,
        amount: d.totalAmount ? Number(d.totalAmount) : null,
      });
    }

    // 2. Insider BUY signals on positions the user holds → REINFORCE
    const buyDecls = await prisma.declaration.findMany({
      where: {
        type: "DIRIGEANTS",
        isin: { in: isins },
        pubDate: { gte: since },
        signalScore: { gte: MIN_SCORE_BUY_ALERT },
        NOT: { transactionNature: { contains: "cession", mode: "insensitive" } },
      },
      orderBy: { signalScore: "desc" },
      take: 5,
      select: {
        isin: true, insiderName: true, signalScore: true, totalAmount: true,
        company: { select: { name: true, slug: true } },
      },
    });

    for (const d of buyDecls) {
      // Don't duplicate company if already flagged for SELL
      if (actions.some((a) => a.company === d.company.name && a.type === "SELL")) continue;
      actions.push({
        type: "REINFORCE",
        company: d.company.name,
        companySlug: d.company.slug,
        reason: `${d.insiderName ?? "Dirigeant"} achète (score ${d.signalScore ?? "?"})`,
        signalScore: d.signalScore ?? undefined,
      });
    }
  }

  // 3. Top BUY recos NOT already in portfolio → BUY opportunity
  const portfolioCompanies = new Set(positions.map((p) => p.name.toUpperCase()));
  for (const reco of topBuys.slice(0, 5)) {
    if (!portfolioCompanies.has(reco.company.name.toUpperCase())) {
      actions.push({
        type: "BUY",
        company: reco.company.name,
        companySlug: reco.company.slug,
        reason: `Signal fort — ${reco.insider.name} (score ${reco.recoScore})`,
        signalScore: reco.recoScore,
        amount: reco.totalAmount,
      });
    }
    if (actions.filter((a) => a.type === "BUY").length >= 3) break;
  }

  return actions;
}

// ── Main builder ─────────────────────────────────────────────────────────────

interface BuildWeeklyOpts {
  user: { id: string; email: string; firstName: string | null };
  topBuys: RecoItem[];
  topSells: RecoItem[];
  apiKey: string | undefined;
}

export async function buildWeeklyDigestForUser(opts: BuildWeeklyOpts): Promise<WeeklyDigestPayload | null> {
  const { user, topBuys, topSells, apiKey } = opts;

  const portfolio = await getPortfolioSnap(user.id);
  const actions   = await computeActions(user.id, topBuys);

  if (portfolio.length === 0 && topBuys.length === 0) return null;

  const narrative = await generateNarrative({
    firstName: user.firstName,
    portfolio,
    topBuys,
    topSells,
    actions,
    apiKey,
  });

  const now = new Date();
  const weekLabel = `Semaine du ${now.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;

  return {
    to: user.email,
    firstName: user.firstName,
    narrative,
    portfolioSnap: portfolio,
    actions,
    topBuys: topBuys.slice(0, 5),
    topSells: topSells.slice(0, 3),
    weekLabel,
  };
}
