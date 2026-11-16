"use client";

import { type FormEvent, useRef, useState } from "react";

export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const fields = new FormData(event.currentTarget);
    const username = fields.get("username");
    const password = fields.get("password");
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sessao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (response.ok) {
        window.location.replace("/");
        return;
      }
      setError(response.status === 401 ? "Usuário ou senha incorretos." : "Não foi possível entrar. Tente novamente.");
    } catch {
      setError("Não foi possível entrar. Tente novamente.");
    }
    pending.current = false;
    setBusy(false);
  }

  return (
    <form method="post" onSubmit={(event) => void submit(event)}>
      <div className="form-fields">
        <label>Usuário
          <input autoFocus name="username" autoComplete="username" autoCapitalize="none" required maxLength={80} />
        </label>
        <label>Senha
          <input name="password" type="password" autoComplete="current-password" required maxLength={256} />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="button primary" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
      </div>
    </form>
  );
}
