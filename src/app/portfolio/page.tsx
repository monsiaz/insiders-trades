import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import dynamicImport from "next/dynamic";

const PortfolioDashboard = dynamicImport(() => import("@/components/PortfolioDashboard").then(m => ({ default: m.PortfolioDashboard })), {
  loading: () => <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-3)", fontSize: "0.85rem" }}>Loading portfolio…</div>,
});

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://insiders-trades-sigma.vercel.app";

export async function generateMetadata() {
  const hdrs = await headers();
  const originalPath = hdrs.get("x-original-path") ?? "/portfolio/";
  const isFr = originalPath === "/fr" || originalPath.startsWith("/fr/");
  const canonical = isFr ? `${BASE}/fr/portfolio/` : `${BASE}/portfolio/`;
  return {
    title: isFr ? "Mon Portfolio · InsiderTrades Sigma" : "My Portfolio · InsiderTrades Sigma",
    alternates: { canonical },
    openGraph: { url: canonical, locale: isFr ? "fr_FR" : "en_US" },
  };
}

export default async function PortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/portfolio/");

  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";

  return (
    <div className="content-wrapper">
      <PortfolioDashboard
        user={{
          id: user.id,
          email: user.email,
          name: user.name,
          accountType: user.accountType ?? "PEA_PME",
        }}
        locale={locale}
      />
    </div>
  );
}
