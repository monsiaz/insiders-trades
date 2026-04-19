import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PortfolioDashboard } from "@/components/PortfolioDashboard";

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
