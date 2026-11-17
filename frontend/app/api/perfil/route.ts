import { callBackend, forwardPost } from "@/server/backend";

export function GET(request: Request) {
  return callBackend(request.headers, "/api/perfil");
}

export function POST(request: Request) {
  return forwardPost(request, "/api/perfil");
}
