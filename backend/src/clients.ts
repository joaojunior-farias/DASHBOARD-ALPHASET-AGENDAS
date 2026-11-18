import { and, asc, eq, sql } from "drizzle-orm";
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
  const query = new URL(request.url).searchParams.get("busca");
  if (query !== null && query.length > 100) return json({ error: "Digite até 100 caracteres para buscar." }, 400);
  const normalized = (query ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
  const pattern = "%" + normalized.replace(/[\\%_]/g, "\\$&") + "%";
  const rowsQuery = getDb().select().from(clients).where(query === null ? undefined : sql`
    translate(lower(${clients.name}), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') like ${pattern}
  `).orderBy(asc(sql`lower(${clients.name})`), asc(clients.id));
  const rows = await (query === null ? rowsQuery : rowsQuery.limit(4));
  return json({ clients: query === null ? rows : rows.slice(0, 3), hasMore: query !== null && rows.length > 3 });
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return json({ error: "Página indisponível." }, 404);
  if (!await validAdminSession(readCookie(request, adminCookie))) return json({ error: "Entre no painel para continuar." }, 401);
  if (!acceptsJson(request.headers, site.origin)) return json({ error: "Solicitação inválida." }, 403);
  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return json({ error: "Dados inválidos." }, 400);
  const input = value as Record<string, unknown>;
  const { id, version } = input;
  const action = input.action ?? "create";
  const name = cleanText(input.name);
  const email = cleanText(input.email).toLowerCase();
  const phone = cleanText(input.phone);
  if ((action !== "create" && action !== "quick-create" && action !== "update") || typeof id !== "string" || !uuidPattern.test(id)
    || name.length < 2 || name.length > 100
    || email.length > 254 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    || phone.length > 40 || /[\u0000-\u001f\u007f]/u.test(name + email + phone)) {
    return json({ error: "Confira o nome, o e-mail e o telefone do cliente." }, 400);
  }
  const db = getDb();
  if (action === "update") {
    if (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > 2_147_483_647) {
      return json({ error: "Reabra o cadastro para editar a versão atual." }, 400);
    }
    const [updated] = await db.update(clients).set({ name, email, phone, version: sql`${clients.version} + 1` })
      .where(and(eq(clients.id, id), eq(clients.version, version))).returning();
    if (updated) return json({ client: updated });
    const [existing] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id));
    return json({ error: existing ? "O cadastro foi alterado. Reabra para editar a versão atual." : "Cliente indisponível." }, existing ? 409 : 404);
  }
  if (action === "quick-create") {
    const key = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"client:" + key}, 0))`);
      const [existing] = await tx.select().from(clients).where(sql`
        translate(lower(${clients.name}), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') = ${key}
      `).orderBy(asc(clients.id)).limit(1);
      if (existing) return json({ client: existing });
      const [created] = await tx.insert(clients).values({ id, name, email, phone }).onConflictDoNothing({ target: clients.id }).returning();
      if (created) return json({ client: created }, 201);
      const [saved] = await tx.select().from(clients).where(eq(clients.id, id));
      return json({ client: saved });
    });
  }
  const [created] = await db.insert(clients).values({ id, name, email, phone }).onConflictDoNothing({ target: clients.id }).returning();
  if (created) return json({ client: created }, 201);
  const [saved] = await db.select().from(clients).where(eq(clients.id, id));
  return json({ client: saved });
}
