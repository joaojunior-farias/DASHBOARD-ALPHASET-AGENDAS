import { randomUUID } from "node:crypto";
import { and, asc, count, eq, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "./db/index.js";
import { events, responses } from "./db/schema.js";
import { adminCookie, validAdminSession } from "./server/admin-session.js";
import { acceptsJson, loginRequired, requestSite } from "./server/config.js";
import { type EventDetails, PERIODS, SPORTS, validDate } from "./agenda-model.js";

import { readCookie } from "./server/cookies.js";
import { signedInPhotographer } from "./server/photographer-session.js";
import { ensureInvite, invitedParticipant } from "./server/team-invite.js";

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const responseFields = { name: responses.name, available: responses.available };
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function error(message: string, status: number) {
  return json({ error: message }, status);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 2_147_483_647;
}

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

function isDistanceList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((km) => typeof km === "number" && Number.isFinite(km) && km > 0);
}

function eventDetails(input: Record<string, unknown>): EventDetails | null {
  const name = cleanName(input.name);
  const location = cleanName(input.location);
  const { date, time, meetingTime, photographerLimit, distancesKm } = input;
  const period = PERIODS.find((value) => value === input.period);
  const sport = SPORTS.find((value) => value === input.sport);
  if (name.length < 2 || name.length > 100 || typeof date !== "string" || !validDate(date)
    || typeof time !== "string" || !timePattern.test(time)
    || (meetingTime != null && (typeof meetingTime !== "string" || !timePattern.test(meetingTime)))
    || (photographerLimit != null && !isPositiveInteger(photographerLimit))
    || (distancesKm !== undefined && !isDistanceList(distancesKm))
    || location.length < 2 || location.length > 160 || !period || !sport) return null;
  return { name, date, time, meetingTime, period, sport, location, photographerLimit, distancesKm: sport === "Corrida" ? distancesKm : [] };
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

  const account = await signedInPhotographer(request);
  if (!account) {
    return json({ error: loginRequired(site.kind), canRegister: Boolean(await invitedParticipant(request)) }, 401);
  }
  const rows = await getDb().select({
    event: { id: events.id, name: events.name, date: events.date, time: events.time, meetingTime: events.meetingTime,
      period: events.period, sport: events.sport, location: events.location, published: events.published, dateRevision: events.dateRevision,
      photographerLimit: events.photographerLimit, distancesKm: events.distancesKm },
    reply: { ...responseFields, dateRevision: responses.dateRevision },
    confirmedCount: sql<number>`case when ${events.photographerLimit} is null then 0 else (
      select count(*)::int from ${responses}
      where ${responses.eventId} = ${events.id} and ${responses.dateRevision} = ${events.dateRevision} and ${responses.available}
    ) end`,
  }).from(events)
    .leftJoin(responses, and(eq(responses.eventId, events.id), eq(responses.participantId, account.id)))
    .where(or(eq(events.published, true), isNotNull(responses.participantId)))
    .orderBy(asc(events.date), asc(events.time));
  return json({ events: rows.map(({ event, reply, confirmedCount }) => ({
    ...event,
    confirmedCount,
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

  if (site.kind === "agenda" && input.action === "reply") {
    const account = await signedInPhotographer(request);
    if (!account) return error(loginRequired(site.kind), 401);
    const { id, name } = account;
    const { eventId, available, dateRevision = 1 } = input;
    if (typeof available !== "boolean" || typeof eventId !== "string" || !uuidPattern.test(eventId)) {
      return error("Confira a opção de disponibilidade.", 400);
    }
    if (!isPositiveInteger(dateRevision)) return error("Atualize a agenda antes de responder.", 400);
    return getDb().transaction(async (tx) => {
      const [event] = await tx.select({ dateRevision: events.dateRevision, photographerLimit: events.photographerLimit })
        .from(events).where(and(eq(events.id, eventId), eq(events.published, true))).for("no key update");
      if (!event) return error("Este evento não está disponível na agenda.", 404);
      if (event.dateRevision !== dateRevision) {
        return error("A data do evento mudou. Confira a nova data antes de responder.", 409);
      }

      let confirmedCount = 0;
      if (event.photographerLimit !== null) {
        // Count in a separate statement after locking the event so concurrent replies share the same capacity.
        const [{ total, alreadyConfirmed }] = await tx.select({
          total: count(),
          alreadyConfirmed: sql<boolean>`coalesce(bool_or(${responses.participantId} = ${id}::uuid), false)`,
        }).from(responses).where(and(eq(responses.eventId, eventId), eq(responses.dateRevision, dateRevision), sql`${responses.available}`));
        if (total >= event.photographerLimit && !alreadyConfirmed) {
          return error("As vagas para este evento já foram preenchidas.", 409);
        }
        confirmedCount = total + Number(available) - Number(alreadyConfirmed);
      }

      await tx.insert(responses).values({ eventId, participantId: id, name, available, dateRevision })
        .onConflictDoUpdate({
          target: [responses.eventId, responses.participantId],
          set: { name, available, dateRevision },
        });
      return json({ reply: { name, available }, confirmedCount });
    }, { isolationLevel: "read committed" });
  }

  if (site.kind !== "dashboard") return error("Solicitação inválida.", 404);
  if (!validAdminSession(readCookie(request, adminCookie))) {
    return error(loginRequired(site.kind), 401);
  }
  const { action, eventId, dateRevision = 1 } = input;
  const db = getDb();
  if (action === "create" || action === "create-draft" || action === "update") {
    const details = eventDetails(input);
    if (!details) return error("Confira os dados do evento. O limite deve ser um número inteiro positivo e as distâncias devem ser maiores que zero.", 400);
    if (action !== "update") {
      const [event] = await db.insert(events).values({ id: randomUUID(), ...details }).returning();
      return json({ event }, 201);
    }
    if (typeof eventId !== "string" || !uuidPattern.test(eventId)) return error("Evento inválido.", 400);
    if (!isPositiveInteger(dateRevision)) return error("Atualize a agenda antes de editar.", 400);
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
  if (action === "publish" || action === "unpublish") {
    if (typeof eventId !== "string" || !uuidPattern.test(eventId)) return error("Evento inválido.", 400);
    const published = action === "publish";
    const [event] = await db.update(events).set({
      published, hasBeenPublished: published ? true : sql`${events.hasBeenPublished} OR ${events.published}`,
    }).where(eq(events.id, eventId))
      .returning({ id: events.id });
    return event ? json({ ok: true }) : error("Este evento foi excluído.", 404);
  }
  if (action === "remove") {
    if (typeof eventId !== "string" || !uuidPattern.test(eventId)) return error("Evento inválido.", 400);
    const removed = await db.delete(events).where(eq(events.id, eventId)).returning({ id: events.id });
    if (!removed.length) return error("Este evento foi removido da agenda.", 404);
    return json({ ok: true });
  }
  return error("Solicitação inválida.", 400);
}
