import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { uuidPattern } from "../agenda-model.js";
import { getDb } from "../db/index.js";
import { dashboardUsers } from "../db/schema.js";

export const adminCookie = "alpha_set_admin";
export const adminSessionSeconds = 60 * 60 * 8;

export type AdminSession = { role: "master"; subject: "master" } | { role: "operator"; subject: string; version: number };

export function masterUsername() {
  return process.env.ADMIN_USERNAME?.trim() || "AlphaSetStudio";
}

export function usernameKey(input: unknown) {
  if (typeof input !== "string" || input.length > 80) return null;
  const normalized = input.normalize("NFKC").trim();
  if (normalized.length < 2 || normalized.length > 80 || /[\u0000-\u001f\u007f]/u.test(normalized)) return null;
  return normalized.toLowerCase();
}

function masterPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12 || password.length > 256) {
    throw new Error("Configure ADMIN_PASSWORD com 12 a 256 caracteres.");
  }
  return password;
}

export function verifyMasterPassword(password: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(password), digest(masterPassword()));
}

function signature(payload: string, role: AdminSession["role"]) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Configure SESSION_SECRET com pelo menos 32 caracteres.");
  const hash = createHmac("sha256", secret);
  if (role === "master") {
    hash.update(masterUsername()).update("\0").update(masterPassword()).update("\0");
  }
  return hash.update(payload).digest();
}

export function newAdminSession(session: AdminSession) {
  const expires = Math.floor(Date.now() / 1000) + adminSessionSeconds;
  const identity = session.role === "master" ? ["2", session.role, session.subject] : ["3", session.role, session.subject, session.version];
  const payload = [...identity, expires, randomBytes(16).toString("hex")].join(".");
  return payload + "." + signature(payload, session.role).toString("hex");
}

function readAdminSession(token: string | undefined): AdminSession | null {
  const parts = token?.split(".") ?? [];
  const [format, role, subject] = parts;
  if (!((format === "2" && parts.length === 6) || (format === "3" && parts.length === 7))) return null;
  const [expires, nonce, mac] = parts.slice(-3);
  if (!/^\d{1,12}$/.test(expires) || !/^[a-f0-9]{32}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(mac)) return null;
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return null;
  const version = format === "2" ? 1 : Number(parts[3]);
  const session: AdminSession | null = format === "2" && role === "master" && subject === "master"
    ? { role, subject }
    : role === "operator" && uuidPattern.test(subject) && Number.isInteger(version) && version > 0 ? { role, subject, version } : null;
  if (!session) return null;
  const payload = parts.slice(0, -1).join(".");
  return timingSafeEqual(Buffer.from(mac, "hex"), signature(payload, session.role)) ? session : null;
}

export async function activeAdminSession(token: string | undefined) {
  const session = readAdminSession(token);
  if (session?.role !== "operator") return session;
  const [account] = await getDb().select({ id: dashboardUsers.id }).from(dashboardUsers).where(and(
    eq(dashboardUsers.id, session.subject), eq(dashboardUsers.passwordVersion, session.version), eq(dashboardUsers.mustChangePassword, false),
  ));
  return account ? session : null;
}

export async function validAdminSession(token: string | undefined) {
  return (await activeAdminSession(token)) !== null;
}
