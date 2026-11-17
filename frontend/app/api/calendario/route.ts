import { callBackend, forwardPost } from "@/server/backend";

export function GET(request: Request) {
  const mes = new URL(request.url).searchParams.get("mes") ?? "";
  return callBackend(request.headers, "/api/calendario", undefined, new URLSearchParams({ mes }));
}

export function POST(request: Request) {
  return forwardPost(request, "/api/calendario");
}
