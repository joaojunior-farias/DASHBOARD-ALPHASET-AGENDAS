import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { dashboardRole } from "@/server/dashboard-session";
import { requestSite } from "@/server/config";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const incoming = await headers();
  if (requestSite(incoming)?.kind !== "dashboard") notFound();
  if (await dashboardRole(incoming)) redirect("/");
  return (
    <main className="main login-page">
      <div className="brand"><img src="/alpha-set.png" alt="Alpha Set" width="480" height="192" /></div>
      <div className="login-card">
        <h1>Entrar no painel</h1>
        <LoginForm />
      </div>
    </main>
  );
}
