"use client";

import { Check, KeyRound, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { CreateUserForm } from "../agenda";
import { apiRequest, Dialog, RequestError, useSubmit } from "../agenda-ui";
import { DashboardShell } from "../dashboard-shell";

type Operator = { id: string; name: string; mustChangePassword: boolean };
type Photographer = Operator & { email: string };
type Accounts = { users: Operator[]; photographers: Photographer[]; resetAvailable: boolean };
type Panel = { kind: "create" } | { kind: "operator" | "photographer"; account: Operator };

export function UsersManager() {
  const [accounts, setAccounts] = useState<Accounts | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void apiRequest<Accounts>(undefined, "/api/usuarios").then((data) => {
      if (active) { setAccounts(data); setError(""); }
    }).catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof RequestError && cause.status === 401) window.location.assign("/entrar");
      else setError(cause instanceof RequestError ? cause.message : "Não foi possível carregar as contas.");
    });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function resetPassword(target: Exclude<Panel, { kind: "create" }>) {
    await apiRequest({ action: "reset", kind: target.kind, id: target.account.id }, "/api/usuarios");
    setReload((value) => value + 1);
    setPanel(null);
    setNotice("Senha redefinida. A troca será exigida no próximo acesso.");
  }

  return <DashboardShell area="users">
    <main className="main users-page">
      <div className="users-heading">
        <h1>Usuários</h1>
        <button className="button primary" onClick={() => setPanel({ kind: "create" })}><UserPlus size={17} /> Criar usuário</button>
      </div>
      {error && <p className="form-error" role="alert">{error} <button className="text-button" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button></p>}
      {!accounts && !error && <p className="dialog-subtitle" role="status">Carregando contas…</p>}
      {accounts && <>
        {!accounts.resetAvailable && <p className="dialog-subtitle">Para habilitar o reset, configure <code>USER_RESET_PASSWORD</code> no backend com 12 a 256 caracteres.</p>}
        <AccountList title="Usuários do dashboard" entries={accounts.users} resetAvailable={accounts.resetAvailable}
          select={(account) => setPanel({ kind: "operator", account })} />
        <AccountList title="Fotógrafos cadastrados" entries={accounts.photographers} resetAvailable={accounts.resetAvailable}
          select={(account) => setPanel({ kind: "photographer", account })} />
      </>}
    </main>
    {panel && <Dialog close={() => setPanel(null)}>
      {panel.kind === "create" ? <CreateUserForm save={async (username, password) => {
        await apiRequest({ username, password }, "/api/usuarios");
        setReload((value) => value + 1);
        setPanel(null);
        setNotice("Usuário cadastrado.");
      }} /> : <ResetForm name={panel.account.name} reset={() => resetPassword(panel)} />}
    </Dialog>}
    {notice && <div className="toast" role="status"><Check size={18} />{notice}</div>}
  </DashboardShell>;
}

function AccountList({ title, entries, resetAvailable, select }: {
  title: string; entries: (Operator & { email?: string })[]; resetAvailable: boolean; select: (account: Operator) => void;
}) {
  return <section className="users-section">
    <h2>{title}</h2>
    {entries.length ? <ul className="users-list">{entries.map((entry) => <li key={entry.id}>
      <div><strong>{entry.name}</strong>{entry.email && <small>{entry.email}</small>}
        {entry.mustChangePassword && <small>Troca de senha pendente</small>}
      </div>
      <button className="button outline" type="button" disabled={!resetAvailable} onClick={() => select(entry)}><KeyRound size={16} /> Resetar senha</button>
    </li>)}</ul> : <p className="dialog-subtitle">Nenhuma conta cadastrada.</p>}
  </section>;
}

function ResetForm({ name, reset }: { name: string; reset: () => Promise<void> }) {
  const { busy, error, submit } = useSubmit();
  return <form method="post" onSubmit={(event) => void submit(event, reset)}>
    <h2 id="dialog-title">Resetar senha de {name}</h2>
    <p className="dialog-subtitle">A conta receberá a senha temporária padrão. As sessões atuais serão encerradas e a pessoa precisará escolher outra senha no próximo acesso.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Resetando…" : "Confirmar reset"}</button></div>
  </form>;
}
