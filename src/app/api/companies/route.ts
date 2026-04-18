import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAmfRss } from "@/lib/amf";
import slugify from "slugify";

export async function GET() {
  const companies = await prisma.company.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { declarations: true } },
    },
  });

  return NextResponse.json(companies);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amfToken, description, isin, market } = body;

    if (!amfToken) {
      return NextResponse.json({ error: "amfToken is required" }, { status: 400 });
    }

    const existing = await prisma.company.findUnique({ where: { amfToken } });
    if (existing) {
      return NextResponse.json(
        { error: "Company with this AMF token already exists", company: existing },
        { status: 409 }
      );
    }

    const feed = await fetchAmfRss(amfToken);
    const name = feed.companyName;
    const slug = slugify(name, { lower: true, strict: true });

    const company = await prisma.company.create({
      data: {
        name,
        slug,
        amfToken,
        description: description || null,
        isin: isin || null,
        market: market || null,
      },
    });

    return NextResponse.json({ success: true, company }, { status: 201 });
  } catch (err) {
    console.error("Company creation error:", err);
    return NextResponse.json(
      { error: "Failed to create company", details: String(err) },
      { status: 500 }
    );
  }
}
