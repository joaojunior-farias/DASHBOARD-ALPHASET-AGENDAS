import { adminCookie, masterUsername, readAdminSession, usernameKey } from "./server/admin-session.js";
import { acceptsJson, requestSite } from "./server/config.js";
import { readCookie } from "./server/cookies.js";
import { createDashboardUser } from "./server/dashboard-users.js";

function json(value: unknown, status: number) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  if (!acceptsJson(request.headers, site.origin)) return json({ error: "Solicitação inválida." }, 403);
  const session = readAdminSession(readCookie(request, adminCookie));
  if (!session) return json({ error: "Entre no painel para continuar." }, 401);
  if (session.role !== "master") return json({ error: "A criação de usuários é exclusiva da conta master." }, 403);

  let body: { username?: unknown; password?: unknown };
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return json({ error: "Solicitação inválida." }, 400);
    }
    body = value;
  } catch {
    return json({ error: "Solicitação inválida." }, 400);
  }

  const username = usernameKey(body.username);
  if (!username) return json({ error: "Use um nome de usuário com 2 a 80 caracteres." }, 400);
  const { password } = body;
  if (typeof password !== "string" || password.length < 12 || password.length > 256 || !password.trim()) {
    return json({ error: "Use uma senha com 12 a 256 caracteres." }, 400);
  }

  if (username === usernameKey(masterUsername()) || !await createDashboardUser(username, password)) {
    return json({ error: "Já existe uma conta com esse nome de usuário." }, 409);
  }
  return json({ ok: true }, 201);
}
