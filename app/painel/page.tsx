import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requestSite } from "@/server/config";

export default async function PanelShortcut() {
  if (requestSite(await headers())?.kind !== "dashboard") notFound();
  redirect("/");
}
