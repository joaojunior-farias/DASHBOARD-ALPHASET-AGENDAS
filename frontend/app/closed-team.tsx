"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminEvent } from "./agenda-model";
import { apiRequest, useSubmit } from "./agenda-ui";

type Photographer = { id: string; name: string; email: string };

export function ClosedTeam({ event, save }: { event: AdminEvent; save: (values: Record<string, unknown>) => Promise<void> }) {
  const [registered, setRegistered] = useState<Photographer[]>([]);
  const [accountId, setAccountId] = useState("");
  const [directoryError, setDirectoryError] = useState("");
  const { busy, error, submit } = useSubmit();
  useEffect(() => {
    let active = true;
    void apiRequest<{ photographers: Photographer[] }>(undefined, "/api/usuarios").then((data) => {
      if (active) setRegistered(data.photographers);
    }).catch(() => { if (active) setDirectoryError("Não foi possível carregar os fotógrafos cadastrados."); });
    return () => { active = false; };
  }, []);

  const selected = event.replies.filter((reply) => reply.selection === "confirmed");
  const selectedIds = new Set(selected.map((reply) => reply.accountId));
  const roster = [
    ...selected.map((reply) => ({ id: reply.id, name: reply.name, action: "unassign", caption: reply.accountId ? "Conta da agenda" : "Resposta anterior" })),
    ...(event.manual ?? []).map((row) => ({ ...row, action: "remove-manual", caption: "Nome inserido à mão" })),
  ];

  return <form className="closed-roster" method="post" onSubmit={(submission) => {
    const initiator = (submission.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const form = submission.currentTarget;
    void submit(submission, async (fields) => {
      if (initiator?.name === "unassign" || initiator?.name === "remove-manual") {
        await save({ action: initiator.name, assignmentId: initiator.value });
      } else {
        await save({ action: "assign", photographerId: fields.get("photographerId"), name: fields.get("name") });
        setAccountId("");
        form.reset();
      }
    });
  }}>
    <h3>Equipe escalada</h3>
    <div className="form-fields">
      <label>Fotógrafos cadastrados<select name="photographerId" value={accountId} onChange={(event) => setAccountId(event.currentTarget.value)}>
        <option value="">Selecione um fotógrafo</option>
        {registered.filter((person) => !selectedIds.has(person.id)).map((person) => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}
      </select></label>
      <label>Nome de fotógrafo sem cadastro<input name="name" minLength={2} maxLength={80} required={!accountId} disabled={Boolean(accountId)} /></label>
    </div>
    {(error || directoryError) && <p className="form-error" role="alert">{error || directoryError}</p>}
    <div className="dialog-actions"><button className="button primary" disabled={busy}><Plus size={17} /> {busy ? "Salvando…" : "Adicionar à escala"}</button></div>
    {roster.length > 0 ? <ul className="roster-list">{roster.map((member) => <li key={member.id}>
      <span>{member.name}<small>{member.caption}</small></span>
      <button className="button icon outline" aria-label={`Remover ${member.name}`} name={member.action} value={member.id}
        type="submit" formNoValidate disabled={busy}><X size={17} /></button>
    </li>)}</ul> : <p className="dialog-subtitle">Nenhum fotógrafo escalado.</p>}
  </form>;
}
