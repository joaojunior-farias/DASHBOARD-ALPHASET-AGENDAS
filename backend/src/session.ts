import {
  type AdminSession, adminCookie, adminSessionSeconds, masterUsername, newAdminSession,
  readAdminSession, usernameKey, verifyMasterPassword,
} from "./server/admin-session.js";
import { acceptsJson, cookieOptions, requestSite } from "./server/config.js";
import { readCookie, writeCookie } from "./server/cookies.js";
import { authenticateDashboardUser } from "./server/dashboard-users.js";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function GET(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  const session = readAdminSession(readCookie(request, adminCookie));
  return json(session ? { signedIn: true, role: session.role } : { signedIn: false });
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  if (!acceptsJson(request.headers, site.origin)) return json({ error: "Solicitação inválida." }, 403);

  let input: { action?: unknown; username?: unknown; password?: unknown };
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

  const session = await authenticate(input.username, input.password);
  if (!session) return json({ error: "Usuário ou senha incorretos." }, 401);
  writeCookie(result, adminCookie, newAdminSession(session), cookieOptions(site.origin, adminSessionSeconds));
  return result;
}

async function authenticate(usernameValue: unknown, password: unknown): Promise<AdminSession | null> {
  const username = usernameKey(usernameValue);
  if (!username || typeof password !== "string" || password.length > 256) return null;
  if (username === usernameKey(masterUsername())) {
    return verifyMasterPassword(password) ? { role: "master", subject: "master" } : null;
  }
  const id = await authenticateDashboardUser(username, password);
  return id ? { role: "operator", subject: id } : null;
}
