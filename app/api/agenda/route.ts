import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { events, responses, settings } from "@/db/schema";
import { adminCookie, validAdminSession } from "@/server/admin-session";
import { acceptsJson, cookieOptions, loginRequired, requestSite } from "@/server/config";
import { type EventDetails, PERIODS, SPORTS, validDate } from "../../agenda-model";

export const dynamic = "force-dynamic";

const inviteKey = "team-invite";
const sessionCookie = "alpha_set_equipe";
const tokenPattern = /^[a-f0-9]{64}$/;
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const responseFields = { name: responses.name, available: responses.available };

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function error(message: string, status: number) {
  return json({ error: message }, status);
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

function sessionParts(request: NextRequest) {
  const [token, id] = (request.cookies.get(sessionCookie)?.value ?? "").split(".");
  return tokenPattern.test(token) && uuidPattern.test(id) ? { token, id } : null;
}

async function participantId(request: NextRequest) {
  const session = sessionParts(request);
  return session && session.token === await findInvite() ? session.id : null;
}

export async function GET(request: NextRequest) {
  const site = requestSite(request.headers);
  if (!site) return error("Página indisponível.", 404);
  if (site.kind === "dashboard") {
    if (!validAdminSession(request.cookies.get(adminCookie)?.value)) {
      return error(loginRequired(site.kind), 401);
    }
    const db = getDb();
    const allEvents = await db.select().from(events).orderBy(asc(events.date), asc(events.time));
    const allReplies = await db.select({ eventId: responses.eventId, ...responseFields })
      .from(responses).orderBy(asc(responses.name));
    const grouped = new Map<string, { name: string; available: boolean }[]>();
    for (const { eventId, ...reply } of allReplies) {
      const list = grouped.get(eventId) ?? [];
      list.push(reply);
      grouped.set(eventId, list);
    }
    const invite = new URL(site.agenda);
    invite.hash = "convite=" + await ensureInvite();
    return json({
      events: allEvents.map((event) => ({ ...event, replies: grouped.get(event.id) ?? [] })),
      invite: invite.href,
    });
  }

  const id = await participantId(request);
  if (!id) return error(loginRequired(site.kind), 401);
  const rows = await getDb().select({ event: events, reply: responseFields }).from(events)
    .leftJoin(responses, and(eq(responses.eventId, events.id), eq(responses.participantId, id)))
    .orderBy(asc(events.date), asc(events.time));
  return json({ events: rows.map(({ event, reply }) => ({ ...event, reply })) });
}

export async function POST(request: NextRequest) {
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
    result.cookies.set(sessionCookie, token + "." + id, cookieOptions(site.origin, 60 * 60 * 24 * 365));
    return result;
  }

  if (site.kind === "agenda" && input.action === "reply") {
    const id = await participantId(request);
    if (!id) return error("Abra o link de convite para enviar sua resposta.", 401);
    const name = cleanName(input.name);
    const { eventId, available } = input;
    if (name.length < 2 || name.length > 80 || typeof available !== "boolean"
      || typeof eventId !== "string" || !uuidPattern.test(eventId)) {
      return error("Confira seu nome e a opção de disponibilidade.", 400);
    }
    const db = getDb();
    try {
      await db.insert(responses).values({ eventId, participantId: id, name, available })
        .onConflictDoUpdate({
          target: [responses.eventId, responses.participantId],
          set: { name, available },
        });
    } catch (cause) {
      const [event] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
      if (!event) return error("Este evento foi removido da agenda.", 404);
      throw cause;
    }
    return json({ reply: { name, available } });
  }

  if (site.kind !== "dashboard") return error("Solicitação inválida.", 404);
  if (!validAdminSession(request.cookies.get(adminCookie)?.value)) {
    return error(loginRequired(site.kind), 401);
  }
  const { action, eventId } = input;
  const db = getDb();
  if (action === "create" || action === "update") {
    const details = eventDetails(input);
    if (!details) return error("Confira o nome, a data, o horário, a localização, o período e a modalidade.", 400);
    if (action === "create") {
      const event = { id: randomUUID(), ...details };
      await db.insert(events).values(event);
      return json({ event }, 201);
    }
    if (typeof eventId !== "string" || !uuidPattern.test(eventId)) return error("Evento inválido.", 400);
    const updated = await db.update(events).set(details).where(eq(events.id, eventId)).returning();
    if (!updated.length) return error("Este evento foi removido da agenda.", 404);
    return json({ event: updated[0] });
  }
  if (action === "remove") {
    if (typeof eventId !== "string" || !uuidPattern.test(eventId)) return error("Evento inválido.", 400);
    const removed = await db.delete(events).where(eq(events.id, eventId)).returning({ id: events.id });
    if (!removed.length) return error("Este evento foi removido da agenda.", 404);
    return json({ ok: true });
  }
  return error("Solicitação inválida.", 400);
}
