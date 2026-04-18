import { NextRequest, NextResponse } from "next/server";
import { enrichMarketCaps } from "@/lib/signals";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(new URL(req.url).searchParams.get("limit") ?? "80");
  try {
    await enrichMarketCaps(limit);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
