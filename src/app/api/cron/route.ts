/**
 * Daily deep sync (3am UTC): fetches the last 500 DD from AMF.
 * Acts as catch-up in case the hourly sync missed anything.
 */
import { NextRequest, NextResponse } from "next/server";
import { syncLatest } from "@/lib/sync-latest";
import { enrichMarketCaps, scoreDeclarations } from "@/lib/signals";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch latest 500 declarations from AMF
    const result = await syncLatest(500, true);

    // 2. Enrich market caps for companies that need it (up to 80 per run)
    await enrichMarketCaps(80).catch((e) => console.error("[cron] mcap:", e));

    // 3. Score any declarations that haven't been scored yet
    await scoreDeclarations(false).catch((e) => console.error("[cron] score:", e));

    return NextResponse.json({ success: true, source: "daily-deep-sync", ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
