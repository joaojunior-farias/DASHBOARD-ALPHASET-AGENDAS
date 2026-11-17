import { asc, eq } from "drizzle-orm";
import { getDb } from "./db/index.js";
import { calendarOptions, dashboardProfiles, dashboardUsers } from "./db/schema.js";
import { activeAdminSession, adminCookie, masterUsername } from "./server/admin-session.js";
import { acceptsJson, requestSite } from "./server/config.js";
import { readCookie } from "./server/cookies.js";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: Request) {
  if (requestSite(request.headers)?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  const session = await activeAdminSession(readCookie(request, adminCookie));
  if (!session) return json({ error: "Entre no painel para continuar." }, 401);
  const db = getDb();
  const [[profile], statuses] = await Promise.all([
    db.select().from(dashboardProfiles).where(eq(dashboardProfiles.subject, session.subject)),
    db.select({ id: calendarOptions.id, name: calendarOptions.name, color: calendarOptions.color }).from(calendarOptions)
      .where(eq(calendarOptions.kind, "status")).orderBy(asc(calendarOptions.name)),
  ]);
  const [operator] = session.role === "operator" && !profile
    ? await db.select({ username: dashboardUsers.usernameKey }).from(dashboardUsers).where(eq(dashboardUsers.id, session.subject)) : [];
  const name = profile?.displayName ?? (session.role === "master" ? masterUsername() : operator?.username ?? "Usuário");
  return json({ name, avatar: profile?.avatar ?? null, role: session.role, statuses });
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  if (!acceptsJson(request.headers, site.origin)) return json({ error: "Solicitação inválida." }, 403);
  const session = await activeAdminSession(readCookie(request, adminCookie));
  if (!session) return json({ error: "Entre no painel para continuar." }, 401);
  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return json({ error: "Dados inválidos." }, 400);
  const { name, avatar } = value as Record<string, unknown>;
  const displayName = typeof name === "string" ? name.trim().replace(/\s+/gu, " ") : "";
  if (displayName.length < 2 || displayName.length > 80 || /[\u0000-\u001f\u007f]/u.test(displayName)) {
    return json({ error: "Informe um nome de 2 a 80 caracteres." }, 400);
  }
  if (avatar !== null && (typeof avatar !== "string" || avatar.length > 48000 || !/^data:image\/jpeg;base64,\/9j\/[a-zA-Z0-9+/=]+$/.test(avatar))) {
    return json({ error: "Escolha uma foto de perfil válida." }, 400);
  }
  await getDb().insert(dashboardProfiles).values({ subject: session.subject, displayName, avatar })
    .onConflictDoUpdate({ target: dashboardProfiles.subject, set: { displayName, avatar } });
  return json({ name: displayName, avatar });
}
