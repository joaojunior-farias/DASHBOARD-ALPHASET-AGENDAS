"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, RequestError } from "../agenda-ui";
import { SearchSelect, searchableText } from "../search-select";
import type { Client } from "../clientes/clients-manager";

export function ClientPicker({ initialId, initialName, onBusyChange }: {
  initialId?: string | null; initialName?: string; onBusyChange: (busy: boolean) => void;
}) {
  const [search, setSearch] = useState(initialName ?? "");
  const [clientId, setClientId] = useState(initialId ?? "");
  const [result, setResult] = useState<{ query: string; clients: Client[] } | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const pending = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void apiRequest<{ clients: Client[] }>(undefined, `/api/clientes?busca=${encodeURIComponent(search)}`).then((data) => {
        if (active) { setResult({ query: search, clients: data.clients }); setError(""); }
      }).catch((cause: unknown) => {
        if (active) { setResult({ query: search, clients: [] }); setError(cause instanceof RequestError ? cause.message : "Não foi possível buscar os clientes."); }
      });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search, reload]);

  const loading = result?.query !== search;
  const clients = !loading && result ? result.clients : [];
  const name = search.trim().replace(/\s+/gu, " ");
  const exists = clients.some((client) => searchableText(client.name) === searchableText(name));
  async function createClient() {
    if (pending.current) return;
    pending.current = true;
    setCreating(true);
    onBusyChange(true);
    setError("");
    const key = searchableText(name);
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    try {
      const { client } = await apiRequest<{ client: Client }>({ action: "quick-create", id: attempt.current.id, name }, "/api/clientes");
      setClientId(client.id);
      setSearch(client.name);
      setResult({ query: client.name, clients: [client] });
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof RequestError ? cause.message : "Não foi possível cadastrar o cliente.");
    } finally {
      pending.current = false;
      setCreating(false);
      onBusyChange(false);
    }
  }
  return <div className="calendar-client">
    <input type="hidden" name="clientId" value={clientId} />
    <SearchSelect label="Cliente" inputName="clientName" search={search} value={clientId} options={clients.map((client) => ({
      id: client.id, name: client.name, detail: [client.email, client.phone].filter(Boolean).join(" · "),
    }))} loading={loading} disabled={creating} placeholder="Digite o nome para buscar ou cadastrar"
      onSearch={(text) => { setSearch(text); setClientId(""); setError(""); }}
      onSelect={(option) => { setClientId(option.id); setSearch(option.name); setError(""); }}
      emptyMessage={error ? "Busca indisponível." : "Nenhum cliente encontrado."}>
      {!clientId && !loading && !error && !exists && name.length >= 2 && name.length <= 100 && <button
        className="button outline search-select-create" type="button" disabled={creating}
        onClick={() => void createClient()}>{creating ? "Cadastrando…" : `Cadastrar “${name}”`}</button>}
      {error && <p className="form-error" role="alert">{error} <button className="text-button" type="button" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button></p>}
    </SearchSelect>
    {clientId && <p className="field-optional" role="status">Cliente selecionado.</p>}
    {creating && <p className="field-optional" role="status">Cadastrando cliente…</p>}
  </div>;
}
