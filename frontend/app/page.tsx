import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requestSite } from "@/server/config";
import { dashboardRole } from "@/server/dashboard-session";
import { Agenda } from "./agenda";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ evento?: string | string[]; novo?: string; link?: string; encerrados?: string }> }) {
  const incoming = await headers();
  const site = requestSite(incoming);
  if (!site) notFound();
  if (site.kind === "agenda") return <Agenda mode="photographer" />;

  const role = await dashboardRole(incoming);
  if (!role) redirect("/entrar");
  const { evento, novo, link, encerrados } = await searchParams;
  const initialEventId = typeof evento === "string" ? evento : undefined;
  const initialPanel = novo === "1" ? "event" : link === "1" ? "invite" : undefined;
  const closedOnly = encerrados === "1";
  return <Agenda key={JSON.stringify([initialEventId, initialPanel, closedOnly])} mode="admin"
    initialEventId={initialEventId} initialPanel={initialPanel} closedOnly={closedOnly} />;
}
