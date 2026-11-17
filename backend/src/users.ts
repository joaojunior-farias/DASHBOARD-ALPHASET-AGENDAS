import { asc, eq, sql } from "drizzle-orm";
import { uuidPattern } from "./agenda-model.js";
import { getDb } from "./db/index.js";
import { dashboardUsers, photographers, photographerSessions } from "./db/schema.js";
import { activeAdminSession, adminCookie, masterUsername, usernameKey } from "./server/admin-session.js";
import { acceptsJson, requestSite } from "./server/config.js";
import { readCookie } from "./server/cookies.js";
import { createDashboardUser } from "./server/dashboard-users.js";
import { passwordCredentials, validPassword } from "./server/passwords.js";

function json(value: unknown, status: number) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  if (requestSite(request.headers)?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  const session = await activeAdminSession(readCookie(request, adminCookie));
  if (!session) return json({ error: "Entre no painel para continuar." }, 401);
  const db = getDb();
  const team = await db.select({ id: photographers.id, name: photographers.name, email: photographers.email,
    mustChangePassword: photographers.mustChangePassword }).from(photographers).orderBy(asc(photographers.name), asc(photographers.email));
  if (session.role !== "master") return json({ photographers: team.map(({ id, name, email }) => ({ id, name, email })) }, 200);
  const users = await db.select({ id: dashboardUsers.id, name: dashboardUsers.usernameKey,
    mustChangePassword: dashboardUsers.mustChangePassword }).from(dashboardUsers).orderBy(asc(dashboardUsers.usernameKey));
  return json({ users, photographers: team, resetAvailable: validPassword(process.env.USER_RESET_PASSWORD) }, 200);
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  if (!acceptsJson(request.headers, site.origin)) return json({ error: "Solicitação inválida." }, 403);
  const session = await activeAdminSession(readCookie(request, adminCookie));
  if (!session) return json({ error: "Entre no painel para continuar." }, 401);
  if (session.role !== "master") return json({ error: "Somente a conta master pode gerenciar senhas e criar usuários." }, 403);

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return json({ error: "Solicitação inválida." }, 400);
    }
    body = value as Record<string, unknown>;
  } catch {
    return json({ error: "Solicitação inválida." }, 400);
  }

  if (body.action === "reset") return resetPassword(body);
  const username = usernameKey(body.username);
  if (!username) return json({ error: "Use um nome de usuário com 2 a 80 caracteres." }, 400);
  const { password } = body;
  if (!validPassword(password)) {
    return json({ error: "Use uma senha com 12 a 256 caracteres." }, 400);
  }

  if (username === usernameKey(masterUsername()) || !await createDashboardUser(username, password)) {
    return json({ error: "Já existe uma conta com esse nome de usuário." }, 409);
  }
  return json({ ok: true }, 201);
}

async function resetPassword(body: Record<string, unknown>) {
  const { id, kind } = body;
  if (typeof id !== "string" || !uuidPattern.test(id) || (kind !== "operator" && kind !== "photographer")) {
    return json({ error: "Escolha uma conta válida." }, 400);
  }
  const temporary = process.env.USER_RESET_PASSWORD;
  if (!validPassword(temporary)) return json({ error: "Configure USER_RESET_PASSWORD no backend com 12 a 256 caracteres." }, 409);
  const credentials = await passwordCredentials(temporary);
  const db = getDb();
  const updated = await db.transaction(async (tx) => {
    if (kind === "operator") {
      const [account] = await tx.update(dashboardUsers).set({
        ...credentials, mustChangePassword: true, passwordVersion: sql`${dashboardUsers.passwordVersion} + 1`,
      }).where(eq(dashboardUsers.id, id)).returning({ id: dashboardUsers.id });
      return Boolean(account);
    }
    const [account] = await tx.update(photographers).set({ ...credentials, mustChangePassword: true })
      .where(eq(photographers.id, id)).returning({ id: photographers.id });
    if (!account) return false;
    await tx.delete(photographerSessions).where(eq(photographerSessions.photographerId, id));
    return true;
  });
  return updated ? json({ ok: true }, 200) : json({ error: "Conta indisponível." }, 404);
}
