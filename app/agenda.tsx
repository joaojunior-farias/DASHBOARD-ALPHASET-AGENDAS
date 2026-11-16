"use client";

import {
  ArrowRight, Bike, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, Footprints, Link2, LogOut, MapPin, Mountain, Plus, Shield, Users, X,
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
  | { kind: "reply"; event: PhotographerEvent; available: boolean }
  | { kind: "invite" }
  | { kind: "remove"; event: AdminEvent };

const sportIcons = { Bike, Corrida: Footprints, Trilha: Mountain, Outro: CalendarDays };
const sportStyles = { Bike: "bike", Corrida: "run", Trilha: "trail", Outro: "other" };

class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function agendaRequest<T>(input?: Record<string, unknown>) {
  const response = await fetch("/api/agenda", input ? {
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

function EventCard({ event, onReplies, onReply }: {
  event: AdminEvent | PhotographerEvent;
  onReplies: (eventId: string) => void;
  onReply: (event: PhotographerEvent, available: boolean) => void;
}) {
  const { weekday, dayMonth } = describeDate(event.date);
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
      <div className="event-meta">
        <span><CalendarDays size={16} />{dayMonth}</span>
        <span><Clock3 size={16} />{event.time} <i aria-hidden="true">·</i> {event.period}</span>
        {event.location && <span className="event-location"><MapPin size={16} />{event.location}</span>}
      </div>
      {admin ? (
        <div className="card-bottom">
          <div className="card-counts">
            <span className="count available"><Check size={15} /> {available} <span>disponíveis</span></span>
            <span className="count unavailable"><X size={15} /> {event.replies.length - available} <span>indisponíveis</span></span>
          </div>
          <button className="button outline full" onClick={() => onReplies(event.id)}>Ver respostas <ArrowRight size={17} /></button>
        </div>
      ) : (
        <div className="card-bottom">
          {event.reply && <p className="sent" role="status"><Check size={16} /> Resposta enviada · {event.reply.available ? "Disponível" : "Indisponível"}</p>}
          <div className="response-buttons">
            <button className="button yes" onClick={() => onReply(event, true)}><Check size={16} />Estou disponível</button>
            <button className="button outline no" onClick={() => onReply(event, false)}><X size={16} />Não estou disponível</button>
          </div>
        </div>
      )}
    </article>
  );
}

export function Agenda({ mode }: { mode: Mode }) {
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
          const data = await agendaRequest<AdminAgenda>();
          if (isCurrent()) setAdminData(data);
        } else {
          const token = new URLSearchParams(window.location.hash.slice(1)).get("convite");
          if (token) {
            await agendaRequest({ action: "join", token });
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          }
          const data = await agendaRequest<PhotographerAgenda>();
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
  const meeting = events?.find((event) => event.date.slice(0, 7) > month);
  const before = events?.findLast((event) => event.date.slice(0, 7) < month);
  const alternateMonth = (meeting ?? before)?.date.slice(0, 7);
  const selected = panel?.kind === "replies" ? adminData?.events.find((event) => event.id === panel.eventId) : undefined;
  const invite = adminData?.invite ?? "";
  const canStart = Boolean(events);
  const showSignIn = admin && loadError?.status === 401;
  const showInviteGate = !admin && (loadError?.status === 401 || loadError?.status === 403);

  function finish(message: string) {
    version.current += 1;
    setMutation(version.current);
    setPanel(null);
    setNotice(message);
  }

  async function saveEvent(values: EventDetails, existing?: AdminEvent) {
    const { event } = await agendaRequest<{ event: AgendaEvent }>({
      action: existing ? "update" : "create", eventId: existing?.id, ...values,
    });
    setAdminData((data) => data && {
      ...data,
      events: [...data.events.filter((item) => item.id !== event.id), { ...event, replies: existing?.replies ?? [] }]
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    });
    setMonth(event.date.slice(0, 7));
    finish(existing ? "Evento atualizado." : "Evento cadastrado.");
  }

  async function saveReply(eventId: string, name: string, available: boolean) {
    const { reply } = await agendaRequest<{ reply: Reply }>({ action: "reply", eventId, name, available });
    setPhotoEvents((events) => events?.map((event) => event.id === eventId ? { ...event, reply } : event) ?? null);
    try { localStorage.setItem("alpha-set-nome", reply.name); } catch { /* The reply is already saved. */ }
    finish("Disponibilidade enviada para a Alpha Set.");
  }

  async function removeEvent(id: string) {
    await agendaRequest({ action: "remove", eventId: id });
    setAdminData((data) => data && { ...data, events: data.events.filter((event) => event.id !== id) });
    finish("Evento excluído.");
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

        {canStart ? (
          <section className="month-section" aria-label="Eventos por mês">
            <div className="month-header">
              <div className="month-heading">
                <h2>{monthLabel(month)}</h2>
                <span className="event-total">{entries.length} {entries.length === 1 ? "evento" : "eventos"}</span>
              </div>
              <div className="month-actions">
                <div className="month-nav" aria-label="Navegação mensal">
                  <button className="button icon outline" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={20} /></button>
                  <button className="button icon outline" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={20} /></button>
                </div>
                {admin && <button className="button primary" onClick={() => setPanel({ kind: "event" })}><Plus size={19} /> Novo evento</button>}
              </div>
            </div>
            {loadError && <p className="form-error" role="alert">{loadError.message} <button className="text-button" onClick={() => setReload(reload + 1)}>Atualizar</button></p>}
            {entries.length ? (
              <div className="event-grid">
                {entries.map((event) => <EventCard key={event.id} event={event}
                  onReplies={(eventId) => setPanel({ kind: "replies", eventId })}
                  onReply={(event, available) => setPanel({ kind: "reply", event, available })} />)}
              </div>
            ) : (
              <div className="empty">
                <div className="empty-icon"><CalendarDays size={26} /></div>
                <h3>Nenhum evento neste mês</h3>
                <p>{admin ? "Os eventos cadastrados para este mês aparecem aqui." : "Quando a Alpha Set cadastrar um evento para este mês, ele aparece aqui."}</p>
                {alternateMonth && <button className="button outline" onClick={() => setMonth(alternateMonth)}>
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
              <p className="dialog-subtitle">{describeDate(selected.date).dayMonth} · {selected.time} · {selected.period}</p>
              {selected.location && <p className="dialog-subtitle location-line"><MapPin size={16} />{selected.location}</p>}
              <div className="reply-groups">
                <ReplyGroup replies={selected.replies.filter((reply) => reply.available)} available />
                <ReplyGroup replies={selected.replies.filter((reply) => !reply.available)} available={false} />
              </div>
              <div className="dialog-actions spread">
                <button className="button danger-light" onClick={() => setPanel({ kind: "remove", event: selected })}>Excluir evento</button>
                <button className="button outline" onClick={() => setPanel({ kind: "event", event: selected })}>Editar evento</button>
              </div>
            </div>
          )}
          {panel.kind === "replies" && !selected && <h2 id="dialog-title">Evento removido</h2>}
          {panel.kind === "reply" && <ResponseForm event={panel.event} available={panel.available}
            save={(name) => saveReply(panel.event.id, name, panel.available)} />}
          {panel.kind === "invite" && <InviteForm invite={invite} />}
          {panel.kind === "remove" && <ConfirmRemove event={panel.event} remove={() => removeEvent(panel.event.id)}
            cancel={() => setPanel({ kind: "replies", eventId: panel.event.id })} />}
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

function EventForm({ existing, month, save }: { existing?: AdminEvent; month: string; save: (values: EventDetails) => Promise<void> }) {
  const [period, setPeriod] = useState<EventDetails["period"]>(existing?.period ?? "Manhã");
  const { busy, error, submit } = useSubmit();
  const date = today();
  return (
    <form method="post" onSubmit={(event) => void submit(event, (values) => save({
      name: String(values.get("name")), date: String(values.get("date")), time: String(values.get("time")),
      period, sport: values.get("sport") as Sport, location: String(values.get("location")),
    }))}>
      <h2 id="dialog-title">{existing ? "Editar evento" : "Novo evento"}</h2>
      <div className="form-fields">
        <label>Nome do evento<input autoFocus name="name" required minLength={2} maxLength={100} placeholder="Ex. Corrida no parque" defaultValue={existing?.name} /></label>
        <label>Localização<input name="location" required minLength={2} maxLength={160} placeholder="Ex. Praia do Caripi, Barcarena" defaultValue={existing?.location ?? ""} /></label>
        <div className="field-row">
          <label>Data<input name="date" type="date" required min="2000-01-01" max="2099-12-31" defaultValue={existing?.date ?? (date.startsWith(month) ? date : month + "-01")} /></label>
          <label>Horário<input name="time" type="time" required defaultValue={existing?.time} onChange={(event) => {
            if (event.currentTarget.value) setPeriod(suggestedPeriod(event.currentTarget.value));
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
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? "Salvando…" : existing ? "Salvar alterações" : "Cadastrar evento"} <Check size={18} /></button></div>
    </form>
  );
}

function ResponseForm({ event, available, save }: { event: PhotographerEvent; available: boolean; save: (name: string) => Promise<void> }) {
  const { busy, error, submit } = useSubmit();
  const [defaultName] = useState(() => {
    if (event.reply?.name) return event.reply.name;
    try { return localStorage.getItem("alpha-set-nome") ?? ""; } catch { return ""; }
  });
  return (
    <form method="post" onSubmit={(submission) => void submit(submission, (values) => save(String(values.get("name"))))}>
      <span className={"count " + (available ? "available" : "unavailable")}>{available ? <Check size={16} /> : <X size={16} />}{available ? "Estou disponível" : "Não estou disponível"}</span>
      <h2 id="dialog-title">{event.name}</h2>
      <p className="dialog-subtitle">{describeDate(event.date).dayMonth} · {event.time}</p>
      {event.location && <p className="dialog-subtitle location-line"><MapPin size={16} />{event.location}</p>}
      <div className="form-fields">
        <label>Seu nome<input autoFocus name="name" autoComplete="name" defaultValue={defaultName} minLength={2} maxLength={80} required placeholder="Nome e sobrenome" /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? "Enviando…" : "Enviar resposta"} <ArrowRight size={18} /></button></div>
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
