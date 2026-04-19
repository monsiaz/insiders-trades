/**
 * GET /api/migrate
 * Applies pending Prisma schema changes to the database.
 * Protected by CRON_SECRET. Run once after schema changes.
 */
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const CRON_SECRET = process.env.CRON_SECRET;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { stdout, stderr } = await execAsync(
      "npx prisma db push --skip-generate --accept-data-loss",
      { cwd: process.cwd(), timeout: 55000 }
    );
    return NextResponse.json({ ok: true, stdout, stderr });
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return NextResponse.json(
      { error: e.message, stdout: e.stdout, stderr: e.stderr },
      { status: 500 }
    );
  }
}
