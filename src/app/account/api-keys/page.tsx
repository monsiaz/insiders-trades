import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ApiKeysClient from "./ApiKeysClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mes clés API — Insiders Trades Sigma",
};

export default async function ApiKeysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/account/api-keys");
  return <ApiKeysClient user={{ email: user.email, role: user.role }} />;
}
