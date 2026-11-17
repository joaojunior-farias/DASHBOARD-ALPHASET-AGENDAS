import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requestSite } from "@/server/config";
import { dashboardRole } from "@/server/dashboard-session";
import { ClientsManager } from "./clients-manager";

export default async function ClientsPage() {
  const incoming = await headers();
  if (requestSite(incoming)?.kind !== "dashboard") notFound();
  if (!await dashboardRole(incoming)) redirect("/entrar");
  return <ClientsManager />;
}
