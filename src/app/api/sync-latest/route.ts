import { NextRequest, NextResponse } from "next/server";
import { syncLatest } from "@/lib/sync-latest";

export const maxDuration = 300;

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body =
      req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const size: number = body.size ?? 100;
    const enrich: boolean = body.enrich ?? true;

    const result = await syncLatest(size, enrich);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
