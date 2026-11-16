import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const adminCookie = "alpha_set_admin";
export const adminSessionSeconds = 60 * 60 * 8;

function adminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 16) throw new Error("Configure ADMIN_PASSWORD com pelo menos 16 caracteres.");
  return password;
}

export function verifyAdminPassword(input: unknown) {
  if (typeof input !== "string" || input.length > 256) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(input), digest(adminPassword()));
}

function signature(payload: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Configure SESSION_SECRET com pelo menos 32 caracteres.");
  return createHmac("sha256", secret)
    .update(adminPassword())
    .update("\0")
    .update(payload)
    .digest();
}

export function newAdminSession() {
  const expires = Math.floor(Date.now() / 1000) + adminSessionSeconds;
  const payload = expires + "." + randomBytes(16).toString("hex");
  return payload + "." + signature(payload).toString("hex");
}

export function validAdminSession(token: string | undefined) {
  if (!token || !/^\d{1,12}\.[0-9a-f]{32}\.[0-9a-f]{64}$/.test(token)) return false;
  const [expires, nonce, mac] = token.split(".");
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqual(Buffer.from(mac, "hex"), signature(expires + "." + nonce));
}
