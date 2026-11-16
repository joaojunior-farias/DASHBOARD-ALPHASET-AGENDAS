import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requestSite } from "@/server/config";
import { Agenda } from "./agenda";

export default async function HomePage() {
  const site = requestSite(await headers());
  if (!site) notFound();
  return <Agenda mode={site.kind === "dashboard" ? "admin" : "photographer"} />;
}
