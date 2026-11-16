import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { adminCookie, validAdminSession } from "@/server/admin-session";
import { requestSite } from "@/server/config";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (requestSite(await headers())?.kind !== "dashboard") notFound();
  if (validAdminSession((await cookies()).get(adminCookie)?.value)) redirect("/");
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
