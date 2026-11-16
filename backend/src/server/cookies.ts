import type { cookieOptions } from "./config.js";

export function readCookie(request: Request, name: string) {
  const prefix = name + "=";
  const entry = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return entry?.slice(prefix.length);
}

export function writeCookie(response: Response, name: string, value: string, options: ReturnType<typeof cookieOptions>) {
  // Session values are composed of hexadecimal characters, periods, and an expiry timestamp.
  const cookie = [
    name + "=" + value,
    "Path=" + options.path,
    "Max-Age=" + options.maxAge,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (options.secure) cookie.push("Secure");
  response.headers.append("Set-Cookie", cookie.join("; "));
}
