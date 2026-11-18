import { callBackend, forwardPost } from "@/server/backend";

export function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const search = query.has("busca") ? new URLSearchParams({ busca: query.get("busca") ?? "" }) : undefined;
  return callBackend(request.headers, "/api/clientes", undefined, search);
}

export function POST(request: Request) {
  return forwardPost(request, "/api/clientes");
}
