import {
  type AdminSession, adminCookie, adminSessionSeconds, masterUsername, newAdminSession,
  activeAdminSession, usernameKey, verifyMasterPassword,
} from "./server/admin-session.js";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./db/index.js";
import { dashboardUsers } from "./db/schema.js";
import { acceptsJson, cookieOptions, requestSite } from "./server/config.js";
import { readCookie, writeCookie } from "./server/cookies.js";
import { authenticateDashboardUser } from "./server/dashboard-users.js";
import { passwordCredentials, validPassword } from "./server/passwords.js";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  const session = await activeAdminSession(readCookie(request, adminCookie));
  return json(session ? { signedIn: true, role: session.role } : { signedIn: false });
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  if (!acceptsJson(request.headers, site.origin)) return json({ error: "Solicitação inválida." }, 403);

  let input: { action?: unknown; username?: unknown; password?: unknown; newPassword?: unknown };
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return json({ error: "Solicitação inválida." }, 400);
    }
    input = value;
  } catch {
    return json({ error: "Solicitação inválida." }, 400);
  }

  const result = json({ ok: true });
  if (input.action === "sair") {
    writeCookie(result, adminCookie, "", cookieOptions(site.origin, 0));
    return result;
  }

  const username = usernameKey(input.username);
  const { password, newPassword } = input;
  const invalid = () => json({ error: "Usuário ou senha incorretos." }, 401);
  if (!username || typeof password !== "string" || password.length > 256) return invalid();
  let session: AdminSession;
  if (username === usernameKey(masterUsername())) {
    if (input.action === "trocar-senha" || !verifyMasterPassword(password)) return invalid();
    session = { role: "master", subject: "master" };
  } else {
    const account = await authenticateDashboardUser(username, password);
    if (!account) return invalid();
    if (account.mustChangePassword && input.action !== "trocar-senha") {
      const required = json({ changeRequired: true }, 428);
      writeCookie(required, adminCookie, "", cookieOptions(site.origin, 0));
      return required;
    }
    let version = account.passwordVersion;
    if (input.action === "trocar-senha") {
      if (!account.mustChangePassword) return invalid();
      if (!validPassword(newPassword) || newPassword === password) {
        return json({ error: "Escolha uma senha nova, diferente da temporária, com 12 a 256 caracteres." }, 400);
      }
      const [changed] = await getDb().update(dashboardUsers).set({
        ...await passwordCredentials(newPassword), mustChangePassword: false, passwordVersion: sql`${dashboardUsers.passwordVersion} + 1`,
      }).where(and(eq(dashboardUsers.id, account.id), eq(dashboardUsers.passwordVersion, account.passwordVersion)))
        .returning({ version: dashboardUsers.passwordVersion });
      if (!changed) return invalid();
      version = changed.version;
    }
    session = { role: "operator", subject: account.id, version };
  }
  writeCookie(result, adminCookie, newAdminSession(session), cookieOptions(site.origin, adminSessionSeconds));
  return result;
}
