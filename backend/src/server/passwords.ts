import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && value.length <= 256 && Boolean(value.trim());
}

function hashPassword(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, "hex"), 32, { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, hash) => {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

export async function passwordCredentials(password: string) {
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = (await hashPassword(password, passwordSalt)).toString("hex");
  return { passwordSalt, passwordHash };
}

export async function matchesPassword(password: string, credentials: { passwordSalt: string; passwordHash: string }) {
  const hash = await hashPassword(password, credentials.passwordSalt);
  return timingSafeEqual(hash, Buffer.from(credentials.passwordHash, "hex"));
}
