import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const adminCookie = "alpha_set_admin";
export const adminSessionSeconds = 60 * 60 * 8;

export type AdminSession = { role: "master"; subject: "master" } | { role: "operator"; subject: string };

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
  const payload = ["2", session.role, session.subject, expires, randomBytes(16).toString("hex")].join(".");
  return payload + "." + signature(payload, session.role).toString("hex");
}

export function readAdminSession(token: string | undefined): AdminSession | null {
  const match = token?.match(/^2\.(master|operator)\.(master|[a-f0-9-]{36})\.(\d{1,12})\.([a-f0-9]{32})\.([a-f0-9]{64})$/);
  if (!match) return null;
  const [, role, subject, expires, nonce, mac] = match;
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return null;
  const session: AdminSession | null = role === "master" && subject === "master"
    ? { role, subject }
    : role === "operator" && subject !== "master" ? { role, subject } : null;
  if (!session) return null;
  const payload = ["2", role, subject, expires, nonce].join(".");
  return timingSafeEqual(Buffer.from(mac, "hex"), signature(payload, session.role)) ? session : null;
}

export function validAdminSession(token: string | undefined) {
  return readAdminSession(token) !== null;
}
