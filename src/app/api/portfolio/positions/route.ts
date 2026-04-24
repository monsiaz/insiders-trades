import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

async function requireUser(req: NextRequest) {
  const session = await getSession();
  if (!session) return null;
  return session;
}

// GET: list all positions for current user + cash balance
export async function GET(req: NextRequest) {
  const session = await requireUser(req);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const [positions, user] = await Promise.all([
    prisma.portfolioPosition.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { portfolioCash: true },
    }),
  ]);
  return NextResponse.json({ positions, portfolioCash: user?.portfolioCash ?? null });
}

// POST: create new position
export async function POST(req: NextRequest) {
  const session = await requireUser(req);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json();
  const { name, isin, quantity, buyingPrice, alertBelow, alertAbove, notes, fromApp,
          assetType, annualYield, yieldStartDate, yieldEndDate } = body;

  const isStock = !assetType || assetType === "STOCK";
  if (!name || (!isStock && !buyingPrice) || (isStock && (!quantity || !buyingPrice))) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }

  // Crowdfunding: quantity=1, buyingPrice=total capital
  const qty = isStock ? Number(quantity) : 1;
  const bp  = Number(buyingPrice);
  const totalInvested = qty * bp;

  // Crowdfunding: compute current value from accrued interest
  let currentValue: number | null = null;
  let pnl: number | null = null;
  let pnlPct: number | null = null;
  if (!isStock && annualYield && yieldStartDate) {
    const start = new Date(yieldStartDate).getTime();
    const now = Date.now();
    const daysElapsed = (now - start) / 86400_000;
    currentValue = Math.round(totalInvested * (1 + (Number(annualYield) / 100) * (daysElapsed / 365)) * 100) / 100;
    pnl = Math.round((currentValue - totalInvested) * 100) / 100;
    pnlPct = (pnl / totalInvested) * 100;
  }

  const pos = await prisma.portfolioPosition.create({
    data: {
      userId: session.userId,
      assetType: assetType || "STOCK",
      name: name.trim(),
      isin: isin?.trim() || null,
      quantity: qty,
      buyingPrice: bp,
      totalInvested,
      currentValue,
      pnl,
      pnlPct,
      annualYield: annualYield ? Number(annualYield) : null,
      yieldStartDate: yieldStartDate ? new Date(yieldStartDate) : null,
      yieldEndDate: yieldEndDate ? new Date(yieldEndDate) : null,
      alertBelow: alertBelow ? Number(alertBelow) : null,
      alertAbove: alertAbove ? Number(alertAbove) : null,
      notes: notes?.trim() || null,
      fromApp: fromApp === true,
    },
  });
  return NextResponse.json({ position: pos });
}

// PUT: update a position
export async function PUT(req: NextRequest) {
  const session = await requireUser(req);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json();
  const { id, quantity, buyingPrice, alertBelow, alertAbove, notes, annualYield, yieldStartDate, yieldEndDate } = body;
  if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

  const pos = await prisma.portfolioPosition.findFirst({ where: { id, userId: session.userId } });
  if (!pos) return NextResponse.json({ error: "Position introuvable" }, { status: 404 });

  const isCrowdfunding = pos.assetType === "CROWDFUNDING";
  const qty = isCrowdfunding ? 1 : (quantity != null ? Number(quantity) : pos.quantity);
  const bp = buyingPrice != null ? Number(buyingPrice) : pos.buyingPrice;
  const totalInvested = qty * bp;

  // Recalc crowdfunding current value
  const newYield = annualYield !== undefined ? Number(annualYield) : pos.annualYield;
  const newStart = yieldStartDate !== undefined ? (yieldStartDate ? new Date(yieldStartDate) : null) : pos.yieldStartDate;
  let newCurrentValue = isCrowdfunding ? pos.currentValue : (pos.currentPrice ? qty * pos.currentPrice : null);
  let newPnl = null;
  let newPnlPct = null;
  if (isCrowdfunding && newYield && newStart) {
    const daysElapsed = (Date.now() - newStart.getTime()) / 86400_000;
    newCurrentValue = Math.round(totalInvested * (1 + (newYield / 100) * (daysElapsed / 365)) * 100) / 100;
    newPnl = Math.round((newCurrentValue - totalInvested) * 100) / 100;
    newPnlPct = (newPnl / totalInvested) * 100;
  } else if (!isCrowdfunding && pos.currentPrice) {
    newPnl = qty * pos.currentPrice - totalInvested;
    newPnlPct = ((pos.currentPrice - bp) / bp) * 100;
  }

  const updated = await prisma.portfolioPosition.update({
    where: { id },
    data: {
      quantity: qty,
      buyingPrice: bp,
      totalInvested,
      currentValue: newCurrentValue,
      pnl: newPnl,
      pnlPct: newPnlPct,
      annualYield: annualYield !== undefined ? (annualYield ? Number(annualYield) : null) : pos.annualYield,
      yieldStartDate: yieldStartDate !== undefined ? (yieldStartDate ? new Date(yieldStartDate) : null) : pos.yieldStartDate,
      yieldEndDate: yieldEndDate !== undefined ? (yieldEndDate ? new Date(yieldEndDate) : null) : pos.yieldEndDate,
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
