import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

function parseEurNumber(s: string | undefined): number | null {
  if (!s) return null;
  // Handle European format: "1 234,56" or "1.234,56" or "1234,56"
  const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  try {
    const { rows } = await req.json() as { rows: Record<string, string>[] };
    if (!rows?.length) return NextResponse.json({ error: "Aucune ligne" }, { status: 400 });

    const created: string[] = [];
    const errors: string[] = [];

    for (const row of rows) {
      try {
        // Support both the broker CSV columns and a generic format
        const name       = row.name ?? row.Name ?? row.libelle ?? row.Libellé ?? row["Titre"] ?? "";
        const isin       = row.isin ?? row.ISIN ?? row.code ?? "";
        const qtyRaw     = row.quantity ?? row.quantite ?? row.Quantité ?? row.Quantite ?? row["Qté"] ?? "";
        const priceRaw   = row.buyingPrice ?? row["Prix d'achat"] ?? row.prixAchat ?? row["PRU"] ?? row.pru ?? "";
        // Broker CSV extra fields (e.g. Bourse Direct "export-positions-comptables")
        const lastPriceRaw = row.lastPrice ?? row["Cours actuel"] ?? row["Dernier cours"] ?? row.currentPrice ?? "";
        const lastDateRaw  = row.lastMovementDate ?? row["Date dernière opération"] ?? "";

        if (!name || !qtyRaw || !priceRaw) {
          errors.push(`Ligne ignorée (données manquantes): ${name || "sans nom"}`);
          continue;
        }

        const quantity    = parseEurNumber(qtyRaw);
        const buyingPrice = parseEurNumber(priceRaw);
        const lastPrice   = parseEurNumber(lastPriceRaw);

        if (!quantity || !buyingPrice) {
          errors.push(`Ligne ignorée (valeurs invalides): ${name}`);
          continue;
        }

        const totalInvested = quantity * buyingPrice;
        const currentValue  = lastPrice != null ? quantity * lastPrice : null;
        const pnl           = currentValue != null ? currentValue - totalInvested : null;
        const pnlPct        = pnl != null && totalInvested > 0 ? (pnl / totalInvested) * 100 : null;
        let lastUpdated: Date | null = null;
        if (lastDateRaw) { const d = new Date(lastDateRaw); if (!isNaN(d.getTime())) lastUpdated = d; }
        else if (lastPrice != null) lastUpdated = new Date();

        // Upsert: if same ISIN exists for this user, update; otherwise create
        const existing = isin
          ? await prisma.portfolioPosition.findFirst({ where: { userId: session.userId, isin: isin || undefined } })
          : null;

        const upsertData = {
          name: name.trim(),
          quantity,
          buyingPrice,
          totalInvested,
          ...(lastPrice != null && { currentPrice: lastPrice, currentValue, pnl, pnlPct }),
          ...(lastUpdated && { lastUpdated }),
        };

        if (existing) {
          await prisma.portfolioPosition.update({ where: { id: existing.id }, data: upsertData });
          created.push(`${name} (mis à jour)`);
        } else {
          await prisma.portfolioPosition.create({
            data: {
              userId: session.userId,
              isin: isin?.trim() || null,
              ...upsertData,
            },
          });
          created.push(name);
        }
      } catch (e) {
        errors.push(`Erreur sur ligne: ${String(e)}`);
      }
    }

    return NextResponse.json({ ok: true, imported: created.length, errors });
  } catch (e) {
    console.error("[portfolio/import]", e);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
