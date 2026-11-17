import { asc, eq, sql } from "drizzle-orm";
import { uuidPattern } from "./agenda-model.js";
import { getDb } from "./db/index.js";
import { clients } from "./db/schema.js";
import { adminCookie, validAdminSession } from "./server/admin-session.js";
import { acceptsJson, requestSite } from "./server/config.js";
import { readCookie } from "./server/cookies.js";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

export async function GET(request: Request) {
  if (requestSite(request.headers)?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  if (!await validAdminSession(readCookie(request, adminCookie))) return json({ error: "Entre no painel para continuar." }, 401);
  const rows = await getDb().select().from(clients).orderBy(asc(sql`lower(${clients.name})`), asc(clients.id));
  return json({ clients: rows });
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  if (!await validAdminSession(readCookie(request, adminCookie))) return json({ error: "Entre no painel para continuar." }, 401);
  if (!acceptsJson(request.headers, site.origin)) return json({ error: "Solicitação inválida." }, 403);
  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return json({ error: "Dados inválidos." }, 400);
  const input = value as Record<string, unknown>;
  const { id } = input;
  const name = cleanText(input.name);
  const email = cleanText(input.email).toLowerCase();
  const phone = cleanText(input.phone);
  if (typeof id !== "string" || !uuidPattern.test(id) || name.length < 2 || name.length > 100
    || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    || phone.length > 40 || /[\u0000-\u001f\u007f]/u.test(name + email + phone)) {
    return json({ error: "Confira o nome, o e-mail e o telefone do cliente." }, 400);
  }
  const db = getDb();
  const [created] = await db.insert(clients).values({ id, name, email, phone }).onConflictDoNothing({ target: clients.id }).returning();
  if (created) return json({ client: created }, 201);
  const [saved] = await db.select().from(clients).where(eq(clients.id, id));
  return json({ client: saved });
}
