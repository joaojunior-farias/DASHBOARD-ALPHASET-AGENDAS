import { adminCookie, adminSessionSeconds, newAdminSession, validAdminSession, verifyAdminPassword } from "./server/admin-session.js";
import { acceptsJson, cookieOptions, requestSite } from "./server/config.js";
import { readCookie, writeCookie } from "./server/cookies.js";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function GET(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  return json({ signedIn: validAdminSession(readCookie(request, adminCookie)) });
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  if (!acceptsJson(request.headers, site.origin)) return json({ error: "Solicitação inválida." }, 403);

  let input: { action?: string; password?: unknown };
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

  if (!verifyAdminPassword(input.password)) return json({ error: "Senha incorreta." }, 401);
  writeCookie(result, adminCookie, newAdminSession(), cookieOptions(site.origin, adminSessionSeconds));
  return result;
}
