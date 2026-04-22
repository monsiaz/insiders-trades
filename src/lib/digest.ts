/**
 * Daily digest composer.
 *
 * Given a user + the daily top buy/sell recos, this module builds the email
 * payload that combines:
 *   1. Portfolio alerts · insider transactions on the user's own holdings
 *      (last 48h, score >= 35). These are the most urgent, shown first.
 *   2. Top 3 BUY recos (shared across all users)
 *   3. Top 3 SELL recos (shared across all users)
 *
 * If there is absolutely nothing to say (no portfolio alerts AND no shared
 * recos), the digest is skipped entirely.
 */

import { prisma } from "./prisma";
import type { RecoItem } from "./recommendation-engine";
import type { DailyDigestPayload, PortfolioAlert } from "./email";

export { sendDailyDigestEmail } from "./email";

const PORTFOLIO_WINDOW_HOURS = 48;   // how far back to look for insider moves on user holdings
const PORTFOLIO_MIN_SCORE    = 35;   // min signalScore to surface as portfolio alert

interface BuildOpts {
  user: { id: string; email: string; firstName: string | null };
  topBuys: RecoItem[];
  topSells: RecoItem[];
}

export async function buildDigestForUser(opts: BuildOpts): Promise<DailyDigestPayload | null> {
  const { user, topBuys, topSells } = opts;

  // 1. Portfolio alerts · insider movements on companies the user holds.
  const alerts = await getPortfolioAlerts(user.id);

  // If zero portfolio alerts AND zero global recos → nothing to send.
  const hasAnything =
    alerts.length > 0 || topBuys.length > 0 || topSells.length > 0;
  if (!hasAnything) return null;

  return {
    to: user.email,
    firstName: user.firstName,
    portfolioAlerts: alerts,
    buyRecos: topBuys,
    sellRecos: topSells,
  };
}

/**
 * Fetch insider declarations on companies the user holds, in the last 48h,
 * with a min signalScore of PORTFOLIO_MIN_SCORE.
 */
async function getPortfolioAlerts(userId: string): Promise<PortfolioAlert[]> {
  const positions = await prisma.portfolioPosition.findMany({
    where: { userId },
    select: {
      isin: true,
      yahooSymbol: true,
      name: true,
      quantity: true,
      pnlPct: true,
    },
  });
  if (positions.length === 0) return [];

  const isins = Array.from(
    new Set(positions.map((p) => p.isin).filter((x): x is string => !!x))
  );
  if (isins.length === 0) return [];

  const posByIsin = new Map(
    positions.filter((p) => p.isin).map((p) => [p.isin!, p])
  );

  const since = new Date(Date.now() - PORTFOLIO_WINDOW_HOURS * 3600_000);

  const decls = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      pdfParsed: true,
      signalScore: { gte: PORTFOLIO_MIN_SCORE },
      pubDate: { gte: since },
      isin: { in: isins },
    },
    orderBy: { pubDate: "desc" },
    take: 10,
    select: {
      transactionNature: true,
      insiderName: true,
      insiderFunction: true,
      totalAmount: true,
      pctOfMarketCap: true,
      signalScore: true,
      pubDate: true,
      link: true,
      isin: true,
      company: { select: { name: true, slug: true } },
    },
  });

  const { normalizeRole } = await import("./role-utils");

  return decls.map((d) => {
    const pos = d.isin ? posByIsin.get(d.isin) : null;
    const isSell = (d.transactionNature ?? "").toLowerCase().includes("cession");
    return {
      action: isSell ? ("SELL" as const) : ("BUY" as const),
      company: { name: d.company.name, slug: d.company.slug },
      insider: {
        name: d.insiderName,
        role: normalizeRole(d.insiderFunction),
      },
      amount: d.totalAmount ? Number(d.totalAmount) : null,
      pctOfMarketCap: d.pctOfMarketCap,
      signalScore: d.signalScore ?? 0,
      userPosition: {
        quantity: pos?.quantity ?? 0,
        pnlPct: pos?.pnlPct ?? null,
      },
      pubDate: d.pubDate.toISOString(),
      amfLink: d.link,
    };
  });
}
