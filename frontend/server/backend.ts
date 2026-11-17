import { requestSite } from "./config";

type Endpoint = "/api/clientes" | "/api/agenda" | "/api/calendario" | "/api/sessao" | "/api/usuarios" | "/api/fotografos" | "/api/perfil";
type HeadersReader = Pick<Headers, "get">;

function proxyError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function readBody(request: Request, limit: number) {
  const body = request.body;
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

export async function callBackend(incoming: HeadersReader, endpoint: Endpoint, body?: string, query?: URLSearchParams) {
  const site = requestSite(incoming);
  const allowedSite = endpoint === "/api/fotografos" ? "agenda" : "dashboard";
  if (!site || (endpoint !== "/api/agenda" && site.kind !== allowedSite)) {
    return proxyError("Página indisponível.", 404);
  }

  const backend = process.env.BACKEND_URL;
  const token = process.env.API_SERVICE_TOKEN;
  if (!backend || !token || !/^[a-f0-9]{64}$/.test(token)) {
    console.error("Configure BACKEND_URL e API_SERVICE_TOKEN no frontend.");
    return proxyError("Serviço temporariamente indisponível.", 503);
  }

  try {
    const url = new URL(backend);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
        || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("BACKEND_URL precisa ser uma origem HTTP ou HTTPS.");
    }
    const headers = new Headers({ authorization: "Bearer " + token, "x-alpha-set-host": site.origin.host });
    for (const name of ["cookie", "origin", "content-type", "sec-fetch-site"]) {
      const value = incoming.get(name);
      if (value !== null) headers.set(name, value);
    }
    const target = new URL(endpoint, url);
    if (query) target.search = query.toString();
    const upstream = await fetch(target, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    const responseHeaders = new Headers({ "Cache-Control": "private, no-store" });
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("Content-Type", contentType);
    for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("Set-Cookie", cookie);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (cause) {
    console.error("Falha ao conectar à API:", cause instanceof Error ? cause.message : "Erro desconhecido.");
    return proxyError("Serviço temporariamente indisponível.", 503);
  }
}

export async function forwardPost(request: Request, endpoint: Endpoint) {
  const body = await readBody(request, endpoint === "/api/perfil" ? 50000 : 4096);
  if (body === null) return proxyError("Solicitação muito grande.", 413);
  return callBackend(request.headers, endpoint, body);
}
