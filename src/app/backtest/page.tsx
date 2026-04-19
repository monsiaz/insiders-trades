import { BacktestDashboard } from "@/components/BacktestDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function BacktestPage() {
  return (
    <div className="content-wrapper">
      <BacktestDashboard />
    </div>
  );
}
