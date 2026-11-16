import { forwardPost } from "@/server/backend";

export function POST(request: Request) {
  return forwardPost(request, "/api/sessao");
}
