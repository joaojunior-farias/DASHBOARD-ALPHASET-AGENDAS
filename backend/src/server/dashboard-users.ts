import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { dashboardUsers } from "../db/schema.js";

function hashPassword(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, Buffer.from(salt, "hex"), 32, { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, hash) => {
      if (error) reject(error);
      else resolve(hash);
    });
  });
}

export async function createDashboardUser(usernameKey: string, password: string) {
  const passwordSalt = randomBytes(16).toString("hex");
  const passwordHash = (await hashPassword(password, passwordSalt)).toString("hex");
  const [created] = await getDb().insert(dashboardUsers).values({
    id: randomUUID(),
    usernameKey,
    passwordSalt,
    passwordHash,
  }).onConflictDoNothing({ target: dashboardUsers.usernameKey }).returning({ id: dashboardUsers.id });
  return created?.id ?? null;
}

export async function authenticateDashboardUser(usernameKey: string, password: string) {
  const [account] = await getDb().select({
    id: dashboardUsers.id,
    passwordSalt: dashboardUsers.passwordSalt,
    passwordHash: dashboardUsers.passwordHash,
  }).from(dashboardUsers).where(eq(dashboardUsers.usernameKey, usernameKey)).limit(1);
  if (!account) return null;
  const hash = await hashPassword(password, account.passwordSalt);
  return timingSafeEqual(hash, Buffer.from(account.passwordHash, "hex")) ? account.id : null;
}
