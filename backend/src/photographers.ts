import { randomUUID } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "./db/index.js";
import { photographers, photographerSessions } from "./db/schema.js";
import { acceptsJson, requestSite } from "./server/config.js";
import { matchesPassword, passwordCredentials, validPassword } from "./server/passwords.js";
import { newPhotographerSession, readPhotographerSessionHash, setPhotographerSession } from "./server/photographer-session.js";
import { acceptTeamInvite, clearTeamInvite, invitedParticipant } from "./server/team-invite.js";

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const site = requestSite(request.headers);
  if (site?.kind !== "agenda") return json({ error: "Página indisponível." }, 404);
  if (!acceptsJson(request.headers, site.origin)) return json({ error: "Solicitação inválida." }, 403);

  const value: unknown = await request.json().catch(() => null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return json({ error: "Dados inválidos." }, 400);
  const input = value as Record<string, unknown>;
  const result = json({ ok: true });
  if (input.action === "convite") {
    return await acceptTeamInvite(request, result, site.origin, input.token)
      ? result : json({ error: "Este convite é inválido. Peça o link da agenda à Alpha Set." }, 403);
  }

  const db = getDb();
  const previous = readPhotographerSessionHash(request);
  if (input.action === "sair") {
    if (previous) await db.delete(photographerSessions).where(eq(photographerSessions.tokenHash, previous));
    setPhotographerSession(result, site.origin, "");
    return result;
  }
  if (input.action !== "cadastro" && input.action !== "entrar" && input.action !== "trocar-senha") return json({ error: "Solicitação inválida." }, 400);

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const { password } = input;
  if (email.length > 254 || /[\u0000-\u001f\u007f]/u.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
      || !validPassword(password)) {
    return json({ error: "Informe um e-mail válido e uma senha de 12 a 256 caracteres." }, 400);
  }

  if (input.action === "cadastro") {
    const id = await invitedParticipant(request) ?? randomUUID();
    const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/gu, " ") : "";
    if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
      return json({ error: "Informe um nome de 2 a 80 caracteres." }, 400);
    }
    const credentials = await passwordCredentials(password);
    const session = newPhotographerSession(id);
    const created = await db.transaction(async (tx) => {
      // Keep the invite's participant ID so replies made in this browser follow the new account.
      const [account] = await tx.insert(photographers).values({ id, name, email, ...credentials })
        .onConflictDoNothing().returning({ id: photographers.id });
      if (!account) return false;
      await tx.insert(photographerSessions).values(session.data);
      return true;
    });
    if (!created) return json({ error: "Já existe uma conta para este e-mail ou navegador. Use Entrar." }, 409);
    setPhotographerSession(result, site.origin, session.token);
  } else {
    const [account] = await db.select({ id: photographers.id, passwordHash: photographers.passwordHash,
      passwordSalt: photographers.passwordSalt, mustChangePassword: photographers.mustChangePassword })
      .from(photographers).where(eq(photographers.email, email));
    const invalid = () => json({ error: "E-mail ou senha incorretos." }, 401);
    if (!account || !await matchesPassword(password, account)) return invalid();
    if (account.mustChangePassword && input.action !== "trocar-senha") {
      const required = json({ changeRequired: true }, 428);
      setPhotographerSession(required, site.origin, "");
      return required;
    }
    let replacement: Awaited<ReturnType<typeof passwordCredentials>> | null = null;
    if (input.action === "trocar-senha") {
      if (!account.mustChangePassword) return invalid();
      if (!validPassword(input.newPassword) || input.newPassword === password) {
        return json({ error: "Escolha uma senha nova, diferente da temporária, com 12 a 256 caracteres." }, 400);
      }
      replacement = await passwordCredentials(input.newPassword);
    }
    const session = newPhotographerSession(account.id);
    const valid = await db.transaction(async (tx) => {
      const [current] = await tx.select({ id: photographers.id }).from(photographers).where(and(
        eq(photographers.id, account.id), eq(photographers.passwordHash, account.passwordHash),
      )).for("update");
      if (!current) return false;
      if (replacement) await tx.update(photographers).set({ ...replacement, mustChangePassword: false }).where(eq(photographers.id, account.id));
      await tx.delete(photographerSessions).where(and(
        eq(photographerSessions.photographerId, account.id), lte(photographerSessions.expiresAt, new Date()),
      ));
      if (previous) await tx.delete(photographerSessions).where(eq(photographerSessions.tokenHash, previous));
      await tx.insert(photographerSessions).values(session.data);
      return true;
    });
    if (!valid) return invalid();
    setPhotographerSession(result, site.origin, session.token);
  }
  clearTeamInvite(result, site.origin);
  return result;
}
