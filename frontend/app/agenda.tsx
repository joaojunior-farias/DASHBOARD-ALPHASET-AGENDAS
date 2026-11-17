"use client";

import {
  ArrowRight, Bike, CalendarDays, Check, Clock3, Footprints, Link2, LogOut,
  MapPin, Mountain, Pencil, Plus, Route, Shield, Trash2, Users, X,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  type AdminAgenda, type AdminEvent, type AdminReply, type AgendaEvent, type EventDetails,
  type PhotographerAgenda, type PhotographerEvent, type Reply, type Sport,
  describeDate, monthLabel, PERIODS, shiftMonth, SPORTS, suggestedPeriod, today,
} from "./agenda-model";

type Mode = "admin" | "photographer";
type PhotoView = "pending" | "history";
type AnswerFilter = "all" | "confirmed" | "declined" | "available" | "unavailable";
type Panel =
  | { kind: "event"; event?: AdminEvent }
  | { kind: "replies"; eventId: string }
  | { kind: "reply"; event: PhotographerEvent; available?: boolean }
  | { kind: "invite" }
  | { kind: "user" }
  | { kind: "remove"; event: AdminEvent; fromReplies?: boolean };

const sportIcons = { Bike, Corrida: Footprints, Trilha: Mountain, Outro: CalendarDays };
const sportStyles = { Bike: "bike", Corrida: "run", Trilha: "trail", Outro: "other" };
const distancePattern = "[0-9]+([.,][0-9]+)?([eE][+\\-]?[0-9]+)?";
const selectionMessages = {
  pending: "Aguardando aprovação",
  confirmed: "Você foi confirmado para participar deste evento.",
  declined: "Você não está confirmado para participar deste evento.",
};
const selectionLabels = { pending: "Aguardando aprovação", confirmed: "Confirmado", declined: "Não confirmado" };
const eventsPerPage = 3;

export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function apiRequest<T>(
  input?: Record<string, unknown>,
  endpoint: "/api/agenda" | "/api/usuarios" | "/api/fotografos" | "/api/calendario" | `/api/calendario?mes=${string}` = "/api/agenda",
) {
  const response = await fetch(endpoint, input ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  } : { cache: "no-store" });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
    const message = typeof data.error === "string" ? data.error : "A agenda está indisponível. Tente novamente.";
    throw new RequestError(message, response.status);
  }
  return result as T;
}

export function TeamMark() {
  return (
    <div className="brand">
      <img src="/alpha-set.png" alt="Alpha Set" width="480" height="192" />
    </div>
  );
}

function SportTag({ sport }: { sport: Sport }) {
  const Icon = sportIcons[sport];
  return <span className={"sport-tag " + sportStyles[sport]}><Icon size={15} />{sport}</span>;
}

function formatDistance(km: number) {
  return String(km).replace(".", ",");
}

export function readDistances(values: FormData) {
  return values.getAll("distanceKm").map(String).filter(Boolean).map((text) => Number(text.replace(",", ".")));
}

function EventMetadata({ event, showYear = false }: { event: AgendaEvent; showYear?: boolean }) {
  return (
    <div className="event-meta">
      <span><CalendarDays size={16} />{describeDate(event.date).dayMonth}{showYear && ` de ${event.date.slice(0, 4)}`}</span>
      {event.meetingTime && <span><Clock3 size={16} />Concentração {event.meetingTime}</span>}
      <span><Clock3 size={16} />Largada {event.time} · {event.period}</span>
      {Boolean(event.distancesKm?.length) && (
        <span className="event-distances"><Route size={16} />{event.distancesKm.map((km) => `${formatDistance(km)} km`).join(" · ")}</span>
      )}
      {event.location && <span className="event-location"><MapPin size={16} />{event.location}</span>}
    </div>
  );
}

function EventCard({ event, showYear, onReplies, onEdit, onRemove, onPublish, onReply }: {
  event: AdminEvent | PhotographerEvent;
  showYear: boolean;
  onReplies: (eventId: string) => void;
  onEdit: (event: AdminEvent) => void;
  onRemove: (event: AdminEvent) => void;
  onPublish: (eventId: string, published: boolean) => Promise<void>;
  onReply: (event: PhotographerEvent, available?: boolean) => void;
}) {
  const { weekday } = describeDate(event.date);
  const admin = "replies" in event;
  const available = admin ? event.replies.filter((reply) => reply.available).length : 0;
  const confirmed = admin ? event.replies.filter((reply) => reply.selection === "confirmed").length : 0;
  const selection = !admin && event.reply?.available ? event.reply.selection : null;
  const published = event.published !== false;
  const hasBeenPublished = admin && (published || event.hasBeenPublished);
  return (
    <article className={selection ? `event-card ${selection}` : "event-card"}>
      <div className="card-top">
        <div className="date-block">
          <strong>{event.date.slice(-2)}</strong>
          <span>{weekday.replace("-feira", "").slice(0, 3)}.</span>
        </div>
        <SportTag sport={event.sport} />
      </div>
      <h3>{event.name}</h3>
      <EventMetadata event={event} showYear={showYear} />
      {admin ? (
        <div className="card-bottom">
          <PublicationForm published={published} hasBeenPublished={hasBeenPublished} save={() => onPublish(event.id, !published)} />
          {hasBeenPublished && (
            <div className="card-counts">
              <span className="count registered"><Users size={15} /> {available} <span>inscritos</span></span>
              <span className="count available"><Check size={15} /> {confirmed} <span>confirmados</span></span>
              <span className="count unavailable"><X size={15} /> {event.replies.length - available} <span>indisponíveis</span></span>
            </div>
          )}
          <div className="event-admin-actions">
            {hasBeenPublished && <button className="button outline full" onClick={() => onReplies(event.id)}>Selecionar fotógrafos <ArrowRight size={17} /></button>}
            <button className="button outline" aria-label="Editar evento" onClick={() => onEdit(event)}><Pencil size={16} />Editar</button>
            <button className="button outline danger-light" aria-label="Excluir evento" onClick={() => onRemove(event)}><Trash2 size={16} />Excluir</button>
          </div>
        </div>
      ) : (
        <div className="card-bottom">
          {event.reply && <p className={event.reply.available ? "sent" : "sent sent-unavailable"} role="status">
            {event.reply.available ? <Check size={16} /> : <X size={16} />}{event.reply.available ? "Disponível" : "Indisponível"}
          </p>}
          {event.reply?.available && (
            <p className={`selection-status ${selection ?? "pending"}`} role="status">
              {selectionMessages[selection ?? "pending"]}
            </p>
          )}
          {!published && <p className="closed-status">Inscrições encerradas{event.needsReconfirmation && " · Data alterada"}</p>}
          {published && event.needsReconfirmation && (
            <>
              <p className="date-alert"><CalendarDays size={16} /> A data mudou. Responda para a nova data.</p>
              <button className="button primary full" onClick={() => onReply(event)}>Reconfirmar disponibilidade <ArrowRight size={17} /></button>
            </>
          )}
          {published && event.reply && <button className="button outline" onClick={() => onReply(event)}><Pencil size={16} />Alterar resposta</button>}
          {published && !event.reply && !event.needsReconfirmation && (
            <div className="response-buttons">
              <button className="button yes" onClick={() => onReply(event, true)}><Check size={16} />Estou disponível</button>
              <button className="button outline no" onClick={() => onReply(event, false)}><X size={16} />Não estou disponível</button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function Agenda({ mode, canManageUsers = false, initialEventId }: { mode: Mode; canManageUsers?: boolean; initialEventId?: string }) {
  const admin = mode === "admin";
  const [adminData, setAdminData] = useState<AdminAgenda | null>(null);
  const [photoEvents, setPhotoEvents] = useState<PhotographerEvent[] | null>(null);
  const [photoView, setPhotoView] = useState<PhotoView>("pending");
  const [answerFilter, setAnswerFilter] = useState<AnswerFilter>("all");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [pagePosition, setPagePosition] = useState<number | string>(1);
  const [loadError, setLoadError] = useState<RequestError | null>(null);
  const [reload, setReload] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [notice, setNotice] = useState("");
  const [mutation, setMutation] = useState(0);
  const version = useRef(0);
  const initialCard = useRef(initialEventId);
  const listHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    let sequence = 0;
    async function load() {
      const started = ++sequence;
      const currentVersion = version.current;
      const isCurrent = () => active && started === sequence && currentVersion === version.current;
      try {
        if (mode === "admin") {
          const data = await apiRequest<AdminAgenda>();
          if (isCurrent()) {
            setAdminData(data);
            const card = data.events.find((event) => event.id === initialCard.current);
            initialCard.current = undefined;
            if (card) {
              setMonth(card.date.slice(0, 7));
              setPagePosition(card.id);
            }
          }
        } else {
          const token = new URLSearchParams(window.location.hash.slice(1)).get("convite");
          if (token) {
            try {
              await apiRequest({ action: "convite", token }, "/api/fotografos");
              if (isCurrent()) setInviteError("");
            } catch (cause) {
              if (!(cause instanceof RequestError) || cause.status !== 403) throw cause;
              if (isCurrent()) setInviteError(cause.message);
            }
            if (isCurrent()) window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
          const data = await apiRequest<PhotographerAgenda>();
          if (isCurrent()) setPhotoEvents(data.events);
        }
        if (isCurrent()) setLoadError(null);
      } catch (cause) {
        if (isCurrent()) {
          const error = cause instanceof RequestError ? cause : new RequestError("Falha ao carregar a agenda.", 0);
          if (error.status === 401 || error.status === 403) {
            setAdminData(null);
            setPhotoEvents(null);
            setPanel(null);
          }
          setLoadError(error);
        }
      }
    }
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", refresh);
    const interval = setInterval(refresh, 30_000);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
    };
  }, [mode, reload, mutation]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const history = !admin && photoView === "history";
  const pendingEvents = photoEvents?.filter((event) => event.published && !event.reply);
  const events = admin ? adminData?.events : pendingEvents;
  const historyEntries = photoEvents?.filter((event) => event.reply || !event.published).reverse() ?? [];
  const entries = history
    ? historyEntries.filter(({ reply }) => {
      if (answerFilter === "all") return true;
      if (answerFilter === "confirmed" || answerFilter === "declined") return reply?.selection === answerFilter;
      return reply?.available === (answerFilter === "available");
    })
    : events?.filter((event) => event.date.startsWith(month)) ?? [];
  const pageCount = Math.max(1, Math.ceil(entries.length / eventsPerPage));
  const requestedPage = typeof pagePosition === "number"
    ? pagePosition
    : Math.floor(entries.findIndex((event) => event.id === pagePosition) / eventsPerPage) + 1;
  const page = Math.max(1, Math.min(requestedPage, pageCount));
  const pageStart = (page - 1) * eventsPerPage;
  const visibleEntries = entries.slice(pageStart, pageStart + eventsPerPage);
  const nextEvent = events?.find((event) => event.date.slice(0, 7) > month);
  const before = events?.findLast((event) => event.date.slice(0, 7) < month);
  const alternateMonth = (nextEvent ?? before)?.date.slice(0, 7);
  const currentMonth = today().slice(0, 7);
  const photoMonths = [...new Set([
    currentMonth, shiftMonth(currentMonth, 1), month, ...(pendingEvents ?? []).map((event) => event.date.slice(0, 7)),
  ])].sort();
  const selected = panel?.kind === "replies" ? adminData?.events.find((event) => event.id === panel.eventId) : undefined;
  const invite = adminData?.invite.split("#", 1)[0] ?? "";
  const reconfirmationsElsewhere = pendingEvents?.filter((event) => event.needsReconfirmation && !event.date.startsWith(month)) ?? [];
  const replyEvent = panel?.kind === "reply" ? photoEvents?.find((event) => event.id === panel.event.id) : undefined;
  const canStart = Boolean(events);
  const showSignIn = admin && loadError?.status === 401;
  const showTeamAccess = !admin && loadError?.status === 401;

  function showMonth(value: string) {
    if (value === month) return;
    setMonth(value);
    setPagePosition(1);
  }

  function showPhotoView(value: PhotoView) {
    if (value === photoView) return;
    setPhotoView(value);
    setPagePosition(1);
  }

  function changePage(value: number) {
    setPagePosition(value);
    listHeading.current?.focus({ preventScroll: true });
    listHeading.current?.scrollIntoView({ block: "start" });
  }

  function finish(message: string, closePanel = true) {
    version.current += 1;
    setMutation(version.current);
    if (closePanel) setPanel(null);
    setNotice(message);
  }

  async function saveEvent(values: EventDetails, existing?: AdminEvent) {
    const { event } = await apiRequest<{ event: Omit<AdminEvent, "replies" | "selectionVersion"> }>({
      action: existing ? "update" : "create-draft",
      eventId: existing?.id,
      dateRevision: existing?.dateRevision,
      ...values,
    }).catch(refreshOnConflict);
    const dateChanged = existing !== undefined && existing.dateRevision !== event.dateRevision;
    setAdminData((data) => {
      if (!data) return data;
      const previous = data.events.find((item) => item.id === event.id && item.dateRevision === event.dateRevision);
      return {
        ...data,
        events: [...data.events.filter((item) => item.id !== event.id), {
          ...event, replies: previous?.replies ?? [], selectionVersion: previous?.selectionVersion,
        }].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
      };
    });
    setMonth(event.date.slice(0, 7));
    setPagePosition(event.id);
    if (dateChanged && event.published !== false) finish("Data alterada. A equipe precisa responder novamente.");
    else finish(existing ? "Evento atualizado." : "Rascunho salvo.");
  }

  function refreshOnConflict(cause: unknown): never {
    if (cause instanceof RequestError && [401, 404, 409].includes(cause.status)) {
      setReload((count) => count + 1);
    }
    throw cause;
  }

  async function saveReply(event: PhotographerEvent, available: boolean) {
    const { reply } = await apiRequest<{ reply: Reply }>({
      action: "reply", eventId: event.id, dateRevision: event.dateRevision, available,
    }).catch(refreshOnConflict);
    setPhotoEvents((events) => events?.map((item) =>
      item.id === event.id && item.dateRevision === event.dateRevision
        ? { ...item, reply, needsReconfirmation: false } : item
    ) ?? null);
    setMonth(event.date.slice(0, 7));
    setPhotoView("history");
    setAnswerFilter("all");
    setPagePosition(event.id);
    finish("Disponibilidade enviada para a Alpha Set.");
  }

  async function saveSelection(event: AdminEvent, confirmedIds: string[]) {
    const { replies, selectionVersion } = await apiRequest<{ replies: AdminReply[]; selectionVersion: string }>({
      action: "select-team", eventId: event.id, dateRevision: event.dateRevision, version: event.selectionVersion, confirmedIds,
    }).catch(refreshOnConflict);
    const decisions = new Map(replies.map((reply) => [reply.id, reply.selection]));
    setAdminData((data) => data && {
      ...data,
      events: data.events.map((item) => item.id === event.id && item.dateRevision === event.dateRevision ? {
        ...item, selectionVersion,
        replies: item.replies.map((reply) => decisions.has(reply.id) ? { ...reply, selection: decisions.get(reply.id) ?? null } : reply),
      } : item),
    });
    finish("Seleção salva.");
  }

  async function saveUser(username: string, password: string) {
    await apiRequest({ username, password }, "/api/usuarios");
    setPanel(null);
    setNotice("Usuário criado.");
  }

  async function removeEvent(id: string) {
    await apiRequest({ action: "remove", eventId: id });
    setAdminData((data) => data && { ...data, events: data.events.filter((event) => event.id !== id) });
    finish("Evento excluído.");
  }

  async function publishEvent(id: string, published: boolean) {
    await apiRequest({ action: published ? "publish" : "unpublish", eventId: id }).catch(refreshOnConflict);
    setAdminData((data) => data && {
      ...data,
      events: data.events.map((event) => event.id === id ? { ...event, published, hasBeenPublished: true } : event),
    });
    finish(published ? "Evento publicado na agenda da equipe." : "Evento despublicado. Inscrições encerradas.", false);
  }

  return (
    <div className="site">
      <header className="topbar">
        <div className="topbar-inner">
          <TeamMark />
          {admin ? (
            <div className="top-actions">
              <span className="role"><Shield size={15} /> Gestão</span>
              <Link className="button outline" href="/calendario"><CalendarDays size={17} /> Calendário</Link>
              {canStart && <button className="button outline invite-button" onClick={() => setPanel({ kind: "invite" })}><Link2 size={17} /> <span>Link da agenda</span></button>}
              {canStart && <LogoutButton />}
            </div>
          ) : (
            <div className="top-actions">
              <span className="role"><Users size={16} /> Equipe</span>
              {canStart && <LogoutButton photographer />}
            </div>
          )}
        </div>
      </header>

      <main className="main">
        <section className="hero" aria-labelledby="page-title">
          <div className="hero-content">
            <span className="hero-label"><CalendarDays size={16} />{admin ? "GESTÃO DE EVENTOS" : "AGENDA DA EQUIPE"}</span>
            <h1 id="page-title">{admin ? "Painel de eventos" : "Agenda Alpha Set"}</h1>
            <p>{admin ? "Cadastre eventos e acompanhe a disponibilidade da equipe." : "Veja os próximos eventos e informe sua disponibilidade."}</p>
          </div>
        </section>

        {!admin && canStart && (
          <div className="agenda-views" role="group" aria-label="Seções da agenda">
            <button className="button outline" aria-pressed={!history} onClick={() => showPhotoView("pending")}><CalendarDays size={17} /> Para responder</button>
            <button className="button outline" aria-pressed={history} onClick={() => showPhotoView("history")}><Check size={17} /> Minhas respostas</button>
          </div>
        )}

        {!history && reconfirmationsElsewhere.length > 0 && (
          <section className="reconfirm-section" aria-labelledby="reconfirm-title">
            <h2 id="reconfirm-title">Eventos com nova data</h2>
            <ul>
              {reconfirmationsElsewhere.map((event) => (
                <li key={event.id}>
                  <span><strong>{event.name}</strong><small>{describeDate(event.date).dayMonth} de {event.date.slice(0, 4)}</small></span>
                  <button className="button outline" onClick={() => {
                    setMonth(event.date.slice(0, 7));
                    setPagePosition(event.id);
                    setPanel({ kind: "reply", event });
                  }}>Reconfirmar</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canStart ? (
          <section className="month-section" aria-label={history ? "Histórico de respostas" : "Eventos por mês"}>
            <div className="month-header">
              <div className="month-heading">
                <h2 ref={listHeading} tabIndex={-1}>{history ? "Histórico" : monthLabel(month)}</h2>
                <span className="event-total">{entries.length} {entries.length === 1 ? "evento" : "eventos"}</span>
              </div>
              <div className="month-actions">
                {history ? (
                  <label className="answer-filter">Filtrar respostas
                    <select value={answerFilter} onChange={(event) => {
                      setAnswerFilter(event.currentTarget.value as AnswerFilter);
                      setPagePosition(1);
                    }}>
                      <option value="all">Todas</option>
                      <option value="confirmed">Confirmados</option>
                      <option value="declined">Não confirmados</option>
                      <option value="available">Disponível</option>
                      <option value="unavailable">Indisponível</option>
                    </select>
                  </label>
                ) : <div className="month-nav" role="group" aria-label="Navegação mensal">
                  {admin ? (
                    <>
                      <button className="button outline" onClick={() => showMonth(shiftMonth(month, -1))}>Mês anterior</button>
                      <button className="button outline" onClick={() => showMonth(shiftMonth(month, 1))}>Próximo mês</button>
                    </>
                  ) : photoMonths.map((option) => (
                    <button key={option} className="button outline month-choice" aria-pressed={option === month}
                      onClick={() => showMonth(option)}>
                      {monthLabel(option, option.slice(0, 4) !== currentMonth.slice(0, 4))}
                    </button>
                  ))}
                </div>}
                {canManageUsers && <button className="button outline" onClick={() => setPanel({ kind: "user" })}><Users size={17} /> Criar usuário</button>}
                {admin && <button className="button primary" onClick={() => setPanel({ kind: "event" })}><Plus size={19} /> Novo evento</button>}
              </div>
            </div>
            {loadError && <p className="form-error" role="alert">{loadError.message} <button className="text-button" onClick={() => setReload(reload + 1)}>Atualizar</button></p>}
            {entries.length ? (
              <>
                <div className="event-grid">
                  {visibleEntries.map((event) => <EventCard key={event.id} event={event} showYear={history}
                    onReplies={(eventId) => setPanel({ kind: "replies", eventId })}
                    onEdit={(event) => setPanel({ kind: "event", event })}
                    onRemove={(event) => setPanel({ kind: "remove", event })}
                    onPublish={publishEvent}
                    onReply={(event, available) => setPanel({ kind: "reply", event, available })} />)}
                </div>
                {pageCount > 1 && (
                  <nav className="event-pagination" aria-label="Paginação de eventos">
                    <button className="button outline" type="button" disabled={page === 1} onClick={() => changePage(page - 1)}>Anterior</button>
                    <span role="status">Página {page} de {pageCount}</span>
                    <button className="button outline" type="button" disabled={page === pageCount} onClick={() => changePage(page + 1)}>Próxima</button>
                  </nav>
                )}
              </>
            ) : (
              <div className="empty">
                <div className="empty-icon"><CalendarDays size={26} /></div>
                <h3>{history ? "Nenhuma resposta neste filtro" : admin ? "Nenhum evento neste mês" : "Nenhum evento para responder neste mês"}</h3>
                {admin && alternateMonth && <button className="button outline" onClick={() => showMonth(alternateMonth)}>
                  {monthLabel(alternateMonth)} <ArrowRight size={17} />
                </button>}
              </div>
            )}
          </section>
        ) : showTeamAccess ? (
          <section className="login-card team-access" aria-labelledby="team-access-title">
            <h2 id="team-access-title">{creatingAccount ? "Criar conta" : "Entrar na agenda"}</h2>
            {inviteError && <p className="form-error" role="alert">{inviteError}</p>}
            <TeamAccessForm key={creatingAccount ? "register" : "login"}
              creating={creatingAccount} signedIn={() => {
                version.current += 1;
                setCreatingAccount(false);
                setInviteError("");
                setLoadError(null);
                setReload((value) => value + 1);
              }} />
            <button className="text-button team-access-switch" onClick={() => setCreatingAccount(!creatingAccount)}>
              {creatingAccount ? "Já tenho conta" : "Criar conta"}
            </button>
          </section>
        ) : (
          <section className="empty gate" aria-live="polite">
            <div className="empty-icon">{admin ? <Shield size={25} /> : <CalendarDays size={25} />}</div>
            <h2>{showSignIn ? "Acesse o painel" : loadError ? "Agenda indisponível" : "Carregando a agenda"}</h2>
            {loadError && <p>{loadError.message}</p>}
            {showSignIn && <a className="button primary" href="/entrar">Entrar no painel <ArrowRight size={18} /></a>}
            {loadError && !showSignIn && <button className="button outline" onClick={() => { setLoadError(null); setReload(reload + 1); }}>Tentar novamente</button>}
          </section>
        )}

        <footer className="footer"><span><b>Alpha Set</b> · Fotografia esportiva</span></footer>
      </main>

      {panel && (
        <Dialog key={panel.kind} close={() => setPanel(null)}>
          {panel.kind === "event" && <EventForm existing={panel.event} month={month} save={(values) => saveEvent(values, panel.event)} />}
          {panel.kind === "replies" && selected && (
            <div>
              <SportTag sport={selected.sport} />
              <h2 id="dialog-title">{selected.name}</h2>
              <EventMetadata event={selected} />
              <div className="reply-groups">
                <TeamSelection key={selected.id} event={selected} save={saveSelection} />
                <UnavailableReplies replies={selected.replies.filter((reply) => !reply.available)} />
              </div>
              <div className="dialog-actions spread">
                <button className="button danger-light" onClick={() => setPanel({ kind: "remove", event: selected, fromReplies: true })}>Excluir evento</button>
                <button className="button outline" onClick={() => setPanel({ kind: "event", event: selected })}>Editar evento</button>
              </div>
            </div>
          )}
          {panel.kind === "replies" && !selected && <h2 id="dialog-title">Evento removido</h2>}
          {panel.kind === "reply" && (replyEvent?.published ? (
            <ResponseForm key={replyEvent.dateRevision} event={replyEvent}
              available={replyEvent.dateRevision === panel.event.dateRevision ? panel.available : undefined}
              save={(available) => saveReply(replyEvent, available)} cancel={() => setPanel(null)} />
          ) : <h2 id="dialog-title">Inscrições indisponíveis</h2>)}
          {panel.kind === "invite" && <InviteForm invite={invite} />}
          {panel.kind === "user" && canManageUsers && <CreateUserForm save={saveUser} />}
          {panel.kind === "remove" && <ConfirmRemove event={panel.event} remove={() => removeEvent(panel.event.id)}
            cancel={() => setPanel(panel.fromReplies ? { kind: "replies", eventId: panel.event.id } : null)} />}
        </Dialog>
      )}
      {notice && <div className="toast" role="status"><Check size={19} />{notice}</div>}
    </div>
  );
}

export function LogoutButton({ photographer = false }: { photographer?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function logout() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(photographer ? "/api/fotografos" : "/api/sessao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sair" }),
      });
      if (!response.ok) throw new Error();
      window.location.assign(photographer ? "/" : "/entrar");
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <>
      <button className="button icon outline" aria-label={photographer ? "Sair da agenda" : "Sair do painel"} disabled={busy} onClick={() => void logout()}>
        <LogOut size={17} />
      </button>
      {error && <div className="toast" role="alert">Não foi possível sair. Tente novamente.</div>}
    </>
  );
}

export function Dialog({ close, children }: { close: () => void; children: React.ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); };
  }, []);
  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="dialog-title" onCancel={(event) => {
      event.preventDefault();
      close();
    }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="dialog-content">
        <button className="button icon close" aria-label="Fechar" onClick={close}><X size={21} /></button>
        {children}
      </div>
    </dialog>
  );
}

export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>, action: (values: FormData) => Promise<void>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await action(new FormData(event.currentTarget));
    } catch (cause) {
      setError(cause instanceof RequestError ? cause.message : "Falha ao salvar. Tente novamente.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return { busy, error, submit };
}

function CreateUserForm({ save }: { save: (username: string, password: string) => Promise<void> }) {
  const { busy, error, submit } = useSubmit();
  return (
    <form method="post" onSubmit={(event) => void submit(event, (values) =>
      save(String(values.get("username")), String(values.get("password")))
    )}>
      <h2 id="dialog-title">Criar usuário</h2>
      <p className="dialog-subtitle">A conta terá acesso ao painel de eventos.</p>
      <div className="form-fields">
        <label>Usuário<input autoFocus name="username" autoComplete="off" autoCapitalize="none" required minLength={2} maxLength={80} /></label>
        <label>Senha<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? "Criando…" : "Criar usuário"} <Check size={18} /></button></div>
    </form>
  );
}

function PublicationForm({ published, hasBeenPublished, save }: { published: boolean; hasBeenPublished: boolean; save: () => Promise<void> }) {
  const { busy, error, submit } = useSubmit();
  const action = published ? "Despublicar" : "Publicar";
  return (
    <form className="publish-event" method="post" onSubmit={(event) => void submit(event, save)}>
      <div className="publish-event-actions">
        <span className="event-total">{published ? "Publicado" : hasBeenPublished ? "Despublicado" : "Rascunho"}</span>
        <button className={published ? "button outline" : "button primary"} disabled={busy}>{busy ? "Salvando…" : action}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function TeamAccessForm({ creating, signedIn }: { creating: boolean; signedIn: () => void }) {
  const { busy, error, submit } = useSubmit();
  return (
    <form method="post" onSubmit={(event) => void submit(event, async (fields) => {
      await apiRequest({
        action: creating ? "cadastro" : "entrar",
        name: fields.get("name"), email: fields.get("email"), password: fields.get("password"),
      }, "/api/fotografos");
      signedIn();
    })}>
      <div className="form-fields">
        {creating && <label>Nome completo<input name="name" autoComplete="name" required minLength={2} maxLength={80} /></label>}
        <label>E-mail<input name="email" type="email" autoComplete="username" autoCapitalize="none" required maxLength={254} /></label>
        <label>Senha<input name="password" type="password" autoComplete={creating ? "new-password" : "current-password"}
          required minLength={creating ? 12 : undefined} maxLength={256} /></label>
        {creating && <small className="password-hint">Use pelo menos 12 caracteres.</small>}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? "Aguarde…" : creating ? "Criar conta" : "Entrar"}</button></div>
    </form>
  );
}

export function DistanceFields({ initial }: { initial?: number[] }) {
  const [distances, setDistances] = useState(() => {
    const values = initial?.length ? initial.map(formatDistance) : [""];
    return values.map((text, id) => ({ id, text }));
  });
  const nextDistanceId = useRef(distances.length);
  return (
    <fieldset className="distance-fields">
      <legend>Quilometragens</legend>
      {distances.map(({ id, text }, index) => (
        <div className="distance-row" key={id}>
          <input name="distanceKm" aria-label={`Distância ${index + 1} em km`} type="text" inputMode="decimal" pattern={distancePattern}
            placeholder="Ex. 5" value={text} onInput={(event) => {
              const value = event.currentTarget.value;
              setDistances((current) => current.map((distance) => distance.id === id ? { id, text: value } : distance));
            }} />
          <span>km</span>
          <button className="button icon outline" type="button" aria-label={`Remover distância ${index + 1}`}
            onClick={() => setDistances((current) => current.filter((distance) => distance.id !== id))}><X size={17} /></button>
        </div>
      ))}
      <button className="button outline" type="button" onClick={() => {
        const id = nextDistanceId.current++;
        setDistances((current) => [...current, { id, text: "" }]);
      }}><Plus size={17} />Adicionar distância</button>
    </fieldset>
  );
}

export function EventForm({ existing, defaults, month, save }: {
  existing?: AdminEvent;
  defaults?: Partial<EventDetails>;
  month: string;
  save: (values: EventDetails) => Promise<void>;
}) {
  const initialValues = existing ?? defaults;
  const [period, setPeriod] = useState<EventDetails["period"]>(initialValues?.period ?? "Manhã");
  const { busy, error, submit } = useSubmit();
  const currentDate = today();
  const initialDate = initialValues?.date ?? (currentDate.startsWith(month) ? currentDate : month + "-01");
  const [date, setDate] = useState(initialDate);
  return (
    <form method="post" onSubmit={(event) => void submit(event, (values) => save({
      name: String(values.get("name")), date: String(values.get("date")), time: String(values.get("time")),
      meetingTime: String(values.get("meetingTime") ?? "") || null,
      distancesKm: readDistances(values),
      period, sport: values.get("sport") as Sport, location: String(values.get("location")),
    }))}>
      <h2 id="dialog-title">{existing ? "Editar evento" : defaults ? "Criar card para a equipe" : "Novo evento"}</h2>
      <div className="form-fields">
        <label>Nome do evento<input autoFocus name="name" required minLength={2} maxLength={100} placeholder="Ex. Corrida no parque" defaultValue={initialValues?.name} /></label>
        <label>Localização<input name="location" required minLength={2} maxLength={160} placeholder="Ex. Praia do Caripi, Barcarena" defaultValue={initialValues?.location ?? ""} /></label>
        <label>Data<input name="date" type="date" required min="2000-01-01" max="2099-12-31" defaultValue={initialDate} onInput={(event) => setDate(event.currentTarget.value)} /></label>
        <div className="field-row event-times">
          <label>Horário de concentração<input name="meetingTime" type="time" defaultValue={initialValues?.meetingTime ?? ""} /></label>
          <label>Horário de largada<input name="time" type="time" required defaultValue={initialValues?.time} onInput={(event) => {
            if (!existing && event.currentTarget.value) setPeriod(suggestedPeriod(event.currentTarget.value));
          }} /></label>
        </div>
        <div className="field-row">
          <label>Período<select name="period" value={period} onChange={(event) => setPeriod(event.currentTarget.value as EventDetails["period"])}>
            {PERIODS.map((value) => <option key={value}>{value}</option>)}
          </select></label>
          <label>Modalidade<select name="sport" required defaultValue={initialValues?.sport ?? ""}>
            <option value="" disabled>Selecione</option>
            {SPORTS.map((value) => <option key={value}>{value}</option>)}
          </select></label>
        </div>
        <DistanceFields initial={initialValues?.distancesKm} />
      </div>
      {existing && existing.published !== false && date && date !== existing.date && (
        <p className="date-alert" role="status"><CalendarDays size={16} /> Ao salvar a nova data, as respostas serão zeradas e a equipe precisará responder novamente.</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? "Salvando…" : existing ? "Salvar alterações" : "Salvar rascunho"} <Check size={18} /></button></div>
    </form>
  );
}

function ResponseForm({ event, available, save, cancel }: {
  event: PhotographerEvent;
  available?: boolean;
  save: (available: boolean) => Promise<void>;
  cancel: () => void;
}) {
  const { busy, error, submit } = useSubmit();
  const question = available === undefined ? "Confirme sua disponibilidade para este evento."
    : available ? "Confirma que está disponível para este evento?" : "Confirma que não está disponível para este evento?";
  return (
    <form method="post" onSubmit={(submission) => void submit(submission, (values) => {
      const chosen = values.get("available");
      if (available === undefined && chosen !== "yes" && chosen !== "no") {
        throw new RequestError("Escolha uma opção de disponibilidade.", 400);
      }
      return save(available ?? (chosen === "yes"));
    })}>
      {available !== undefined && (
        <span className={"count " + (available ? "available" : "unavailable")}>{available ? <Check size={16} /> : <X size={16} />}{available ? "Estou disponível" : "Não estou disponível"}</span>
      )}
      <h2 id="dialog-title">{event.name}</h2>
      <EventMetadata event={event} showYear />
      <p className="dialog-subtitle">{question}</p>
      {available === undefined && (
        <fieldset className="reconfirm-options">
          <legend>{event.needsReconfirmation ? "Disponibilidade para a nova data" : "Sua resposta"}</legend>
          <label><input type="radio" name="available" value="yes" defaultChecked={event.reply?.available === true} required /> Estou disponível</label>
          <label><input type="radio" name="available" value="no" defaultChecked={event.reply?.available === false} required /> Não estou disponível</label>
        </fieldset>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="button outline" disabled={busy} onClick={cancel}>Cancelar</button>
        <button className="button primary" disabled={busy}>{busy ? "Enviando…" : "Confirmar"} <Check size={18} /></button>
      </div>
    </form>
  );
}

function TeamSelection({ event, save }: { event: AdminEvent; save: (event: AdminEvent, confirmedIds: string[]) => Promise<void> }) {
  const [snapshot] = useState(event);
  const { busy, error, submit } = useSubmit();
  const candidates = snapshot.replies.filter((reply) => reply.available);
  if (!candidates.length) return <p className="dialog-subtitle">Nenhum fotógrafo inscrito neste evento.</p>;
  return (
    <form className="team-selection" method="post" onSubmit={(submission) => void submit(submission,
      (fields) => save(snapshot, fields.getAll("confirmedId").map(String)))}>
      <fieldset disabled={busy || !snapshot.selectionVersion}>
        <legend>Selecionar fotógrafos</legend>
        <p className="dialog-subtitle">Marque quem vai participar. Ao salvar, quem ficar desmarcado verá que não foi confirmado.</p>
        {candidates.map((reply) => (
          <label className="selection-candidate" key={reply.id}>
            <input type="checkbox" name="confirmedId" value={reply.id} defaultChecked={reply.selection === "confirmed"} />
            <span>{reply.name}<small>{selectionLabels[reply.selection ?? "pending"]}</small></span>
          </label>
        ))}
        <div className="dialog-actions">
          <button className="button primary">{busy ? "Salvando…" : "Salvar seleção"} <Check size={17} /></button>
        </div>
      </fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function UnavailableReplies({ replies }: { replies: AdminReply[] }) {
  if (!replies.length) return null;
  return (
    <section className="reply-group">
      <h3><X size={17} />Indisponíveis <span>{replies.length}</span></h3>
      <ul>{replies.map((reply) => <li key={reply.id}>{reply.name}</li>)}</ul>
    </section>
  );
}

function InviteForm({ invite }: { invite: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setCopyError(false);
    } catch {
      field.current?.select();
      setCopyError(true);
    }
  }
  return (
    <div>
      <h2 id="dialog-title">Link da agenda</h2>
      <div className="form-fields"><label>Link da agenda <input ref={field} readOnly value={invite} onFocus={(event) => event.currentTarget.select()} /></label></div>
      {copyError && <p className="form-error" role="alert">Selecione e copie o link acima.</p>}
      <div className="dialog-actions"><button className="button primary" onClick={() => void copy()}>{copied ? <Check size={18} /> : <Link2 size={18} />}{copied ? "Link copiado" : "Copiar link"}</button></div>
    </div>
  );
}

function ConfirmRemove({ event, remove, cancel }: { event: AdminEvent; remove: () => Promise<void>; cancel: () => void }) {
  const { busy, error, submit } = useSubmit();
  return (
    <form method="post" onSubmit={(submission) => void submit(submission, remove)}>
      <h2 id="dialog-title">Excluir evento?</h2>
      <p className="dialog-subtitle">O evento <strong>{event.name}</strong> e suas respostas serão excluídos da agenda.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="button outline" onClick={cancel}>Cancelar</button>
        <button className="button danger" disabled={busy}>{busy ? "Excluindo…" : "Excluir evento"}</button>
      </div>
    </form>
  );
}
