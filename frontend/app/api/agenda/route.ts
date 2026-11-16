import { callBackend, forwardPost } from "@/server/backend";

export function GET(request: Request) {
  return callBackend(request.headers, "/api/agenda");
}

export function POST(request: Request) {
  return forwardPost(request, "/api/agenda");
}
