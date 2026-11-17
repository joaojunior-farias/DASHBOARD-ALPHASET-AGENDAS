import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requestSite } from "@/server/config";
import { dashboardRole } from "@/server/dashboard-session";
import { UsersManager } from "./users-manager";

export default async function UsersPage() {
  const incoming = await headers();
  if (requestSite(incoming)?.kind !== "dashboard") notFound();
  const role = await dashboardRole(incoming);
  if (!role) redirect("/entrar");
  if (role !== "master") redirect("/");
  return <UsersManager />;
}
