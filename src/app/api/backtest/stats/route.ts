/**
 * GET /api/backtest/stats
 *
 * Thin wrapper around the cached computation in src/lib/backtest-compute.ts.
 * The heavy work (22k+ rows) is cached for 1 hour.
 * Only auth check + masking run on every request.
 */
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBacktestBase, applyBacktestMasking } from "@/lib/backtest-compute";

export const dynamic = "force-dynamic";

export async function GET() {
  const [user, base] = await Promise.all([
    getCurrentUser(),
    getBacktestBase(),
  ]);

  if (!base) {
    return NextResponse.json({ total: 0 });
  }

  const isAuthenticated = !!user;
  const masked = applyBacktestMasking(base, isAuthenticated);

  return NextResponse.json(
    { ...masked, isAuthenticated },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
