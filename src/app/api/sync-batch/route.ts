import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncCompany } from "@/lib/sync";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { offset = 0, limit = 50 } = body;

    const companies = await prisma.company.findMany({
      skip: offset,
      take: limit,
      orderBy: { amfToken: "asc" },
      select: { id: true, name: true },
    });

    const results = await Promise.allSettled(
      companies.map(async (company) => {
        const result = await syncCompany(company.id);
        return { company: company.name, ...result };
      })
    );

    const summary = results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { company: companies[i].name, added: 0, skipped: 0, errors: [String(r.reason)] };
    });

    const totalAdded = summary.reduce((s, r) => s + r.added, 0);
    const totalErrors = summary.flatMap((r) => r.errors).length;

    return NextResponse.json({
      success: true,
      offset,
      limit,
      processed: companies.length,
      totalAdded,
      totalErrors,
      results: summary,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
