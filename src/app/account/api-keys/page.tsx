import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { headers } from "next/headers";
import ApiKeysClient from "./ApiKeysClient";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const hdrs = await headers();
  const isFr = (hdrs.get("x-locale") ?? "en") === "fr";
  return { title: isFr ? "Mes clés API · Insiders Trades Sigma" : "My API Keys · Insiders Trades Sigma" };
}

export default async function ApiKeysPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/account/api-keys");
  const hdrs = await headers();
  const locale = (hdrs.get("x-locale") ?? "en") as "en" | "fr";
  return <ApiKeysClient user={{ email: user.email, role: user.role }} locale={locale} />;
}
