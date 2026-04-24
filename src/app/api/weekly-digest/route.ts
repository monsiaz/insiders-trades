/**
 * POST /api/weekly-digest
 *
 * Vercel Cron: every Monday at 8h UTC (10h Paris)
 * Also callable manually by admin via POST with ?preview=1 to get dry-run JSON.
 *
 * Steps:
 *   1. Get all opted-in users (alertsEnabled = true, or all users with a portfolio)
 *   2. Get global top BUY + SELL recommendations
 *   3. For each user: build the weekly payload (portfolio + OpenAI narrative + actions)
 *   4. Send the email
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRecommendations } from "@/lib/recommendation-engine";
import { buildWeeklyDigestForUser } from "@/lib/weekly-digest";
import { sendWeeklyDigestEmail, renderWeeklyDigest } from "@/lib/email";
import { getCurrentUser } from "@/lib/auth";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}

async function handler(req: NextRequest) {
  // Auth: cron secret OR admin session
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isValidCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isValidCron) {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const preview = req.nextUrl.searchParams.get("preview") === "1";
  const forceTo  = req.nextUrl.searchParams.get("to"); // send to specific email only

  try {
    // 1. Load global recommendations (shared across all users)
    const [allBuys, allSells] = await Promise.all([
      getRecommendations({ mode: "general", limit: 10 }),
      getRecommendations({ mode: "sells",   limit: 5  }),
    ]);
    const topBuys  = allBuys.slice(0, 5);
    const topSells = allSells.slice(0, 3);

    // 2. Get all users who should receive the weekly digest
    //    (has verified account + at least 1 portfolio position OR alertsEnabled)
    const users = await prisma.user.findMany({
      where: {
        positions: { some: {} },
        ...(forceTo ? { email: forceTo } : {}),
      },
      select: {
        id: true, email: true, name: true,
      },
    });

    const results: { email: string; status: string; actions?: number }[] = [];

    for (const user of users) {
      const firstName = (user.name ?? "").split(" ")[0] || null;
      try {
        const payload = await buildWeeklyDigestForUser({
          user: { id: user.id, email: user.email, firstName },
          topBuys,
          topSells,
          apiKey: process.env.OPENAI_API_KEY,
        });

        if (!payload) {
          results.push({ email: user.email, status: "skipped:nothing-to-send" });
          continue;
        }

        if (preview) {
          // Return first user as preview (HTML + JSON)
          const rendered = renderWeeklyDigest(payload);
          return NextResponse.json({
            preview: true,
            to: payload.to,
            subject: rendered.subject,
            narrative: payload.narrative,
            actions: payload.actions,
            portfolioSnap: payload.portfolioSnap,
            topBuys: payload.topBuys.map((r) => ({ company: r.company.name, score: r.recoScore })),
          });
        }

        await sendWeeklyDigestEmail(payload);
        results.push({ email: user.email, status: "sent", actions: payload.actions.length });
      } catch (err) {
        console.error(`[weekly-digest] ${user.email}:`, err);
        results.push({ email: user.email, status: `error: ${String(err).slice(0, 80)}` });
      }
    }

    return NextResponse.json({
      ok: true,
      users: users.length,
      results,
    });
  } catch (err) {
    console.error("[weekly-digest] fatal:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
