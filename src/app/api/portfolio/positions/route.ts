import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireUser(req: NextRequest) {
  const session = await getSession();
  if (!session) return null;
  return session;
}

// GET: list all positions for current user
export async function GET(req: NextRequest) {
  const session = await requireUser(req);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const positions = await prisma.portfolioPosition.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ positions });
}

// POST: create new position
export async function POST(req: NextRequest) {
  const session = await requireUser(req);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json();
  const { name, isin, quantity, buyingPrice, alertBelow, alertAbove, notes } = body;

  if (!name || !quantity || !buyingPrice) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  const totalInvested = Number(quantity) * Number(buyingPrice);

  const pos = await prisma.portfolioPosition.create({
    data: {
      userId: session.userId,
      name: name.trim(),
      isin: isin?.trim() || null,
      quantity: Number(quantity),
      buyingPrice: Number(buyingPrice),
      totalInvested,
      alertBelow: alertBelow ? Number(alertBelow) : null,
      alertAbove: alertAbove ? Number(alertAbove) : null,
      notes: notes?.trim() || null,
    },
  });
  return NextResponse.json({ position: pos });
}

// PUT: update a position
export async function PUT(req: NextRequest) {
  const session = await requireUser(req);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json();
  const { id, quantity, buyingPrice, alertBelow, alertAbove, notes } = body;
  if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

  const pos = await prisma.portfolioPosition.findFirst({ where: { id, userId: session.userId } });
  if (!pos) return NextResponse.json({ error: "Position introuvable" }, { status: 404 });

  const qty = quantity != null ? Number(quantity) : pos.quantity;
  const bp = buyingPrice != null ? Number(buyingPrice) : pos.buyingPrice;

  const updated = await prisma.portfolioPosition.update({
    where: { id },
    data: {
      quantity: qty,
      buyingPrice: bp,
      totalInvested: qty * bp,
      currentValue: pos.currentPrice ? qty * pos.currentPrice : null,
      pnl: pos.currentPrice ? qty * pos.currentPrice - qty * bp : null,
      pnlPct: pos.currentPrice ? ((pos.currentPrice - bp) / bp) * 100 : null,
      alertBelow: alertBelow !== undefined ? (alertBelow ? Number(alertBelow) : null) : pos.alertBelow,
      alertAbove: alertAbove !== undefined ? (alertAbove ? Number(alertAbove) : null) : pos.alertAbove,
      notes: notes !== undefined ? notes?.trim() || null : pos.notes,
    },
  });
  return NextResponse.json({ position: updated });
}

// DELETE: remove a position
export async function DELETE(req: NextRequest) {
  const session = await requireUser(req);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

  const pos = await prisma.portfolioPosition.findFirst({ where: { id, userId: session.userId } });
  if (!pos) return NextResponse.json({ error: "Position introuvable" }, { status: 404 });

  await prisma.portfolioPosition.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
