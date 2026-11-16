import { callBackend } from "./backend";

export async function dashboardRole(headers: Pick<Headers, "get">) {
  const response = await callBackend(headers, "/api/sessao");
  if (!response.ok) return null;
  const session = await response.json().catch(() => null);
  if (!session?.signedIn) return null;
  return session.role === "master" || session.role === "operator" ? session.role : null;
}
