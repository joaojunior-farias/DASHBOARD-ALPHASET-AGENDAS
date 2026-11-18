"use client";

import { Check, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest, Dialog, RequestError, useSubmit } from "../agenda-ui";
import { DashboardShell } from "../dashboard-shell";

export type Client = { id: string; name: string; email: string; phone: string; version: number };

export function ClientsManager() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [panel, setPanel] = useState<"create" | Client | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    void apiRequest<{ clients: Client[] }>(undefined, "/api/clientes").then((data) => {
      if (active) { setClients(data.clients); setError(""); }
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof RequestError && cause.status === 401) window.location.assign("/entrar");
      else setError(cause instanceof RequestError ? cause.message : "Não foi possível carregar os clientes.");
    });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const matches = clients?.filter((client) => [client.name, client.email, client.phone].some((value) =>
    value.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))));
  return <DashboardShell area="clients">
    <main className="main users-page">
      <div className="users-heading"><h1>Clientes</h1>
        <button className="button primary" onClick={() => setPanel("create")}><Plus size={17} /> Cadastrar cliente</button>
      </div>
      {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button></p>}
      {!clients && !error && <p className="dialog-subtitle" role="status">Carregando clientes…</p>}
      {clients && <section className="users-section">
        <div className="form-fields"><label>Buscar cliente<input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} /></label></div>
        {matches?.length ? <ul className="users-list">{matches.map((client) => <li key={client.id}>
          <div><strong>{client.name}</strong>{client.email && <small>{client.email}</small>}{client.phone && <small>{client.phone}</small>}</div>
          <button className="button outline" aria-label={`Editar ${client.name}`} onClick={() => setPanel(client)}><Pencil size={16} /> Editar</button>
        </li>)}</ul> : <p className="dialog-subtitle">{clients.length ? "Nenhum cliente encontrado." : "Cadastre seu primeiro cliente para selecioná-lo nos eventos."}</p>}
      </section>}
    </main>
    {panel && <Dialog close={() => setPanel(null)}><ClientForm key={panel === "create" ? "create" : panel.id}
      existing={panel === "create" ? undefined : panel} save={async (values) => {
        try {
          await apiRequest(values, "/api/clientes");
        } catch (cause) {
          if (cause instanceof RequestError && cause.status === 409) setReload((value) => value + 1);
          throw cause;
        }
        setReload((value) => value + 1);
        setPanel(null);
        setNotice(panel === "create" ? "Cliente cadastrado." : "Dados do cliente atualizados.");
      }} /></Dialog>}
    {notice && <div className="toast" role="status"><Check size={18} />{notice}</div>}
  </DashboardShell>;
}

function ClientForm({ existing, save }: { existing?: Client; save: (values: Record<string, unknown>) => Promise<void> }) {
  const [id] = useState(() => existing?.id ?? crypto.randomUUID());
  const { busy, error, submit } = useSubmit();
  return <form method="post" onSubmit={(event) => void submit(event, (fields) => save({
    id, action: existing ? "update" : "create", version: existing?.version, name: fields.get("name"), email: fields.get("email"), phone: fields.get("phone"),
  }))}>
    <h2 id="dialog-title">{existing ? "Editar cliente" : "Cadastrar cliente"}</h2>
    <div className="form-fields">
      <label>Nome do cliente<input name="name" autoFocus required minLength={2} maxLength={100} autoComplete="name" defaultValue={existing?.name} /></label>
      <label>E-mail <span className="field-optional">opcional</span><input name="email" type="email" maxLength={254} autoComplete="email" defaultValue={existing?.email} /></label>
      <label>Telefone <span className="field-optional">opcional</span><input name="phone" type="tel" maxLength={40} autoComplete="tel" defaultValue={existing?.phone} /></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Salvar cliente"}</button></div>
  </form>;
}
