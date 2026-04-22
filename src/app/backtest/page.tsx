import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getBacktestBase, applyBacktestMasking } from "@/lib/backtest-compute";
import dynamic from "next/dynamic";

const BacktestDashboard = dynamic(() => import("@/components/BacktestDashboard"), {
  loading: () => <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-3)", fontSize: "0.85rem" }}>Chargement du dashboard…</div>,
});
import { unstable_cache } from "next/cache";

export const revalidate = 3600;

const getBacktestMeta = unstable_cache(
  async () => {
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
  },
  ["backtest-meta-v1"],
  { revalidate: 3600 }
);

export async function generateMetadata() {
  const { total, earliestYear } = await getBacktestMeta();
  return {
    title: "Backtest & Signaux · InsiderTrades",
    description: `Analyse quantitative de ${total.toLocaleString("fr-FR")}+ transactions d'initiés sur 6 horizons de temps (T+30 à T+2ans) depuis ${earliestYear}.`,
  };
}

async function BacktestDashboardSection() {
  const [user, base] = await Promise.all([getCurrentUser(), getBacktestBase()]);
  const isAuthenticated = !!user;
  const initialData = base
    ? { ...applyBacktestMasking(base, isAuthenticated), isAuthenticated }
    : undefined;

  return (
    <BacktestDashboard
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialData={initialData as any}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div style={{ animation: "pulse 1.5s ease-in-out infinite", display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ height: "60px", borderRadius: "12px", background: "var(--bg-raised)" }} />
      <div style={{ height: "280px", borderRadius: "14px", background: "var(--bg-raised)" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ height: "120px", borderRadius: "12px", background: "var(--bg-raised)" }} />
        ))}
      </div>
    </div>
  );
}

export default async function BacktestPage() {
  const { total, totalBuys, earliestYear } = await getBacktestMeta();
  const totalSells = total - totalBuys;

  return (
    <div className="content-wrapper">
      <div className="mb-8">
        <div className="masthead-dateline">
          <span className="masthead-folio">Backtest · Source AMF</span>
          <span className="masthead-rule" aria-hidden="true" />
          <span className="masthead-count">
            {total.toLocaleString("fr-FR")} trades · depuis {earliestYear}
          </span>
        </div>
        <h1 style={{
          fontFamily: "var(--font-dm-serif), Georgia, serif",
          fontSize: "clamp(2rem, 6vw, 3.75rem)",
          fontWeight: 400,
          letterSpacing: "-0.015em",
          lineHeight: 1.05,
          color: "var(--tx-1)",
          marginBottom: "14px",
          overflowWrap: "break-word",
          hyphens: "auto",
        }}>
          Backtest <span style={{ fontStyle: "italic", color: "var(--gold)" }}>& signaux</span>
        </h1>
        <p style={{
          fontSize: "0.92rem",
          color: "var(--tx-2)",
          maxWidth: "720px",
          lineHeight: 1.6,
          fontFamily: "var(--font-inter), sans-serif",
        }}>
          Analyse quantitative de{" "}
          <strong style={{ color: "var(--tx-1)" }}>
            {total.toLocaleString("fr-FR")}{" "}transactions d&apos;initiés
          </strong>
          {" "}· {totalBuys.toLocaleString("fr-FR")} achats, {totalSells.toLocaleString("fr-FR")} ventes · sur 6 horizons{" "}(<span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.82rem" }}>
            T+30 · T+60 · T+90 · T+160 · T+365 · T+2ans
          </span>).
        </p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <BacktestDashboardSection />
      </Suspense>
    </div>
  );
}
