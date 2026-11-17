import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { photographers, photographerSessions } from "../db/schema.js";
import { readCookie, writeCookie } from "./cookies.js";
import { cookieOptions } from "./config.js";

const sessionCookie = "alpha_set_fotografo";
const sessionSeconds = 30 * 24 * 60 * 60;
const sessionTokenPattern = /^[a-f0-9]{64}$/;

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newPhotographerSession(photographerId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000);
  return { token, data: { tokenHash: tokenHash(token), photographerId, expiresAt } };
}

export function setPhotographerSession(response: Response, origin: URL, token: string) {
  writeCookie(response, sessionCookie, token, cookieOptions(origin, token ? sessionSeconds : 0));
}

export function readPhotographerSessionHash(request: Request) {
  const token = readCookie(request, sessionCookie);
  return token && sessionTokenPattern.test(token) ? tokenHash(token) : null;
}

export async function signedInPhotographer(request: Request) {
  const hash = readPhotographerSessionHash(request);
  if (!hash) return null;
  const [account] = await getDb().select({ id: photographers.id, name: photographers.name })
    .from(photographerSessions)
    .innerJoin(photographers, eq(photographers.id, photographerSessions.photographerId))
    .where(and(eq(photographerSessions.tokenHash, hash), gt(photographerSessions.expiresAt, new Date()), eq(photographers.mustChangePassword, false)));
  return account ?? null;
}
