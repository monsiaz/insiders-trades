import { NextRequest, NextResponse } from "next/server";
import { syncCompany, syncAllCompanies } from "@/lib/sync";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { companyId } = body;

    if (companyId) {
      const result = await syncCompany(companyId);
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      return NextResponse.json({ success: true, company: company?.name, ...result });
    }

    const results = await syncAllCompanies();
    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: "Sync failed", details: String(err) },
      { status: 500 }
    );
  }
}
