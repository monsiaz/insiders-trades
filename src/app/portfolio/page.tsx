import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import dynamicImport from "next/dynamic";

const PortfolioDashboard = dynamicImport(() => import("@/components/PortfolioDashboard").then(m => ({ default: m.PortfolioDashboard })), {
  loading: () => <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-3)", fontSize: "0.85rem" }}>Chargement du portfolio…</div>,
});

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/portfolio");

  return (
    <div className="content-wrapper">
      <PortfolioDashboard user={{ id: user.id, email: user.email, name: user.name }} />
    </div>
  );
}
