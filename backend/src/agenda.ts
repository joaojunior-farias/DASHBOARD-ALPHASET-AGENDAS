import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "./db/index.js";
import { events, responses, settings } from "./db/schema.js";
import { adminCookie, validAdminSession } from "./server/admin-session.js";
import { acceptsJson, cookieOptions, loginRequired, requestSite } from "./server/config.js";
import { type EventDetails, PERIODS, SPORTS, validDate } from "./agenda-model.js";

import { readCookie, writeCookie } from "./server/cookies.js";

const inviteKey = "team-invite";
const sessionCookie = "alpha_set_equipe";
const tokenPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const responseFields = { name: responses.name, available: responses.available };

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function error(message: string, status: number) {
  return json({ error: message }, status);
}

function isDateRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

function eventDetails(input: Record<string, unknown>): EventDetails | null {
  const name = cleanName(input.name);
  const location = cleanName(input.location);
  const { date, time } = input;
  const period = PERIODS.find((value) => value === input.period);
  const sport = SPORTS.find((value) => value === input.sport);
  if (name.length < 2 || name.length > 100 || typeof date !== "string" || !validDate(date)
    || typeof time !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
    || location.length < 2 || location.length > 160 || !period || !sport) return null;
  return { name, date, time, period, sport, location };
}

async function findInvite() {
  const [row] = await getDb().select({ value: settings.value }).from(settings)
    .where(eq(settings.key, inviteKey));
  return row?.value;
}

async function ensureInvite() {
  const original = await findInvite();
  if (original) return original;
  const value = randomBytes(32).toString("hex");
  const [created] = await getDb().insert(settings).values({ key: inviteKey, value })
    .onConflictDoNothing().returning({ value: settings.value });
  const invite = created?.value ?? await findInvite();
  if (!invite) throw new Error("Falha ao carregar o convite da equipe.");
  return invite;
}

function sessionParts(request: Request) {
  const [token, id] = (readCookie(request, sessionCookie) ?? "").split(".");
  return tokenPattern.test(token) && uuidPattern.test(id) ? { token, id } : null;
}

async function participantId(request: Request) {
  const session = sessionParts(request);
  return session && session.token === await findInvite() ? session.id : null;
}

export async function GET(request: Request) {
  const site = requestSite(request.headers);
  if (!site) return error("Página indisponível.", 404);
  if (site.kind === "dashboard") {
    if (!validAdminSession(readCookie(request, adminCookie))) {
      return error(loginRequired(site.kind), 401);
    }
    const rows = await getDb().select({ event: events, reply: responseFields }).from(events)
      .leftJoin(responses, and(eq(responses.eventId, events.id), eq(responses.dateRevision, events.dateRevision)))
      .orderBy(asc(events.date), asc(events.time), asc(events.id), asc(responses.name));
    const grouped = new Map<string, typeof events.$inferSelect & { replies: { name: string; available: boolean }[] }>();
    for (const { event, reply } of rows) {
      const entry = grouped.get(event.id) ?? { ...event, replies: [] };
      if (reply) entry.replies.push(reply);
      grouped.set(event.id, entry);
    }
    const invite = new URL(site.agenda);
    invite.hash = "convite=" + await ensureInvite();
    return json({ events: [...grouped.values()], invite: invite.href });
  }

  const id = await participantId(request);
  if (!id) return error(loginRequired(site.kind), 401);
  const rows = await getDb().select({
    event: events,
    reply: { ...responseFields, dateRevision: responses.dateRevision },
  }).from(events)
    .leftJoin(responses, and(eq(responses.eventId, events.id), eq(responses.participantId, id)))
    .orderBy(asc(events.date), asc(events.time));
  return json({ events: rows.map(({ event, reply }) => ({
    ...event,
    reply: reply?.dateRevision === event.dateRevision ? { name: reply.name, available: reply.available } : null,
    needsReconfirmation: reply !== null && reply.dateRevision !== event.dateRevision,
  })) });
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (!site) return error("Página indisponível.", 404);
  if (!acceptsJson(request.headers, site.origin)) return error("Solicitação inválida.", 403);
  let input: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return error("Dados inválidos.", 400);
    }
    input = value as Record<string, unknown>;
  } catch {
    return error("Dados inválidos.", 400);
  }

  if (site.kind === "agenda" && input.action === "join") {
    const { token } = input;
    if (typeof token !== "string" || !tokenPattern.test(token) || token !== await findInvite()) {
      return error("Este convite é inválido. Peça o link da agenda à Alpha Set.", 403);
    }
    const previous = sessionParts(request);
    const id = previous?.token === token ? previous.id : randomUUID();
    const result = json({ ok: true });
    writeCookie(result, sessionCookie, token + "." + id, cookieOptions(site.origin, 60 * 60 * 24 * 365));
    return result;
  }

  if (site.kind === "agenda" && input.action === "reply") {
    const id = await participantId(request);
    if (!id) return error("Abra o link de convite para enviar sua resposta.", 401);
    const name = cleanName(input.name);
    const { eventId, available, dateRevision = 1 } = input;
    if (name.length < 2 || name.length > 80 || typeof available !== "boolean"
      || typeof eventId !== "string" || !uuidPattern.test(eventId)) {
      return error("Confira seu nome e a opção de disponibilidade.", 400);
    }
    if (!isDateRevision(dateRevision)) return error("Atualize a agenda antes de responder.", 400);
    return getDb().transaction(async (tx) => {
      const [event] = await tx.select({ dateRevision: events.dateRevision })
        .from(events).where(eq(events.id, eventId)).for("share");
      if (!event) return error("Este evento foi removido da agenda.", 404);
      if (event.dateRevision !== dateRevision) {
        return error("A data do evento mudou. Confira a nova data antes de responder.", 409);
      }

      await tx.insert(responses).values({ eventId, participantId: id, name, available, dateRevision })
        .onConflictDoUpdate({
          target: [responses.eventId, responses.participantId],
          set: { name, available, dateRevision },
        });
      return json({ reply: { name, available } });
    });
  }

  if (site.kind !== "dashboard") return error("Solicitação inválida.", 404);
  if (!validAdminSession(readCookie(request, adminCookie))) {
    return error(loginRequired(site.kind), 401);
  }
  const { action, eventId, dateRevision = 1 } = input;
  const db = getDb();
  if (action === "create" || action === "update") {
    const details = eventDetails(input);
    if (!details) return error("Confira o nome, a data, o horário, a localização, o período e a modalidade.", 400);
    if (action === "create") {
      const [event] = await db.insert(events).values({ id: randomUUID(), ...details }).returning();
      return json({ event }, 201);
    }
    if (typeof eventId !== "string" || !uuidPattern.test(eventId)) return error("Evento inválido.", 400);
    if (!isDateRevision(dateRevision)) return error("Atualize a agenda antes de editar.", 400);
    const [updated] = await db.update(events).set({
      ...details,
      dateRevision: sql`case when ${events.date} <> ${details.date}::date then ${events.dateRevision} + 1 else ${events.dateRevision} end`,
    }).where(and(eq(events.id, eventId), eq(events.dateRevision, dateRevision))).returning();
    if (updated) return json({ event: updated });
    const [current] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
    return current
      ? error("A data do evento mudou. Reabra o evento para editar a versão atual.", 409)
      : error("Este evento foi removido da agenda.", 404);
  }
  if (action === "remove") {
    if (typeof eventId !== "string" || !uuidPattern.test(eventId)) return error("Evento inválido.", 400);
    const removed = await db.delete(events).where(eq(events.id, eventId)).returning({ id: events.id });
    if (!removed.length) return error("Este evento foi removido da agenda.", 404);
    return json({ ok: true });
  }
  return error("Solicitação inválida.", 400);
}
