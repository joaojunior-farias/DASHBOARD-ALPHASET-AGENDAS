"use client";

import { useState } from "react";
import { apiRequest, PasswordChangeFields, readNewPassword, RequestError, useSubmit } from "../agenda-ui";

export function LoginForm() {
  const [temporary, setTemporary] = useState<{ username: FormDataEntryValue | null; password: FormDataEntryValue | null } | null>(null);
  const { busy, error, submit } = useSubmit();
  return (
    <form method="post" onSubmit={(event) => void submit(event, async (fields) => {
      const credentials = { username: fields.get("username"), password: fields.get("password") };
      try {
        await apiRequest(temporary ? { ...temporary, action: "trocar-senha", newPassword: readNewPassword(fields) } : credentials, "/api/sessao");
      } catch (cause) {
        if (!temporary && cause instanceof RequestError && cause.status === 428) {
          setTemporary(credentials);
          return;
        }
        throw cause;
      }
      setTemporary(null);
      window.location.replace("/");
    })}>
      {temporary ? <PasswordChangeFields /> : <div className="form-fields">
        <label>Usuário<input autoFocus name="username" autoComplete="username" autoCapitalize="none" required maxLength={80} /></label>
        <label>Senha<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        {temporary && <button className="button outline" type="button" disabled={busy} onClick={() => setTemporary(null)}>Voltar</button>}
        <button className="button primary" disabled={busy}>{busy ? "Aguarde…" : temporary ? "Salvar senha e entrar" : "Entrar"}</button>
      </div>
    </form>
  );
}
