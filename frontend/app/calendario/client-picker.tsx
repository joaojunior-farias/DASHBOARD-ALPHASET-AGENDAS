"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiRequest } from "../agenda-ui";
import type { Client } from "../clientes/clients-manager";

export function ClientPicker({ initialId, initialName }: { initialId?: string | null; initialName?: string }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(initialId ?? "");
  const [clientName, setClientName] = useState(initialName ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await apiRequest<{ clients: Client[] }>(undefined, "/api/clientes");
        if (active) { setClients(data.clients); setError(""); }
      } catch {
        if (active) setError("Não foi possível atualizar a lista de clientes.");
      }
    }
    void load();
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, []);
  const selected = clients.find((client) => client.id === clientId);
  return <div className="calendar-client">
    <label>Cliente cadastrado<select name="clientId" value={clientId} onChange={(event) => {
      if (selected) setClientName(selected.name);
      setClientId(event.currentTarget.value);
    }}>
      <option value="">Digitar nome do cliente</option>
      {clientId && !selected && <option value={clientId}>{initialName || "Cliente selecionado"}</option>}
      {clients.map((client) => <option key={client.id} value={client.id}>{client.name}{client.email ? ` · ${client.email}` : ""}</option>)}
    </select></label>
    {!clientId && <label>Nome do cliente<input name="clientName" maxLength={100} value={clientName} onChange={(event) => setClientName(event.currentTarget.value)} /></label>}
    {error && <p className="form-error" role="alert">{error} Você pode digitar o nome do cliente.</p>}
    <Link href="/clientes" target="_blank" rel="noopener noreferrer" className="text-button">Cadastrar cliente em nova aba</Link>
  </div>;
}
