/**
 * GET /api/migrate
 * Applies pending schema changes using raw SQL (Vercel-safe).
 * Protected by CRON_SECRET. Run once after schema changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];

  try {
    // Create BacktestResult table if it doesn't exist
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "BacktestResult" (
        "id"            TEXT NOT NULL,
        "declarationId" TEXT NOT NULL UNIQUE,
        "priceAtTrade"  DOUBLE PRECISION,
        "price30d"      DOUBLE PRECISION,
        "price60d"      DOUBLE PRECISION,
        "price90d"      DOUBLE PRECISION,
        "price180d"     DOUBLE PRECISION,
        "return30d"     DOUBLE PRECISION,
        "return60d"     DOUBLE PRECISION,
        "return90d"     DOUBLE PRECISION,
        "return180d"    DOUBLE PRECISION,
        "computedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BacktestResult_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "BacktestResult_declarationId_fkey"
          FOREIGN KEY ("declarationId")
          REFERENCES "Declaration"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    results.push("BacktestResult table: OK");

    // Create index
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "BacktestResult_declarationId_key"
        ON "BacktestResult"("declarationId")
    `);
    results.push("BacktestResult index: OK");

    return NextResponse.json({ ok: true, results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, results }, { status: 500 });
  }
}
