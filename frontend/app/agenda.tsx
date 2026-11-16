"use client";

import {
  ArrowRight, Bike, CalendarDays, Check, Clock3, Footprints, Link2, LogOut,
  MapPin, Mountain, Pencil, Plus, Shield, Trash2, Users, X,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  type AdminAgenda, type AdminEvent, type AgendaEvent, type EventDetails,
  type PhotographerAgenda, type PhotographerEvent, type Reply, type Sport,
  describeDate, monthLabel, PERIODS, shiftMonth, SPORTS, suggestedPeriod, today,
} from "./agenda-model";

type Mode = "admin" | "photographer";
type Panel =
  | { kind: "event"; event?: AdminEvent }
  | { kind: "replies"; eventId: string }
  | { kind: "reply"; event: PhotographerEvent; available?: boolean }
  | { kind: "invite" }
  | { kind: "user" }
  | { kind: "remove"; event: AdminEvent; fromReplies?: boolean };

const sportIcons = { Bike, Corrida: Footprints, Trilha: Mountain, Outro: CalendarDays };
const sportStyles = { Bike: "bike", Corrida: "run", Trilha: "trail", Outro: "other" };

class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function apiRequest<T>(
  input?: Record<string, unknown>,
  endpoint: "/api/agenda" | "/api/usuarios" = "/api/agenda",
) {
  const response = await fetch(endpoint, input ? {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  } : { cache: "no-store" });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
      ? result.error : "A agenda está indisponível. Tente novamente.";
    throw new RequestError(message, response.status);
  }
  return result as T;
}

function TeamMark() {
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

function EventMetadata({ event, showYear = false }: { event: AgendaEvent; showYear?: boolean }) {
  return (
    <div className="event-meta">
      <span><CalendarDays size={16} />{describeDate(event.date).dayMonth}{showYear && ` de ${event.date.slice(0, 4)}`}</span>
      {event.meetingTime && <span><Clock3 size={16} />Concentração {event.meetingTime}</span>}
      <span><Clock3 size={16} />Largada {event.time} · {event.period}</span>
      {event.location && <span className="event-location"><MapPin size={16} />{event.location}</span>}
    </div>
  );
}

function EventCard({ event, onReplies, onEdit, onRemove, onPublish, onReply }: {
  event: AdminEvent | PhotographerEvent;
  onReplies: (eventId: string) => void;
  onEdit: (event: AdminEvent) => void;
  onRemove: (event: AdminEvent) => void;
  onPublish: (eventId: string) => Promise<void>;
  onReply: (event: PhotographerEvent, available?: boolean) => void;
}) {
  const { weekday } = describeDate(event.date);
  const admin = "replies" in event;
  const available = admin ? event.replies.filter((reply) => reply.available).length : 0;
  return (
    <article className="event-card">
      <div className="card-top">
        <div className="date-block">
          <strong>{event.date.slice(-2)}</strong>
          <span>{weekday.replace("-feira", "").slice(0, 3)}.</span>
        </div>
        <SportTag sport={event.sport} />
      </div>
      <h3>{event.name}</h3>
      <EventMetadata event={event} />
      {admin ? (
        <div className="card-bottom">
          {event.published === false ? (
            <PublishEventForm publish={() => onPublish(event.id)} />
          ) : (
            <div className="card-counts">
              <span className="count available"><Check size={15} /> {available} <span>disponíveis</span></span>
              <span className="count unavailable"><X size={15} /> {event.replies.length - available} <span>indisponíveis</span></span>
            </div>
          )}
          <div className="event-admin-actions">
            {event.published !== false && <button className="button outline full" onClick={() => onReplies(event.id)}>Ver respostas <ArrowRight size={17} /></button>}
            <button className="button outline" aria-label="Editar evento" onClick={() => onEdit(event)}><Pencil size={16} />Editar</button>
            <button className="button outline danger-light" aria-label="Excluir evento" onClick={() => onRemove(event)}><Trash2 size={16} />Excluir</button>
          </div>
        </div>
      ) : (
        <div className="card-bottom">
          {event.reply && <p className="sent" role="status"><Check size={16} /> Resposta enviada · {event.reply.available ? "Disponível" : "Indisponível"}</p>}
          {event.needsReconfirmation ? (
            <>
              <p className="date-alert"><CalendarDays size={16} /> A data mudou. Responda para a nova data.</p>
              <button className="button primary full" onClick={() => onReply(event)}>Reconfirmar disponibilidade <ArrowRight size={17} /></button>
            </>
          ) : (
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

export function Agenda({ mode, canManageUsers = false }: { mode: Mode; canManageUsers?: boolean }) {
  const admin = mode === "admin";
  const [adminData, setAdminData] = useState<AdminAgenda | null>(null);
  const [photoEvents, setPhotoEvents] = useState<PhotographerEvent[] | null>(null);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [loadError, setLoadError] = useState<RequestError | null>(null);
  const [reload, setReload] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [notice, setNotice] = useState("");
  const [mutation, setMutation] = useState(0);
  const version = useRef(0);

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
          if (isCurrent()) setAdminData(data);
        } else {
          const token = new URLSearchParams(window.location.hash.slice(1)).get("convite");
          if (token) {
            await apiRequest({ action: "join", token });
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
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

  const events = admin ? adminData?.events : photoEvents;
  const entries = events?.filter((event) => event.date.startsWith(month)) ?? [];
  const nextEvent = events?.find((event) => event.date.slice(0, 7) > month);
  const before = events?.findLast((event) => event.date.slice(0, 7) < month);
  const alternateMonth = (nextEvent ?? before)?.date.slice(0, 7);
  const currentMonth = today().slice(0, 7);
  const photoMonths = [...new Set([
    currentMonth, shiftMonth(currentMonth, 1), month, ...(photoEvents ?? []).map((event) => event.date.slice(0, 7)),
  ])].sort();
  const selected = panel?.kind === "replies" ? adminData?.events.find((event) => event.id === panel.eventId) : undefined;
  const invite = adminData?.invite ?? "";
  const reconfirmationsElsewhere = photoEvents?.filter((event) => event.needsReconfirmation && !event.date.startsWith(month)) ?? [];
  const replyEvent = panel?.kind === "reply" ? photoEvents?.find((event) => event.id === panel.event.id) : undefined;
  const canStart = Boolean(events);
  const showSignIn = admin && loadError?.status === 401;
  const showInviteGate = !admin && (loadError?.status === 401 || loadError?.status === 403);

  function finish(message: string, closePanel = true) {
    version.current += 1;
    setMutation(version.current);
    if (closePanel) setPanel(null);
    setNotice(message);
  }

  async function saveEvent(values: EventDetails, existing?: AdminEvent) {
    const { event } = await apiRequest<{ event: Omit<AdminEvent, "replies"> }>({
      action: existing ? "update" : "create-draft",
      eventId: existing?.id,
      dateRevision: existing?.dateRevision,
      ...values,
    }).catch(refreshOnConflict);
    const dateChanged = existing !== undefined && existing.dateRevision !== event.dateRevision;
    setAdminData((data) => data && {
      ...data,
      events: [
        ...data.events.filter((item) => item.id !== event.id),
        { ...event, replies: dateChanged ? [] : data.events.find((item) => item.id === event.id)?.replies ?? [] },
      ].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    });
    setMonth(event.date.slice(0, 7));
    if (dateChanged && event.published !== false) finish("Data alterada. A equipe precisa responder novamente.");
    else finish(existing ? "Evento atualizado." : "Rascunho salvo.");
  }

  function refreshOnConflict(cause: unknown): never {
    if (cause instanceof RequestError && (cause.status === 409 || cause.status === 404)) {
      setReload((count) => count + 1);
    }
    throw cause;
  }

  async function saveReply(event: PhotographerEvent, name: string, available: boolean) {
    const { reply } = await apiRequest<{ reply: Reply }>({
      action: "reply", eventId: event.id, dateRevision: event.dateRevision, name, available,
    }).catch(refreshOnConflict);
    setPhotoEvents((events) => events?.map((item) =>
      item.id === event.id && item.dateRevision === event.dateRevision
        ? { ...item, reply, needsReconfirmation: false } : item
    ) ?? null);
    setMonth(event.date.slice(0, 7));
    try { localStorage.setItem("alpha-set-nome", reply.name); } catch { /* The reply is already saved. */ }
    finish("Disponibilidade enviada para a Alpha Set.");
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

  async function publishEvent(id: string) {
    await apiRequest({ action: "publish", eventId: id }).catch(refreshOnConflict);
    setAdminData((data) => data && {
      ...data,
      events: data.events.map((event) => event.id === id ? { ...event, published: true } : event),
    });
    finish("Evento publicado na agenda da equipe.", false);
  }

  return (
    <div className="site">
      <header className="topbar">
        <div className="topbar-inner">
          <TeamMark />
          {admin ? (
            <div className="top-actions">
              <span className="role"><Shield size={15} /> Gestão</span>
              {canStart && <button className="button outline invite-button" onClick={() => setPanel({ kind: "invite" })}><Link2 size={17} /> <span>Link da equipe</span></button>}
              {canStart && <LogoutButton />}
            </div>
          ) : <span className="role"><Users size={16} /> Equipe</span>}
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

        {reconfirmationsElsewhere.length > 0 && (
          <section className="reconfirm-section" aria-labelledby="reconfirm-title">
            <h2 id="reconfirm-title">Eventos com nova data</h2>
            <ul>
              {reconfirmationsElsewhere.map((event) => (
                <li key={event.id}>
                  <span><strong>{event.name}</strong><small>{describeDate(event.date).dayMonth} de {event.date.slice(0, 4)}</small></span>
                  <button className="button outline" onClick={() => {
                    setMonth(event.date.slice(0, 7));
                    setPanel({ kind: "reply", event });
                  }}>Reconfirmar</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canStart ? (
          <section className="month-section" aria-label="Eventos por mês">
            <div className="month-header">
              <div className="month-heading">
                <h2>{monthLabel(month)}</h2>
                <span className="event-total">{entries.length} {entries.length === 1 ? "evento" : "eventos"}</span>
              </div>
              <div className="month-actions">
                <div className="month-nav" role="group" aria-label="Navegação mensal">
                  {admin ? (
                    <>
                      <button className="button outline" onClick={() => setMonth(shiftMonth(month, -1))}>Mês anterior</button>
                      <button className="button outline" onClick={() => setMonth(shiftMonth(month, 1))}>Próximo mês</button>
                    </>
                  ) : photoMonths.map((option) => (
                    <button key={option} className="button outline month-choice" aria-pressed={option === month}
                      onClick={() => setMonth(option)}>
                      {monthLabel(option, option.slice(0, 4) !== currentMonth.slice(0, 4))}
                    </button>
                  ))}
                </div>
                {canManageUsers && <button className="button outline" onClick={() => setPanel({ kind: "user" })}><Users size={17} /> Criar usuário</button>}
                {admin && <button className="button primary" onClick={() => setPanel({ kind: "event" })}><Plus size={19} /> Novo evento</button>}
              </div>
            </div>
            {loadError && <p className="form-error" role="alert">{loadError.message} <button className="text-button" onClick={() => setReload(reload + 1)}>Atualizar</button></p>}
            {entries.length ? (
              <div className="event-grid">
                {entries.map((event) => <EventCard key={event.id} event={event}
                  onReplies={(eventId) => setPanel({ kind: "replies", eventId })}
                  onEdit={(event) => setPanel({ kind: "event", event })}
                  onRemove={(event) => setPanel({ kind: "remove", event })}
                  onPublish={publishEvent}
                  onReply={(event, available) => setPanel({ kind: "reply", event, available })} />)}
              </div>
            ) : (
              <div className="empty">
                <div className="empty-icon"><CalendarDays size={26} /></div>
                <h3>Nenhum evento neste mês</h3>
                <p>{admin ? "Os eventos cadastrados para este mês aparecem aqui." : "Quando a Alpha Set cadastrar um evento para este mês, ele aparece aqui."}</p>
                {admin && alternateMonth && <button className="button outline" onClick={() => setMonth(alternateMonth)}>
                  {monthLabel(alternateMonth)} <ArrowRight size={17} />
                </button>}
              </div>
            )}
          </section>
        ) : (
          <section className="empty gate" aria-live="polite">
            <div className="empty-icon">{admin ? <Shield size={25} /> : <CalendarDays size={25} />}</div>
            <h2>{showInviteGate ? "Abra seu convite" : showSignIn ? "Acesse o painel" : loadError ? "Agenda indisponível" : "Carregando a agenda"}</h2>
            {loadError && <p>{loadError.message}</p>}
            {showSignIn && <a className="button primary" href="/entrar">Entrar no painel <ArrowRight size={18} /></a>}
            {loadError && !showSignIn && !showInviteGate && <button className="button outline" onClick={() => { setLoadError(null); setReload(reload + 1); }}>Tentar novamente</button>}
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
                <ReplyGroup replies={selected.replies.filter((reply) => reply.available)} available />
                <ReplyGroup replies={selected.replies.filter((reply) => !reply.available)} available={false} />
              </div>
              <div className="dialog-actions spread">
                <button className="button danger-light" onClick={() => setPanel({ kind: "remove", event: selected, fromReplies: true })}>Excluir evento</button>
                <button className="button outline" onClick={() => setPanel({ kind: "event", event: selected })}>Editar evento</button>
              </div>
            </div>
          )}
          {panel.kind === "replies" && !selected && <h2 id="dialog-title">Evento removido</h2>}
          {panel.kind === "reply" && (replyEvent ? (
            <ResponseForm key={replyEvent.dateRevision} event={replyEvent}
              available={replyEvent.dateRevision === panel.event.dateRevision ? panel.available : undefined}
              save={(name, available) => saveReply(replyEvent, name, available)} />
          ) : <h2 id="dialog-title">Evento removido</h2>)}
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

function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function logout() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/api/sessao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sair" }),
      });
      if (!response.ok) throw new Error();
      window.location.assign("/entrar");
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <>
      <button className="button icon outline" aria-label="Sair do painel" title="Sair do painel" disabled={busy} onClick={() => void logout()}>
        <LogOut size={17} />
      </button>
      {error && <div className="toast" role="alert">Não foi possível sair. Tente novamente.</div>}
    </>
  );
}

function Dialog({ close, children }: { close: () => void; children: React.ReactNode }) {
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

function useSubmit() {
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

function PublishEventForm({ publish }: { publish: () => Promise<void> }) {
  const { busy, error, submit } = useSubmit();
  return (
    <form className="publish-event" method="post" onSubmit={(event) => void submit(event, publish)}>
      <div className="publish-event-actions">
        <span className="event-total">Rascunho</span>
        <button className="button primary" disabled={busy}>{busy ? "Publicando…" : "Publicar"}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function EventForm({ existing, month, save }: { existing?: AdminEvent; month: string; save: (values: EventDetails) => Promise<void> }) {
  const [period, setPeriod] = useState<EventDetails["period"]>(existing?.period ?? "Manhã");
  const { busy, error, submit } = useSubmit();
  const currentDate = today();
  const initialDate = existing?.date ?? (currentDate.startsWith(month) ? currentDate : month + "-01");
  const [date, setDate] = useState(initialDate);
  return (
    <form method="post" onSubmit={(event) => void submit(event, (values) => save({
      name: String(values.get("name")), date: String(values.get("date")), time: String(values.get("time")),
      meetingTime: String(values.get("meetingTime") ?? "") || null,
      period, sport: values.get("sport") as Sport, location: String(values.get("location")),
    }))}>
      <h2 id="dialog-title">{existing ? "Editar evento" : "Novo evento"}</h2>
      <div className="form-fields">
        <label>Nome do evento<input autoFocus name="name" required minLength={2} maxLength={100} placeholder="Ex. Corrida no parque" defaultValue={existing?.name} /></label>
        <label>Localização<input name="location" required minLength={2} maxLength={160} placeholder="Ex. Praia do Caripi, Barcarena" defaultValue={existing?.location ?? ""} /></label>
        <label>Data<input name="date" type="date" required min="2000-01-01" max="2099-12-31" defaultValue={initialDate} onInput={(event) => setDate(event.currentTarget.value)} /></label>
        <div className="field-row event-times">
          <label>Horário de concentração<input name="meetingTime" type="time" defaultValue={existing?.meetingTime ?? ""} /></label>
          <label>Horário de largada<input name="time" type="time" required defaultValue={existing?.time} onInput={(event) => {
            if (!existing && event.currentTarget.value) setPeriod(suggestedPeriod(event.currentTarget.value));
          }} /></label>
        </div>
        <div className="field-row">
          <label>Período<select name="period" value={period} onChange={(event) => setPeriod(event.currentTarget.value as EventDetails["period"])}>
            {PERIODS.map((value) => <option key={value}>{value}</option>)}
          </select></label>
          <label>Modalidade<select name="sport" required defaultValue={existing?.sport ?? ""}>
            <option value="" disabled>Selecione</option>
            {SPORTS.map((value) => <option key={value}>{value}</option>)}
          </select></label>
        </div>
      </div>
      {existing && existing.published !== false && date && date !== existing.date && (
        <p className="date-alert" role="status"><CalendarDays size={16} /> Ao salvar a nova data, as respostas serão zeradas e a equipe precisará responder novamente.</p>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? "Salvando…" : existing ? "Salvar alterações" : "Salvar rascunho"} <Check size={18} /></button></div>
    </form>
  );
}

function ResponseForm({ event, available, save }: {
  event: PhotographerEvent;
  available?: boolean;
  save: (name: string, available: boolean) => Promise<void>;
}) {
  const { busy, error, submit } = useSubmit();
  const [defaultName] = useState(() => {
    if (event.reply?.name) return event.reply.name;
    try { return localStorage.getItem("alpha-set-nome") ?? ""; } catch { return ""; }
  });
  return (
    <form method="post" onSubmit={(submission) => void submit(submission, (values) => {
      const chosen = values.get("available");
      if (available === undefined && chosen !== "yes" && chosen !== "no") {
        throw new RequestError("Escolha uma opção de disponibilidade.", 400);
      }
      return save(String(values.get("name")), available ?? (chosen === "yes"));
    })}>
      {available !== undefined && (
        <span className={"count " + (available ? "available" : "unavailable")}>{available ? <Check size={16} /> : <X size={16} />}{available ? "Estou disponível" : "Não estou disponível"}</span>
      )}
      <h2 id="dialog-title">{event.name}</h2>
      <EventMetadata event={event} showYear />
      <div className="form-fields">
        <label>Seu nome<input autoFocus name="name" autoComplete="name" defaultValue={defaultName} minLength={2} maxLength={80} required placeholder="Nome e sobrenome" /></label>
      </div>
      {available === undefined && (
        <fieldset className="reconfirm-options">
          <legend>Disponibilidade para a nova data</legend>
          <label><input type="radio" name="available" value="yes" required /> Estou disponível</label>
          <label><input type="radio" name="available" value="no" required /> Não estou disponível</label>
        </fieldset>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? "Enviando…" : available === undefined ? "Reconfirmar" : "Enviar resposta"} <ArrowRight size={18} /></button></div>
    </form>
  );
}

function ReplyGroup({ replies, available }: { replies: Reply[]; available: boolean }) {
  return (
    <section className={"reply-group " + (available ? "available" : "unavailable")}>
      <h3>{available ? <Check size={17} /> : <X size={17} />}{available ? "Disponíveis" : "Indisponíveis"}<span>{replies.length}</span></h3>
      {replies.length ? <ul>{replies.map((reply, index) => <li key={index}>{reply.name}</li>)}</ul> : <p>Nenhuma resposta</p>}
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
      <h2 id="dialog-title">Link da equipe</h2>
      <p className="dialog-subtitle">Envie este link aos fotógrafos pelo WhatsApp.</p>
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
