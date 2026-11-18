"use client";

import { LogOut, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function apiRequest<T>(
  input?: Record<string, unknown>,
  endpoint: `/api/clientes?busca=${string}` | "/api/clientes" | "/api/agenda" | "/api/sessao" | "/api/perfil" | "/api/usuarios" | "/api/fotografos" | "/api/calendario" | `/api/calendario?mes=${string}` = "/api/agenda",
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
      <button className={photographer ? "button icon outline" : "button outline"} aria-label={photographer ? "Sair da agenda" : "Sair do painel"} disabled={busy} onClick={() => void logout()}>
        <LogOut size={17} />{!photographer && "Sair"}
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

export function PasswordChangeFields() {
  return <div className="form-fields">
    <p className="dialog-subtitle">Defina uma nova senha para continuar.</p>
    <label>Nova senha<input name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>
    <label>Confirme a nova senha<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={256} /></label>
  </div>;
}

export function readNewPassword(fields: FormData) {
  const password = fields.get("newPassword");
  if (password !== fields.get("confirmPassword")) throw new RequestError("As senhas precisam ser iguais.", 400);
  return password;
}
