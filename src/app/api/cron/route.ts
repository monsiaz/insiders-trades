import { NextRequest, NextResponse } from "next/server";
import { syncAllCompanies } from "@/lib/sync";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await syncAllCompanies();
    const totalAdded = results.reduce((sum, r) => sum + r.added, 0);
    const totalErrors = results.flatMap((r) => r.errors);

    return NextResponse.json({
      success: true,
      results,
      summary: {
        companiesSynced: results.length,
        totalAdded,
        totalErrors: totalErrors.length,
      },
    });
  } catch (err) {
    console.error("Cron sync error:", err);
    return NextResponse.json(
      { error: "Sync failed", details: String(err) },
      { status: 500 }
    );
  }
}
