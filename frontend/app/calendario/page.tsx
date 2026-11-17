import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requestSite } from "@/server/config";
import { dashboardRole } from "@/server/dashboard-session";
import { WorkCalendar } from "./work-calendar";
import "./calendar.css";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ status?: string; configuracoes?: string }> }) {
  const incoming = await headers();
  if (requestSite(incoming)?.kind !== "dashboard") notFound();
  if (!await dashboardRole(incoming)) redirect("/entrar");
  const { status, configuracoes } = await searchParams;
  const settings = configuracoes === "1";
  const statusId = typeof status === "string" && !settings ? status : undefined;
  return <WorkCalendar key={settings ? "settings" : statusId ?? "calendar"} settings={settings} statusId={statusId} />;
}
