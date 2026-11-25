import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "./db/index.js";
import { calendarEvents, calendarOptions, events, responses, manualPhotographerAssignments, photographers } from "./db/schema.js";
import { adminCookie, validAdminSession } from "./server/admin-session.js";
import { acceptsJson, loginRequired, requestSite } from "./server/config.js";
import { type EventDetails, isDistanceList, PERIODS, SPORTS, timePattern, uuidPattern, validDate } from "./agenda-model.js";

import { readCookie } from "./server/cookies.js";
import { signedInPhotographer } from "./server/photographer-session.js";
import { ensureInvite } from "./server/team-invite.js";

const responseFields = { name: responses.name, available: responses.available, selection: responses.selection, assignedByAdmin: responses.assignedByAdmin };
const adminResponseFields = { id: responses.id, ...responseFields };
type AdminReply = Pick<typeof responses.$inferSelect, keyof typeof adminResponseFields>;

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

function selectionVersion(replies: AdminReply[]) {
  // Changes to the candidates or their decisions invalidate a selection already open on screen.
  const candidates = replies.filter((reply) => reply.available || reply.assignedByAdmin).map(({ id, selection }) => `${id}:${selection ?? ""}`).sort();
  return createHash("sha256").update(candidates.join("\n")).digest("hex");
}

function eventDetails(input: Record<string, unknown>): EventDetails | null {
  const name = cleanName(input.name);
  const location = cleanName(input.location);
  const { date, time, meetingTime, distancesKm } = input;
  const period = PERIODS.find((value) => value === input.period);
  const sport = SPORTS.find((value) => value === input.sport);
  if (name.length < 2 || name.length > 100 || typeof date !== "string" || !validDate(date)
    || typeof time !== "string" || !timePattern.test(time)
    || (meetingTime != null && (typeof meetingTime !== "string" || !timePattern.test(meetingTime)))
    || (distancesKm !== undefined && !isDistanceList(distancesKm))
    || location.length < 2 || location.length > 160 || !period || !sport) return null;
  return { name, date, time, meetingTime, period, sport, location, distancesKm };
}

export async function GET(request: Request) {
  const site = requestSite(request.headers);
  if (!site) return error("Página indisponível.", 404);
  if (site.kind === "dashboard") {
    if (!await validAdminSession(readCookie(request, adminCookie))) {
      return error(loginRequired(site.kind), 401);
    }
    const db = getDb();
    const [rows, manual] = await Promise.all([
      db.select({ event: events, reply: adminResponseFields, accountId: photographers.id }).from(events)
        .leftJoin(responses, and(eq(responses.eventId, events.id), eq(responses.dateRevision, events.dateRevision)))
        .leftJoin(photographers, eq(responses.participantId, photographers.id))
        .orderBy(asc(events.date), asc(events.time), asc(events.id), asc(responses.name)),
      db.select({ id: manualPhotographerAssignments.id, eventId: manualPhotographerAssignments.eventId, name: manualPhotographerAssignments.name })
        .from(manualPhotographerAssignments).innerJoin(events, and(eq(events.id, manualPhotographerAssignments.eventId),
          eq(events.dateRevision, manualPhotographerAssignments.dateRevision))).orderBy(asc(manualPhotographerAssignments.name)),
    ]);
    const grouped = new Map<string, typeof events.$inferSelect & { replies: (AdminReply & { accountId: string | null })[]; manual: { id: string; name: string }[] }>();
    for (const { event, reply, accountId } of rows) {
      const entry = grouped.get(event.id) ?? { ...event, replies: [], manual: [] };
      if (reply) entry.replies.push({ ...reply, accountId });
      grouped.set(event.id, entry);
    }
    for (const { id, eventId, name } of manual) grouped.get(eventId)?.manual.push({ id, name });
    const invite = new URL(site.agenda);
    invite.hash = "convite=" + await ensureInvite();
    return json({ events: [...grouped.values()].map((event) => ({ ...event, selectionVersion: selectionVersion(event.replies) })), invite: invite.href });
  }

  const account = await signedInPhotographer(request);
  if (!account) {
    return error(loginRequired(site.kind), 401);
  }
  const rows = await getDb().select({
    event: { id: events.id, name: events.name, date: events.date, time: events.time, meetingTime: events.meetingTime,
      period: events.period, sport: events.sport, location: events.location, published: events.published, dateRevision: events.dateRevision,
      distancesKm: events.distancesKm },
    reply: { ...responseFields, dateRevision: responses.dateRevision },
  }).from(events)
    .leftJoin(responses, and(eq(responses.eventId, events.id), eq(responses.participantId, account.id)))
    .where(or(eq(events.published, true), isNotNull(responses.participantId)))
    .orderBy(asc(events.date), asc(events.time));
  return json({ events: rows.map(({ event, reply }) => ({
    ...event,
    reply: reply?.dateRevision === event.dateRevision ? { name: reply.name, available: reply.available, selection: reply.selection, assignedByAdmin: reply.assignedByAdmin } : null,
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
      const [event] = await tx.select({ dateRevision: events.dateRevision })
        .from(events).where(and(eq(events.id, eventId), eq(events.published, true))).for("no key update");
      if (!event) return error("Este evento não está disponível na agenda.", 404);
      if (event.dateRevision !== dateRevision) {
        return error("A data do evento mudou. Confira a nova data antes de responder.", 409);
      }

      const [reply] = await tx.insert(responses).values({ eventId, participantId: id, name, available, dateRevision })
        .onConflictDoUpdate({
          target: [responses.eventId, responses.participantId],
          set: {
            name, available, dateRevision, assignedByAdmin: false,
            selection: available ? sql`case when ${responses.dateRevision} = ${dateRevision} and (${responses.available} or ${responses.assignedByAdmin}) then ${responses.selection} end` : null,
          },
        }).returning(responseFields);
      return json({ reply });
    }, { isolationLevel: "read committed" });
  }

  if (site.kind !== "dashboard") return error("Solicitação inválida.", 404);
  if (!await validAdminSession(readCookie(request, adminCookie))) {
    return error(loginRequired(site.kind), 401);
  }
  const { action, eventId, dateRevision = 1 } = input;
  const db = getDb();
  if (action === "assign" || action === "remove-manual" || action === "unassign") return changeClosedTeam(input, action);
  if (action === "create" || action === "create-draft" || action === "create-calendar-card" || action === "update") {
    const details = eventDetails(input);
    if (!details) return error("Confira os dados do evento. As distâncias devem ser maiores que zero.", 400);
    if (action === "create-calendar-card") {
      const { calendarEventId } = input;
      if (typeof calendarEventId !== "string" || !uuidPattern.test(calendarEventId)) return error("Evento do calendário inválido.", 400);
      return db.transaction(async (tx) => {
        const [source] = await tx.select({ category: calendarOptions.code }).from(calendarEvents)
          .innerJoin(calendarOptions, eq(calendarEvents.categoryId, calendarOptions.id))
          .where(eq(calendarEvents.id, calendarEventId)).for("update", { of: calendarEvents });
        if (!source || source.category !== "sports") return error("Escolha um evento da categoria Esportivo.", 400);
        const [event] = await tx.insert(events).values({ id: randomUUID(), ...details, calendarEventId })
          .onConflictDoNothing({ target: events.calendarEventId }).returning();
        if (event) return json({ event }, 201);
        const [existing] = await tx.select().from(events).where(eq(events.calendarEventId, calendarEventId));
        return existing ? json({ event: existing }) : error("Atualize o calendário e tente novamente.", 409);
      });
    }
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
  if (action === "select-team" || action === "review-reply") {
    const individual = action === "review-reply";
    const { version, replyId } = input;
    const decision = input.selection === "confirmed" || input.selection === "declined" ? input.selection : null;
    const confirmedIds = Array.isArray(input.confirmedIds) ? input.confirmedIds : [];
    const validChoice = individual
      ? typeof replyId === "string" && uuidPattern.test(replyId) && decision !== null
      : Array.isArray(input.confirmedIds) && confirmedIds.every((id) => typeof id === "string" && uuidPattern.test(id));
    if (typeof eventId !== "string" || !uuidPattern.test(eventId) || !isPositiveInteger(dateRevision)
      || typeof version !== "string" || !/^[a-f0-9]{64}$/.test(version)
      || !validChoice) {
      return error("Confira a seleção de fotógrafos.", 400);
    }
    return db.transaction(async (tx) => {
      const [event] = await tx.select({ dateRevision: events.dateRevision, closed: events.closed })
        .from(events).where(eq(events.id, eventId)).for("no key update");
      if (!event) return error("Este evento foi removido da agenda.", 404);
      if (event.closed && !individual) return error("O card foi encerrado. Abra a escala para editar a equipe.", 409);
      const candidateFilter = and(eq(responses.eventId, eventId), eq(responses.dateRevision, dateRevision), or(eq(responses.available, true), eq(responses.assignedByAdmin, true)));
      const candidates = await tx.select(adminResponseFields).from(responses).where(candidateFilter);
      if (event.dateRevision !== dateRevision || selectionVersion(candidates) !== version) {
        return error("As inscrições ou a seleção mudaram. Reabra a seleção para ver a lista atual.", 409);
      }
      if (individual) {
        const candidate = candidates.find((reply) => reply.id === replyId && reply.available);
        if (!candidate) return error("Este fotógrafo não está inscrito na data atual deste evento.", 409);
        const [updated] = await tx.update(responses).set({ selection: decision })
          .where(and(candidateFilter, eq(responses.id, candidate.id))).returning(adminResponseFields);
        const current = candidates.map((reply) => reply.id === updated.id ? updated : reply);
        return json({ replies: [updated], selectionVersion: selectionVersion(current) });
      }
      const candidateIds = new Set(candidates.map(({ id }) => id));
      if (confirmedIds.some((id) => !candidateIds.has(id))) return error("Escolha fotógrafos inscritos neste evento.", 400);

      const replies = await tx.update(responses).set({
        selection: confirmedIds.length > 0
          ? sql`case when ${inArray(responses.id, confirmedIds)} then 'confirmed' else 'declined' end`
          : "declined",
      }).where(candidateFilter).returning(adminResponseFields);
      return json({ replies, selectionVersion: selectionVersion(replies) });
    }, { isolationLevel: "read committed" });
  }
  if (action === "publish" || action === "unpublish" || action === "close" || action === "reopen") {
    if (typeof eventId !== "string" || !uuidPattern.test(eventId)) return error("Evento inválido.", 400);
    const published = action === "publish";
    const closed = action === "close" ? true : action === "reopen" ? false : undefined;
    const [event] = await db.update(events).set({
      published, closed, hasBeenPublished: published ? true : sql`${events.hasBeenPublished} OR ${events.published}`,
    }).where(and(eq(events.id, eventId), published ? eq(events.closed, false) : undefined))
      .returning({ id: events.id, published: events.published, closed: events.closed });
    if (event) return json({ event });
    const [existing] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
    return existing ? error("Reabra o card antes de publicar.", 409) : error("Este evento foi excluído.", 404);
  }
  if (action === "remove") {
    if (typeof eventId !== "string" || !uuidPattern.test(eventId)) return error("Evento inválido.", 400);
    const removed = await db.delete(events).where(eq(events.id, eventId)).returning({ id: events.id });
    if (!removed.length) return error("Este evento foi removido da agenda.", 404);
    return json({ ok: true });
  }
  return error("Solicitação inválida.", 400);
}

async function changeClosedTeam(input: Record<string, unknown>, action: "assign" | "remove-manual" | "unassign") {
  const { eventId, dateRevision, photographerId, assignmentId } = input;
  const name = cleanName(input.name);
  if (typeof eventId !== "string" || !uuidPattern.test(eventId) || !isPositiveInteger(dateRevision)) {
    return error("Evento inválido.", 400);
  }
  const accountId = typeof photographerId === "string" && uuidPattern.test(photographerId) ? photographerId : null;
  const manualId = typeof assignmentId === "string" && uuidPattern.test(assignmentId) ? assignmentId : null;
  if ((action !== "assign" && !manualId)
    || (action === "assign" && !accountId && (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)))) {
    return error("Selecione um fotógrafo ou informe um nome de 2 a 80 caracteres.", 400);
  }
  return getDb().transaction(async (tx) => {
    const [event] = await tx.select({ closed: events.closed, dateRevision: events.dateRevision })
      .from(events).where(eq(events.id, eventId)).for("no key update");
    if (!event) return error("Este evento foi excluído.", 404);
    if (!event.closed || event.dateRevision !== dateRevision) return error("Atualize a escala de um card encerrado na data atual.", 409);
    if (action === "remove-manual" && manualId) {
      await tx.delete(manualPhotographerAssignments).where(and(eq(manualPhotographerAssignments.id, manualId),
        eq(manualPhotographerAssignments.eventId, eventId), eq(manualPhotographerAssignments.dateRevision, dateRevision)));
    } else if (action === "unassign" && manualId) {
      await tx.update(responses).set({ selection: "declined" }).where(and(eq(responses.eventId, eventId),
        eq(responses.id, manualId), eq(responses.dateRevision, dateRevision), eq(responses.selection, "confirmed")));
    } else if (accountId) {
      const [photo] = await tx.select({ id: photographers.id, name: photographers.name }).from(photographers).where(eq(photographers.id, accountId));
      if (!photo) return error("Fotógrafo não encontrado.", 404);
      await tx.insert(responses).values({ eventId, participantId: photo.id, name: photo.name, available: false, dateRevision, selection: "confirmed", assignedByAdmin: true })
        .onConflictDoUpdate({ target: [responses.eventId, responses.participantId],
          set: { name: photo.name, available: sql`${responses.dateRevision} = ${dateRevision} and ${responses.available}`,
            dateRevision, selection: "confirmed", assignedByAdmin: true } });
    } else {
      await tx.insert(manualPhotographerAssignments).values({ eventId, dateRevision, name }).onConflictDoNothing();
    }
    return json({ ok: true });
  });
}
