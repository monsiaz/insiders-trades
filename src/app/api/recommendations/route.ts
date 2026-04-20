/**
 * GET /api/recommendations?mode=general|personal&limit=10&days=90
 *
 * Returns ranked buy (+ sell for personal mode) insider signal recommendations.
 * Personal mode requires a valid session and surfaces sell alerts for portfolio holdings.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRecommendations } from "@/lib/recommendation-engine";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode   = (searchParams.get("mode") ?? "general") as "general" | "personal";
  const limit  = Math.min(parseInt(searchParams.get("limit") ?? "10"), 20);
  const days   = Math.min(parseInt(searchParams.get("days") ?? "90"), 180);

  let portfolioIsins: string[] = [];

  if (mode === "personal") {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const positions = await prisma.portfolioPosition.findMany({
      where: { userId: user.id, isin: { not: null } },
      select: { isin: true },
    });
    portfolioIsins = positions.map((p) => p.isin!).filter(Boolean);
  }

  try {
    const recommendations = await getRecommendations({
      mode,
      limit,
      lookbackDays: days,
      portfolioIsins,
    });

    return NextResponse.json(
      { recommendations, count: recommendations.length, mode, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=120" } }
    );
  } catch (err) {
    console.error("[recommendations]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
