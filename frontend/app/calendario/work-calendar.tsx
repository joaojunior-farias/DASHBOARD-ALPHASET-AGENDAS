"use client";

import { ArrowLeft, ArrowRight, CalendarDays, Check, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest, Dialog, DistanceFields, EventForm, LogoutButton, readDistances, RequestError, TeamMark, useSubmit } from "../agenda";
import { describeDate, monthLabel, shiftMonth, suggestedPeriod, today, type EventDetails, type Sport } from "../agenda-model";

const colorLabels = { gray: "Cinza", blue: "Azul", orange: "Laranja", green: "Verde", purple: "Roxo", red: "Vermelho" } as const;
type StatusColor = keyof typeof colorLabels;
const optionGroups = [
  { kind: "category", title: "Categorias", action: "Criar categoria" },
  { kind: "modality", title: "Modalidades", action: "Criar modalidade" },
  { kind: "status", title: "Status", action: "Criar status" },
  { kind: "work_type", title: "Tipos de trabalho", action: "Criar tipo de trabalho" },
] as const;
type OptionGroup = (typeof optionGroups)[number];
type CalendarOption = {
  id: string; kind: OptionGroup["kind"]; name: string; code: string | null;
  parentId: string | null; color: StatusColor | null; cardSport: Sport | null;
};
type CalendarEvent = {
  id: string; name: string; clientName: string; date: string; time: string; location: string;
  categoryId: string; modalityId: string | null; statusId: string; workTypeId: string;
  distancesKm: number[]; version: number; cardId: string | null;
};
type Editor = { kind: "editor"; id: string; date: string; event?: CalendarEvent };
type Panel = Editor | { kind: "day"; date: string } | { kind: "card"; event: CalendarEvent };
type CalendarData = { options: CalendarOption[]; events: CalendarEvent[] };

function datesInGrid(month: string) {
  const first = new Date(`${month}-01T12:00:00Z`);
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function WorkCalendar() {
  const currentDate = today();
  const [month, setMonth] = useState(() => currentDate.slice(0, 7));
  const [settings, setSettings] = useState(false);
  const [loaded, setLoaded] = useState<(CalendarData & { month: string }) | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<CalendarData>(undefined, `/api/calendario?mes=${month}`).then((data) => {
      if (!active) return;
      setLoaded({ ...data, month });
      setError("");
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof RequestError && cause.status === 401) window.location.assign("/entrar");
      else setError(cause instanceof RequestError ? cause.message : "Falha ao carregar o calendário.");
    });
    return () => { active = false; };
  }, [month, reload]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const options = loaded?.options ?? [];
  const byId = new Map(options.map((option) => [option.id, option]));
  const monthEvents = loaded?.month === month ? loaded.events : [];
  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of monthEvents) {
    const day = byDate.get(event.date) ?? [];
    day.push(event);
    byDate.set(event.date, day);
  }

  function selectMonth(value: string) {
    setError("");
    setMonth(value);
  }

  function newEvent(date: string) {
    setPanel({ kind: "editor", id: crypto.randomUUID(), date });
  }

  function openEvent(event: CalendarEvent) {
    setPanel({ kind: "editor", id: event.id, date: event.date, event });
  }

  async function saveEvent(editor: Editor, details: Record<string, unknown>, makeCard: boolean) {
    const { event } = await apiRequest<{ event: CalendarEvent }>({
      ...details, action: editor.event ? "update" : "create", id: editor.id, version: editor.event?.version,
    }, "/api/calendario").catch((cause: unknown) => {
      if (cause instanceof RequestError && cause.status === 409) setReload((value) => value + 1);
      throw cause;
    });
    const eventMonth = event.date.slice(0, 7);
    setLoaded((current) => current && {
      ...current,
      events: [
        ...current.events.filter((item) => item.id !== event.id),
        ...(eventMonth === current.month ? [event] : []),
      ].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    });
    selectMonth(eventMonth);
    setReload((value) => value + 1);
    setNotice("Evento salvo no calendário.");
    if (makeCard && event.cardId) window.location.assign(`/?evento=${event.cardId}`);
    else setPanel(makeCard ? { kind: "card", event } : null);
  }

  async function createOption(values: Record<string, unknown>) {
    const { option } = await apiRequest<{ option: CalendarOption }>({ ...values, action: "option" }, "/api/calendario");
    setLoaded((current) => current && {
      ...current, options: [...current.options, option].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    });
    setNotice("Opção cadastrada.");
    return option;
  }

  async function saveCard(event: CalendarEvent, values: EventDetails) {
    const { event: card } = await apiRequest<{ event: { id: string } }>({ ...values, action: "create-calendar-card", calendarEventId: event.id });
    window.location.assign(`/?evento=${card.id}`);
  }

  return (
    <div className="site">
      <header className="topbar">
        <div className="topbar-inner">
          <TeamMark />
          <div className="top-actions">
            <Link className="button outline" href="/"><ArrowLeft size={16} /> Agenda da equipe</Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="main work-calendar">
        <h1>{settings ? "Configurações do calendário" : "Calendário de trabalho"}</h1>
        <div className="agenda-views calendar-views" role="group" aria-label="Seções do calendário">
          <button className="button outline" aria-pressed={!settings} onClick={() => setSettings(false)}><CalendarDays size={17} /> Calendário</button>
          <button className="button outline" aria-pressed={settings} onClick={() => setSettings(true)}><Settings size={17} /> Configurações</button>
        </div>
        {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button></p>}
        {settings ? (loaded && (
          <div className="calendar-settings">
            {optionGroups.map((group) => <CatalogGroup key={group.kind} group={group} options={options} save={createOption} />)}
          </div>
        )) : (
          <section aria-labelledby="calendar-month">
            <div className="calendar-toolbar">
              <h2 id="calendar-month">{monthLabel(month)}</h2>
              <div className="month-actions">
                <button className="button outline" aria-label="Mês anterior" disabled={month === "2000-01"} onClick={() => selectMonth(shiftMonth(month, -1))}><ArrowLeft size={17} /></button>
                <button className="button outline" onClick={() => selectMonth(currentDate.slice(0, 7))}>Hoje</button>
                <button className="button outline" aria-label="Próximo mês" disabled={month === "2099-12"} onClick={() => selectMonth(shiftMonth(month, 1))}><ArrowRight size={17} /></button>
                <button className="button primary" disabled={!loaded} onClick={() => newEvent(currentDate.startsWith(month) ? currentDate : `${month}-01`)}><Plus size={17} /> Novo evento</button>
              </div>
            </div>
            {loaded?.month !== month && !error && <p className="dialog-subtitle" role="status">Carregando calendário…</p>}
            <div className="calendar-grid">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((name) => <span className="calendar-weekday" key={name} aria-hidden="true">{name}</span>)}
              {datesInGrid(month).map((date) => {
                const items = byDate.get(date) ?? [];
                const withinMonth = date.startsWith(month);
                return (
                  <div className={`calendar-day${withinMonth ? "" : " outside"}${items.length ? " booked" : ""}`} key={date}>
                    <button type="button" className="calendar-date" aria-current={date === currentDate ? "date" : undefined}
                      aria-label={`${describeDate(date).dayMonth}, ${items.length} ${items.length === 1 ? "evento" : "eventos"}`}
                      disabled={!withinMonth || loaded?.month !== month} onClick={() => items.length ? setPanel({ kind: "day", date }) : newEvent(date)}>
                      <span>{Number(date.slice(-2))}</span>
                      {items.length > 0 && <span className="calendar-markers" aria-hidden="true">
                        {items.slice(0, 3).map((event) => <span key={event.id} data-color={byId.get(event.statusId)?.color ?? "gray"} />)}
                      </span>}
                    </button>
                    {items.length > 0 && <div className="calendar-slots">
                      {items.slice(0, 3).map((event) => <button className="calendar-slot" data-color={byId.get(event.statusId)?.color ?? "gray"}
                        key={event.id} title={`${event.time} · ${event.name} · ${byId.get(event.statusId)?.name ?? ""}`}
                        aria-label={`${event.time}, ${event.name}, ${byId.get(event.statusId)?.name ?? ""}`} onClick={() => openEvent(event)}>
                        <time>{event.time}</time> <span>{event.name}</span>
                      </button>)}
                      {items.length > 3 && <button className="calendar-more" onClick={() => setPanel({ kind: "day", date })}>+ {items.length - 3} eventos</button>}
                    </div>}
                  </div>
                );
              })}
            </div>
            {options.length > 0 && <details className="calendar-status-legend">
              <summary>Legenda de status</summary>
              <div className="calendar-legend">
                {options.filter((option) => option.kind === "status").map((option) => <span key={option.id} className="calendar-tag" data-color={option.color}>{option.name}</span>)}
              </div>
            </details>}
          </section>
        )}
        <footer className="footer"><b>Alpha Set</b> · Calendário de trabalho</footer>
      </main>
      {panel && (
        <Dialog key={panel.kind} close={() => setPanel(null)}>
          {panel.kind === "day" && (
            <>
              <h2 id="dialog-title">Eventos de {describeDate(panel.date).dayMonth}</h2>
              <div className="calendar-day-list">
                {(byDate.get(panel.date) ?? []).map((event) => <button className="calendar-slot" key={event.id} data-color={byId.get(event.statusId)?.color}
                  onClick={() => openEvent(event)}><time>{event.time}</time><span>{event.name}</span><small>{byId.get(event.statusId)?.name}</small></button>)}
              </div>
              <div className="dialog-actions"><button className="button primary" onClick={() => newEvent(panel.date)}><Plus size={17} /> Novo evento</button></div>
            </>
          )}
          {panel.kind === "editor" && <CalendarEditor key={panel.id} editor={panel} options={options} save={(values, card) => saveEvent(panel, values, card)} />}
          {panel.kind === "card" && <EventForm month={month} save={(values) => saveCard(panel.event, values)} defaults={{
            name: panel.event.name, date: panel.event.date, time: panel.event.time, period: suggestedPeriod(panel.event.time),
            location: panel.event.location, distancesKm: panel.event.distancesKm,
            sport: byId.get(panel.event.modalityId ?? "")?.cardSport ?? "Outro",
          }} />}
        </Dialog>
      )}
      {notice && <div className="toast" role="status"><Check size={18} />{notice}</div>}
    </div>
  );
}

function CalendarEditor({ editor, options, save }: {
  editor: Editor; options: CalendarOption[]; save: (values: Record<string, unknown>, card: boolean) => Promise<void>;
}) {
  const existing = editor.event;
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [modalityId, setModalityId] = useState(existing?.modalityId ?? "");
  const { busy, error, submit } = useSubmit();
  const sports = options.some((option) => option.id === categoryId && option.code === "sports");
  const categories = options.filter((option) => option.kind === "category");
  const modalities = options.filter((option) => option.parentId === categoryId);
  const statuses = options.filter((option) => option.kind === "status");
  const workTypes = options.filter((option) => option.kind === "work_type");
  return (
    <form method="post" onSubmit={(event) => {
      const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
      void submit(event, (fields) => save({
        name: fields.get("name"), clientName: fields.get("clientName"), date: fields.get("date"), time: fields.get("time"),
        location: fields.get("location"), categoryId, modalityId: modalityId || null,
        statusId: fields.get("statusId"), workTypeId: fields.get("workTypeId"), distancesKm: readDistances(fields),
      }, intent === "card"));
    }}>
      <h2 id="dialog-title">{existing ? "Editar evento do calendário" : "Novo evento no calendário"}</h2>
      <div className="form-fields">
        <label>Nome do evento<input autoFocus name="name" required minLength={2} maxLength={100} defaultValue={existing?.name} /></label>
        <label>Nome do cliente<input name="clientName" maxLength={100} defaultValue={existing?.clientName} /></label>
        <div className="field-row">
          <label>Data<input name="date" type="date" required min="2000-01-01" max="2099-12-31" defaultValue={editor.date} /></label>
          <label>Hora<input name="time" type="time" required defaultValue={existing?.time} /></label>
        </div>
        <label>Local<input name="location" maxLength={160} defaultValue={existing?.location} /></label>
        <div className="field-row">
          <label>Categoria<select name="categoryId" required value={categoryId} onChange={(event) => {
            setCategoryId(event.currentTarget.value);
            setModalityId("");
          }}><option value="" disabled>Selecione</option>{categories.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}</select></label>
          <label>Modalidade<select name="modalityId" value={modalityId} onChange={(event) => setModalityId(event.currentTarget.value)}>
            <option value="">Sem modalidade</option>{modalities.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
          </select></label>
        </div>
        <div className="field-row">
          <label>Status<select name="statusId" required defaultValue={existing?.statusId ?? statuses.find((option) => option.code === "quote")?.id}>
            {statuses.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
          </select></label>
          <label>Tipo de trabalho<select name="workTypeId" required defaultValue={existing?.workTypeId ?? workTypes.find((option) => option.code === "photo")?.id}>
            {workTypes.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
          </select></label>
        </div>
        {sports && <DistanceFields initial={existing?.distancesKm} />}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        {existing?.cardId && <Link className="button outline" href={`/?evento=${existing.cardId}`}>Abrir card <ArrowRight size={17} /></Link>}
        <button className="button primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar evento"} <Check size={17} /></button>
        {sports && !existing?.cardId && <button className="button outline" type="submit" value="card" disabled={busy}>Salvar e criar card</button>}
      </div>
    </form>
  );
}

function CatalogGroup({ group, options, save }: {
  group: OptionGroup; options: CalendarOption[]; save: (values: Record<string, unknown>) => Promise<CalendarOption>;
}) {
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const { busy, error, submit } = useSubmit();
  const entries = options.filter((option) => option.kind === group.kind);
  const categories = options.filter((option) => option.kind === "category");
  const color = entries.find((option) => option.id === selectedId)?.color;
  return (
    <section className="calendar-catalog">
      <div className="calendar-catalog-heading"><h2>{group.title}</h2>
        {!adding && <button className="button outline" onClick={() => setAdding(true)}><Plus size={16} /> {group.action}</button>}
      </div>
      {adding && <form method="post" onSubmit={(event) => void submit(event, async (fields) => {
        const option = await save({ kind: group.kind, name: fields.get("name"), parentId: fields.get("parentId"), color: fields.get("color") });
        setSelectedId(option.id);
        setAdding(false);
      })}>
        <div className="form-fields">
          <label>Nome<input name="name" autoFocus required minLength={2} maxLength={60} /></label>
          {group.kind === "modality" && <label>Categoria<select name="parentId" defaultValue="" required>
            <option value="" disabled>Selecione</option>{categories.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
          </select></label>}
          {group.kind === "status" && <label>Cor<select name="color" required>{Object.entries(colorLabels).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button className="button outline" type="button" disabled={busy} onClick={() => setAdding(false)}>Cancelar</button>
          <button className="button primary" disabled={busy}>{busy ? "Salvando…" : group.action}</button></div>
      </form>}
      <div className="calendar-catalog-select">
        <select aria-label={`Opções de ${group.title.toLowerCase()}`} value={selectedId} onChange={(event) => setSelectedId(event.currentTarget.value)}>
          <option value="" disabled>Ver opções cadastradas</option>
          {group.kind === "modality" ? categories.map((category) => {
            const modalities = entries.filter((entry) => entry.parentId === category.id);
            if (!modalities.length) return null;
            return <optgroup key={category.id} label={category.name}>
              {modalities.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
            </optgroup>;
          }) : entries.map(({ id, name }) => <option value={id} key={id}>{name}</option>)}
        </select>
        {color && <span className="calendar-color-dot" data-color={color} role="img" aria-label={colorLabels[color]} />}
      </div>
    </section>
  );
}
