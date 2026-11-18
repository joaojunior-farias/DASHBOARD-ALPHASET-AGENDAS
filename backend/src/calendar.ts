import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { isDistanceList, timePattern, uuidPattern, validDate } from "./agenda-model.js";
import { getDb } from "./db/index.js";
import { calendarEvents, calendarOptions, clients, events } from "./db/schema.js";
import { adminCookie, validAdminSession } from "./server/admin-session.js";
import { acceptsJson, requestSite } from "./server/config.js";
import { readCookie } from "./server/cookies.js";

const kinds = ["category", "modality", "status", "work_type"] as const;
const colors = ["gray", "blue", "orange", "green", "purple", "red"] as const;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

function error(message: string, status: number) {
  return json({ error: message }, status);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

export async function GET(request: Request) {
  if (requestSite(request.headers)?.kind !== "dashboard") return error("Página indisponível.", 404);
  if (!await validAdminSession(readCookie(request, adminCookie))) return error("Entre no painel para continuar.", 401);
  const month = new URL(request.url).searchParams.get("mes");
  const start = `${month}-01`;
  if (!validDate(start)) return error("Escolha um mês válido.", 400);
  const followingMonth = new Date(start + "T12:00:00Z");
  followingMonth.setUTCMonth(followingMonth.getUTCMonth() + 1);
  const end = followingMonth.toISOString().slice(0, 10);
  const db = getDb();
  const [options, rows] = await Promise.all([
    db.select().from(calendarOptions).orderBy(asc(calendarOptions.name)),
    db.select({ event: calendarEvents, cardId: events.id, clientName: clients.name }).from(calendarEvents)
      .leftJoin(events, eq(events.calendarEventId, calendarEvents.id))
      .leftJoin(clients, eq(clients.id, calendarEvents.clientId))
      .where(and(gte(calendarEvents.endDate, start), lt(calendarEvents.date, end)))
      .orderBy(asc(calendarEvents.date), asc(calendarEvents.time), asc(calendarEvents.id)),
  ]);
  return json({ options, events: rows.map(({ event, cardId, clientName }) => ({ ...event, clientName: clientName ?? event.clientName, cardId })) });
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "dashboard") return error("Página indisponível.", 404);
  if (!await validAdminSession(readCookie(request, adminCookie))) return error("Entre no painel para continuar.", 401);
  if (!acceptsJson(request.headers, site.origin)) return error("Solicitação inválida.", 403);
  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return error("Dados inválidos.", 400);
  const input = value as Record<string, unknown>;
  if (input.action === "option") return addOption(input);
  if (input.action === "create" || input.action === "update") return saveEvent(input, input.action === "create");
  return error("Solicitação inválida.", 400);
}

async function addOption(input: Record<string, unknown>) {
  const kind = kinds.find((value) => value === input.kind);
  const name = cleanText(input.name);
  if (!kind || name.length < 2 || name.length > 60 || /[\u0000-\u001f\u007f]/u.test(name)) {
    return error("Informe um nome de 2 a 60 caracteres.", 400);
  }
  const db = getDb();
  const color = colors.find((value) => value === input.color);
  if (kind === "status" && !color) return error("Selecione uma cor para o status.", 400);
  let parentId: string | null = null;
  if (kind === "modality") {
    if (!isUuid(input.parentId)) return error("Selecione a categoria da modalidade.", 400);
    const [category] = await db.select({ id: calendarOptions.id }).from(calendarOptions)
      .where(and(eq(calendarOptions.kind, "category"), eq(calendarOptions.id, input.parentId)));
    if (!category) return error("Categoria indisponível.", 400);
    parentId = category.id;
  }
  const [option] = await db.insert(calendarOptions).values({ kind, name, parentId, color: kind === "status" ? color : null })
    .onConflictDoNothing().returning();
  return option ? json({ option }, 201) : error("Já existe uma opção com esse nome.", 409);
}

function addDays(date: string, days: number) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function saveEvent(input: Record<string, unknown>, creating: boolean) {
  const { id, date, categoryId, statusId, workTypeId, version } = input;
  const modalityId = input.modalityId ?? null;
  const distancesKm = input.distancesKm ?? [];
  const name = cleanText(input.name);
  const location = cleanText(input.location);
  const recurrence = input.recurrence ?? "none";
  if (!isUuid(id) || name.length < 2 || name.length > 100 || location.length > 160
    || /[\u0000-\u001f\u007f]/u.test(name + location)
    || typeof date !== "string" || !validDate(date)
    || !isUuid(categoryId) || !isUuid(statusId) || !isUuid(workTypeId)
    || (modalityId !== null && !isUuid(modalityId)) || !isDistanceList(distancesKm)
    || (recurrence !== "none" && recurrence !== "weekly-month") || (!creating && recurrence !== "none")) {
    return error("Confira o nome, as datas, os horários e as opções do evento.", 400);
  }
  if (!creating && (typeof version !== "number" || !Number.isInteger(version) || version < 1 || version > 2_147_483_647)) {
    return error("Reabra o evento para editar a versão atual.", 400);
  }
  const db = getDb();
  const [previous] = creating ? [] : await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
  const endDate = input.endDate ?? (previous && previous.endDate !== previous.date ? previous.endDate : date);
  const allDay = input.allDay ?? previous?.allDay ?? false;
  const time = allDay === true ? "00:00" : input.time;
  const suppliedEndTime = input.endTime === undefined ? previous?.endTime ?? null : input.endTime;
  const endTime = allDay === true || suppliedEndTime === "" ? null : suppliedEndTime;
  const clientId = input.clientId === undefined ? previous?.clientId ?? null : input.clientId;
  let clientName = cleanText(input.clientName === undefined ? previous?.clientName : input.clientName);
  if (typeof endDate !== "string" || !validDate(endDate) || endDate < date || typeof allDay !== "boolean"
    || typeof time !== "string" || !timePattern.test(time)
    || (endTime !== null && (typeof endTime !== "string" || !timePattern.test(endTime) || (date === endDate && endTime <= time)))
    || (clientId !== null && !isUuid(clientId)) || clientName.length > 100 || /[\u0000-\u001f\u007f]/u.test(clientName)) {
    return error("Confira o cliente e o período. O fim precisa ser posterior ao início.", 400);
  }

  const optionIds = [categoryId, statusId, workTypeId];
  if (modalityId) optionIds.push(modalityId);
  const options = await db.select().from(calendarOptions).where(inArray(calendarOptions.id, optionIds));
  if (!options.some((option) => option.kind === "category" && option.id === categoryId)
    || !options.some((option) => option.kind === "status" && option.id === statusId)
    || !options.some((option) => option.kind === "work_type" && option.id === workTypeId)
    || (modalityId && !options.some((option) => option.kind === "modality" && option.id === modalityId && option.parentId === categoryId))) {
    return error("Confira a categoria, a modalidade, o status e o tipo de trabalho.", 400);
  }
  if (clientId) {
    const [client] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId));
    if (!client) return error("Selecione um cliente cadastrado ou informe o nome.", 400);
    clientName = client.name;
  }
  const details = { name, clientName, clientId, date, endDate, time, endTime, allDay, location, categoryId, modalityId, statusId, workTypeId, distancesKm };
  if (!creating) {
    const [event] = await db.update(calendarEvents).set({ ...details, version: sql`${calendarEvents.version} + 1` })
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.version, Number(version)))).returning();
    if (!event) return error("O evento foi alterado. Reabra para editar a versão atual.", 409);
    const [card] = await db.select({ id: events.id }).from(events).where(eq(events.calendarEventId, id));
    return json({ event: { ...event, cardId: card?.id ?? null } });
  }
  const occurrences = [{ id, ...details, seriesId: recurrence === "weekly-month" ? id : null }];
  if (recurrence === "weekly-month") {
    const firstOffset = -Math.floor((Number(date.slice(-2)) - 1) / 7) * 7;
    for (let offset = firstOffset; ; offset += 7) {
      const nextDate = addDays(date, offset);
      if (!nextDate.startsWith(date.slice(0, 7))) break;
      if (offset === 0) continue;
      const nextEnd = addDays(endDate, offset);
      if (!validDate(nextEnd)) return error("A recorrência ultrapassa o período permitido pelo calendário.", 400);
      occurrences.push({ id: randomUUID(), ...details, date: nextDate, endDate: nextEnd, seriesId: id });
    }
  }
  return db.transaction(async (tx) => {
    // Serialize retries of the same form so the complete series is created once.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
    const [saved] = await tx.select({ event: calendarEvents, cardId: events.id }).from(calendarEvents)
      .leftJoin(events, eq(events.calendarEventId, calendarEvents.id)).where(eq(calendarEvents.id, id));
    if (saved) {
      const members = saved.event.seriesId
        ? await tx.select({ id: calendarEvents.id }).from(calendarEvents).where(eq(calendarEvents.seriesId, saved.event.seriesId))
        : [saved.event];
      return json({ event: { ...saved.event, cardId: saved.cardId }, createdCount: members.length });
    }
    const [event] = await tx.insert(calendarEvents).values(occurrences).returning();
    return json({ event: { ...event, cardId: null }, createdCount: occurrences.length }, 201);
  });
}
