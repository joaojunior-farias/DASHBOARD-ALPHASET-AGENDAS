import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requestSite } from "@/server/config";
import { dashboardRole } from "@/server/dashboard-session";
import { Agenda } from "./agenda";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ evento?: string | string[] }> }) {
  const incoming = await headers();
  const site = requestSite(incoming);
  if (!site) notFound();
  if (site.kind === "agenda") return <Agenda mode="photographer" />;

  const role = await dashboardRole(incoming);
  if (!role) redirect("/entrar");
  const { evento } = await searchParams;
  return <Agenda mode="admin" canManageUsers={role === "master"} initialEventId={typeof evento === "string" ? evento : undefined} />;
}
