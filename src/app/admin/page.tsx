import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AdminDashboard from "./AdminDashboard";

export const metadata = { title: "Admin — InsiderTrades" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");
  return <AdminDashboard />;
}
