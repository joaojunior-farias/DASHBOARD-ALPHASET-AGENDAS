function readOrigin(variable: string) {
  const value = process.env[variable];
  if (!value) throw new Error("Configure " + variable + ".");
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(loopback && url.protocol === "http:"))
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(variable + " deve ser a origem completa, sem caminho. Use HTTPS fora do computador.");
  }
  return url;
}

export function requestSite(headers: Pick<Headers, "get">) {
  const dashboard = readOrigin("DASHBOARD_URL");
  const agenda = readOrigin("AGENDA_URL");
  if (dashboard.hostname === agenda.hostname) {
    throw new Error("Use nomes de host diferentes para o painel e a agenda.");
  }

  const host = headers.get("host")?.toLowerCase();
  if (dashboard.host === host) return { kind: "dashboard" as const, origin: dashboard, agenda };
  if (agenda.host === host) return { kind: "agenda" as const, origin: agenda, agenda };
  return null;
}

