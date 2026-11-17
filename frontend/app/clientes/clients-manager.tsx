"use client";

import { Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest, Dialog, RequestError, useSubmit } from "../agenda-ui";
import { DashboardShell } from "../dashboard-shell";

export type Client = { id: string; name: string; email: string; phone: string };

export function ClientsManager() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [adding, setAdding] = useState(false);
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
        <button className="button primary" onClick={() => setAdding(true)}><Plus size={17} /> Cadastrar cliente</button>
      </div>
      {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button></p>}
      {!clients && !error && <p className="dialog-subtitle" role="status">Carregando clientes…</p>}
      {clients && <section className="users-section">
        <div className="form-fields"><label>Buscar cliente<input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} /></label></div>
        {matches?.length ? <ul className="users-list">{matches.map((client) => <li key={client.id}>
          <div><strong>{client.name}</strong>{client.email && <small>{client.email}</small>}{client.phone && <small>{client.phone}</small>}</div>
        </li>)}</ul> : <p className="dialog-subtitle">{clients.length ? "Nenhum cliente encontrado." : "Cadastre seu primeiro cliente para selecioná-lo nos eventos."}</p>}
      </section>}
    </main>
    {adding && <Dialog close={() => setAdding(false)}><ClientForm save={async (values) => {
      await apiRequest(values, "/api/clientes");
      setReload((value) => value + 1);
      setAdding(false);
      setNotice("Cliente cadastrado.");
    }} /></Dialog>}
    {notice && <div className="toast" role="status"><Check size={18} />{notice}</div>}
  </DashboardShell>;
}

function ClientForm({ save }: { save: (values: Record<string, unknown>) => Promise<void> }) {
  const [id] = useState(() => crypto.randomUUID());
  const { busy, error, submit } = useSubmit();
  return <form method="post" onSubmit={(event) => void submit(event, (fields) => save({
    id, name: fields.get("name"), email: fields.get("email"), phone: fields.get("phone"),
  }))}>
    <h2 id="dialog-title">Cadastrar cliente</h2>
    <div className="form-fields">
      <label>Nome do cliente<input name="name" autoFocus required minLength={2} maxLength={100} autoComplete="name" /></label>
      <label>E-mail <span className="field-optional">opcional</span><input name="email" type="email" maxLength={254} autoComplete="email" /></label>
      <label>Telefone <span className="field-optional">opcional</span><input name="phone" type="tel" maxLength={40} autoComplete="tel" /></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="button primary" disabled={busy}>{busy ? "Salvando…" : "Salvar cliente"}</button></div>
  </form>;
}
