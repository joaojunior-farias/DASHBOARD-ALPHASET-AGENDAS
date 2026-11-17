import { timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";
import * as agenda from "./agenda.js";
import * as photographers from "./photographers.js";
import * as session from "./session.js";
import * as users from "./users.js";
import { closeDb } from "./db/index.js";

const token = process.env.API_SERVICE_TOKEN;
if (!token || !/^[a-f0-9]{64}$/.test(token)) {
  throw new Error("Configure API_SERVICE_TOKEN com 64 caracteres hexadecimais.");
}
const authorization = Buffer.from("Bearer " + token);
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Configure PORT com um número de porta válido.");
}

function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}

function authorized(request: Request) {
  const attempt = Buffer.from(request.headers.get("authorization") ?? "");
  return attempt.length === authorization.length && timingSafeEqual(attempt, authorization);
}

type Handler = (request: Request) => Response | Promise<Response>;
const routes = new Map<string, { GET?: Handler; POST?: Handler }>([
  ["/api/agenda", agenda],
  ["/api/fotografos", photographers],
  ["/api/sessao", session],
  ["/api/usuarios", users],
]);

const server = serve({
  hostname: process.env.HOST || "::",
  port,
  async fetch(request) {
    if (!authorized(request)) return error("Acesso restrito.", 401);

    const path = new URL(request.url).pathname;
    const handlers = routes.get(path);
    if (!handlers) return error("Página indisponível.", 404);
    const method = request.method;
    const handle = method === "GET" || method === "POST" ? handlers[method] : undefined;
    if (!handle) return error("Método indisponível.", 405);
    try {
      return await handle(request);
    } catch (cause) {
      console.error("Falha no processamento da API:", cause instanceof Error ? cause.message : "Erro desconhecido.");
      return error("Não foi possível processar a solicitação.", 500);
    }
  },
}, ({ port }) => {
  console.log("Backend da agenda ouvindo na porta " + port + ".");
});

function shutdown() {
  server.close(() => {
    void closeDb().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
