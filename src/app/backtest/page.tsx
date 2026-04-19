import BacktestDashboard from "@/components/BacktestDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Backtest & Signaux — InsiderTrades",
  description: "Analyse quantitative des transactions d'initiés sur 6 horizons de temps (T+30 à T+2ans).",
};

export default function BacktestPage() {
  return (
    <div className="content-wrapper">
      <div className="mb-6">
        <h1 className="heading-page">Backtest & Signaux</h1>
        <p className="text-secondary text-sm mt-1">
          Analyse quantitative de {" "}
          <span className="text-primary font-semibold">4 800+ transactions d&apos;initiés</span>
          {" "}sur 6 horizons : T+30 · T+60 · T+90 · T+160 · T+365 · T+2ans
        </p>
      </div>
      <BacktestDashboard />
    </div>
  );
}
