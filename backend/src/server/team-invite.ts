import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { settings } from "../db/schema.js";
import { cookieOptions } from "./config.js";
import { readCookie, writeCookie } from "./cookies.js";

const inviteKey = "team-invite";
const inviteCookie = "alpha_set_equipe";
const invitePattern = /^[a-f0-9]{64}$/;
const legacyCookiePattern = /^([a-f0-9]{64})\.([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/;

async function findInvite() {
  const [row] = await getDb().select({ value: settings.value }).from(settings)
    .where(eq(settings.key, inviteKey));
  return row?.value;
}

export async function ensureInvite() {
  const original = await findInvite();
  if (original) return original;
  const value = randomBytes(32).toString("hex");
  const [created] = await getDb().insert(settings).values({ key: inviteKey, value })
    .onConflictDoNothing().returning({ value: settings.value });
  const invite = created?.value ?? await findInvite();
  if (!invite) throw new Error("Falha ao carregar o convite da equipe.");
  return invite;
}

async function validInvite(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !invitePattern.test(token)) return false;
  const invite = await findInvite();
  return Boolean(invite && invitePattern.test(invite)
    && timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(invite, "hex")));
}

export async function invitedParticipant(request: Request) {
  const session = (readCookie(request, inviteCookie) ?? "").match(legacyCookiePattern);
  return session && await validInvite(session[1]) ? session[2] : null;
}

export async function acceptTeamInvite(request: Request, response: Response, origin: URL, token: unknown) {
  if (typeof token !== "string" || !await validInvite(token)) return false;
  const previous = (readCookie(request, inviteCookie) ?? "").match(legacyCookiePattern);
  const id = previous?.[1] === token ? previous[2] : randomUUID();
  writeCookie(response, inviteCookie, token + "." + id, cookieOptions(origin, 7 * 24 * 60 * 60));
  return true;
}

export function clearTeamInvite(response: Response, origin: URL) {
  writeCookie(response, inviteCookie, "", cookieOptions(origin, 0));
}
