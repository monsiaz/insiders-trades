import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getBacktestBase, applyBacktestMasking } from "@/lib/backtest-compute";
import BacktestDashboard from "@/components/BacktestDashboard";

export const dynamic = "force-dynamic";

async function getBacktestMeta() {
  try {
    const [total, totalBuys, earliest] = await Promise.all([
      prisma.backtestResult.count(),
      prisma.backtestResult.count({ where: { direction: "BUY" } }),
      prisma.declaration.findFirst({
        where: { type: "DIRIGEANTS", transactionDate: { gte: new Date("2020-01-01") } },
        orderBy: { transactionDate: "asc" },
        select: { transactionDate: true },
      }),
    ]);
    const earliestYear = earliest?.transactionDate
      ? new Date(earliest.transactionDate).getFullYear()
      : 2021;
    return { total, totalBuys, earliestYear };
  } catch {
    return { total: 22000, totalBuys: 16000, earliestYear: 2021 };
  }
}

export async function generateMetadata() {
  const { total, earliestYear } = await getBacktestMeta();
  return {
    title: "Backtest & Signaux · InsiderTrades",
    description: `Analyse quantitative de ${total.toLocaleString("fr-FR")}+ transactions d'initiés sur 6 horizons de temps (T+30 à T+2ans) depuis ${earliestYear}.`,
  };
}

export default async function BacktestPage() {
  // All three run in parallel — base stats are cached for 1h
  const [{ total, totalBuys, earliestYear }, user, base] = await Promise.all([
    getBacktestMeta(),
    getCurrentUser(),
    getBacktestBase(),
  ]);

  const isAuthenticated = !!user;

  // Apply auth masking server-side (fast — no DB call)
  const initialData = base
    ? { ...applyBacktestMasking(base, isAuthenticated), isAuthenticated }
    : undefined;

  return (
    <div className="content-wrapper">
      <div className="mb-6">
        <h1 className="heading-page">Backtest & Signaux</h1>
        <p className="text-secondary text-sm mt-1">
          Analyse quantitative de{" "}
          <span className="text-primary font-semibold">
            {total.toLocaleString("fr-FR")} transactions d&apos;initiés
          </span>
          {" "}({totalBuys.toLocaleString("fr-FR")} achats · {(total - totalBuys).toLocaleString("fr-FR")} ventes)
          {" "}sur 6 horizons depuis {earliestYear} · T+30 · T+60 · T+90 · T+160 · T+365 · T+2ans
        </p>
      </div>
      {/* initialData pre-loaded server-side — no spinner on first render */}
      <BacktestDashboard initialData={initialData as Parameters<typeof BacktestDashboard>[0]["initialData"]} />
    </div>
  );
}
