/**
 * Daily deep sync (3am UTC): fetches the last 500 DD from AMF.
 * Acts as catch-up in case the hourly sync missed anything.
 * Also re-parses any incomplete declarations found in the DB.
 */
import { NextRequest, NextResponse } from "next/server";
import { syncLatest } from "@/lib/sync-latest";
import { enrichCompanyFinancials } from "@/lib/financials";
import { scoreDeclarations } from "@/lib/signals";
import { gptGenderForUnknownInsiders } from "@/lib/gender-gpt";
import { getRecommendations } from "@/lib/recommendation-engine";
import { buildDigestForUser, sendDailyDigestEmail } from "@/lib/digest";
import { prisma } from "@/lib/prisma";
import { fetchDeclarationDetail } from "@/lib/amf-detail";
import { getAlertsConfig, shouldDispatchOn } from "@/lib/settings";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch latest 500 declarations from AMF (with PDF parsing)
    const syncResult = await syncLatest(500, true);

    // 2. Re-parse up to 30 declarations that are missing key fields
    //    (catches stragglers from the backlog or failed previous parses)
    const reparsed = await reparseIncomplete(30);

    // 3. Enrich company financials (market cap, income, analyst data)
    await enrichCompanyFinancials(80).catch((e) => console.error("[cron] fin:", e));

    // 4. Score any declarations that haven't been scored yet
    await scoreDeclarations(false).catch((e) => console.error("[cron] score:", e));

    // 5. Backtest compute: process up to 300 declarations without results yet
    //    (runs incrementally each day; full dataset covered over time)
    const backtestResult = await computeBacktestIncremental(300).catch(
      (e) => { console.error("[cron] backtest:", e); return { computed: 0, errors: 0 }; }
    );

    // 6. GPT-4o gender classification for insiders still unknown after local heuristics
    const genderResult = await gptGenderForUnknownInsiders({
      maxInsiders: 200,
      apiKey: process.env.OPENAI_API_KEY,
    }).catch((e) => { console.error("[cron] gender-gpt:", e); return { resolved: 0, skipped: 0, errors: 1 }; });

    // 7. Send signal alert emails to opted-in users
    const alertResult = await dispatchAlertEmails().catch(
      (e) => { console.error("[cron] alerts:", e); return { sent: 0, skipped: 0 }; }
    );

    return NextResponse.json({
      success: true,
      source: "daily-deep-sync",
      ...syncResult,
      reparsed,
      backtest: backtestResult,
      genderGpt: genderResult,
      alerts: alertResult,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * Incrementally compute backtest results for declarations that don't have one yet.
 * Fetches Yahoo Finance charts with a 10y range, computes all 6 horizons.
 * Capped at `limit` per cron run so we stay within Vercel's 5-min timeout.
 */
async function computeBacktestIncremental(
  limit: number
): Promise<{ computed: number; errors: number }> {
  const decls = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      transactionNature: { not: null },
      isin: { not: null },
      backtestResult: null,
      company: { yahooSymbol: { not: null } },
    },
    take: limit,
    orderBy: { pubDate: "desc" },
    select: {
      id: true,
      transactionDate: true,
      pubDate: true,
      transactionNature: true,
      company: { select: { yahooSymbol: true } },
    },
  });

  if (decls.length === 0) return { computed: 0, errors: 0 };

  function direction(nature: string | null): string {
    if (!nature) return "BUY";
    const n = nature.toLowerCase();
    if (n.includes("cession")) return "SELL";
    return "BUY";
  }

  async function fetchChart(symbol: string): Promise<Array<{ ts: number; close: number }>> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=20y&includePrePost=false`;
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) return [];
      const data = await r.json();
      const result = data?.chart?.result?.[0];
      if (!result) return [];
      const ts: number[] = result.timestamp ?? [];
      const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
      return ts
        .map((t: number, i: number) => ({ ts: t * 1000, close: closes[i] ?? 0 }))
        .filter((p: { ts: number; close: number }) => p.close > 0);
    } catch { return []; }
  }

  function priceNear(points: Array<{ ts: number; close: number }>, targetTs: number): number | null {
    const maxDelta = 12 * 86400_000;
    let best: number | null = null;
    let bestDelta = Infinity;
    for (const p of points) {
      const delta = p.ts - targetTs;
      if (delta >= 0 && delta < maxDelta && delta < bestDelta) { best = p.close; bestDelta = delta; }
    }
    return best;
  }

  const HORIZONS = [30, 60, 90, 160, 365, 730];

  // Group by symbol to minimise Yahoo API calls
  const bySymbol = new Map<string, typeof decls>();
  for (const d of decls) {
    const sym = d.company.yahooSymbol!;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(d);
  }

  let computed = 0;
  let errors   = 0;

  for (const [symbol, group] of bySymbol) {
    const points = await fetchChart(symbol);
    if (points.length === 0) { errors += group.length; continue; }

    await Promise.all(group.map(async (decl) => {
      // Smart date: skip anomalous transactionDate (future or >3y before pubDate)
      const now = Date.now();
      let tradeDate = decl.pubDate;
      if (decl.transactionDate) {
        const txMs = decl.transactionDate.getTime();
        const pubMs = decl.pubDate.getTime();
        if (txMs <= now && pubMs - txMs <= 3 * 365 * 86400_000) {
          tradeDate = decl.transactionDate;
        }
      }
      const ts = tradeDate.getTime();
      const base = priceNear(points, ts);
      if (!base) { errors++; return; }

      const prices: Record<string, number | null> = {};
      const returns: Record<string, number | null> = {};
      for (const h of HORIZONS) {
        const p = priceNear(points, ts + h * 86400_000);
        prices[`price${h}d`]  = p;
        returns[`return${h}d`] = p != null ? ((p - base) / base) * 100 : null;
      }

      try {
        await prisma.backtestResult.upsert({
          where: { declarationId: decl.id },
          create: { declarationId: decl.id, direction: direction(decl.transactionNature), priceAtTrade: base, ...prices, ...returns },
          update: { direction: direction(decl.transactionNature), priceAtTrade: base, ...prices, ...returns, computedAt: new Date() },
        });
        computed++;
      } catch { errors++; }
    }));

    await new Promise((r) => setTimeout(r, 250));
  }

  return { computed, errors };
}

/**
 * Re-parse up to `limit` declarations that are missing ISIN or amount.
 * Prioritizes the most recent ones first.
 */
async function reparseIncomplete(limit: number): Promise<{ improved: number; errors: number }> {
  const decls = await prisma.declaration.findMany({
    where: {
      type: "DIRIGEANTS",
      OR: [
        { pdfParsed: false },
        { pdfParsed: true, isin: null },
        { pdfParsed: true, totalAmount: null, volume: { not: null } },
      ],
    },
    orderBy: { pubDate: "desc" },
    take: limit,
    select: { id: true, amfId: true },
  });

  let improved = 0;
  let errors = 0;

  for (const decl of decls) {
    try {
      const details = await fetchDeclarationDetail(decl.amfId);
      await prisma.declaration.update({
        where: { id: decl.id },
        data: {
          pdfParsed: true,
          insiderName: details?.insiderName ?? undefined,
          insiderFunction: details?.insiderFunction ?? undefined,
          transactionNature: details?.transactionNature ?? undefined,
          instrumentType: details?.instrumentType ?? undefined,
          isin: details?.isin ?? undefined,
          unitPrice: details?.unitPrice ?? undefined,
          volume: details?.volume ?? undefined,
          totalAmount: details?.totalAmount ?? undefined,
          currency: details?.currency ?? undefined,
          transactionDate: details?.transactionDate ?? undefined,
          transactionVenue: details?.transactionVenue ?? undefined,
          pdfUrl: details?.pdfUrl ?? undefined,
        },
      });
      if (details?.isin || details?.totalAmount || details?.insiderName) improved++;
    } catch {
      errors++;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return { improved, errors };
}

// ── Step 7: dispatch alert emails (new branded digest) ───────────────────────

async function dispatchAlertEmails(): Promise<{
  sent: number;
  skipped: number;
  reason?: string;
}> {
  // Respect the admin-tunable config (frequency / hour / enabled)
  const cfg = await getAlertsConfig();
  if (!shouldDispatchOn(cfg)) {
    return { sent: 0, skipped: 0, reason: `disabled-or-off-schedule (${cfg.frequency})` };
  }

  // Only send once per day per user (check lastAlertAt)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const users = await prisma.user.findMany({
    where: {
      alertEnabled: true,
      emailVerified: { not: null },
      OR: [
        { lastAlertAt: null },
        { lastAlertAt: { lt: todayStart } },
      ],
    },
    select: { id: true, email: true, firstName: true, name: true },
  });

  if (users.length === 0) return { sent: 0, skipped: 0 };

  // Pre-fetch once (shared across all users) · buy & sell recos are user-agnostic.
  const [topBuys, topSells] = await Promise.all([
    cfg.includeTopBuys
      ? getRecommendations({ mode: "general", limit: cfg.topBuysLimit, lookbackDays: cfg.lookbackDays })
      : Promise.resolve([]),
    cfg.includeTopSells
      ? getRecommendations({ mode: "sells",   limit: cfg.topSellsLimit, lookbackDays: cfg.lookbackDays })
      : Promise.resolve([]),
  ]);

  let sent = 0;
  let skipped = 0;

  for (const user of users) {
    try {
      const payload = await buildDigestForUser({
        user: { id: user.id, email: user.email, firstName: user.firstName ?? user.name ?? null },
        topBuys,
        topSells,
      });
      if (!payload) { skipped++; continue; }

      // Apply admin toggles
      if (!cfg.includePortfolioAlerts) payload.portfolioAlerts = [];

      // Dev / test override · force all outgoing emails to a single address
      const to = cfg.recipientOverride ?? user.email;

      const res = await sendDailyDigestEmail({ ...payload, to });
      if (res.delivered) {
        await prisma.user.update({ where: { id: user.id }, data: { lastAlertAt: new Date() } });
        sent++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.error(`[cron] alert for ${user.email}:`, e);
      skipped++;
    }
    // Rate limit: 1 email per 500ms
    await new Promise((r) => setTimeout(r, 500));
  }

  return { sent, skipped };
}
