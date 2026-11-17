import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { dashboardUsers } from "../db/schema.js";
import { matchesPassword, passwordCredentials } from "./passwords.js";

export async function createDashboardUser(usernameKey: string, password: string) {
  const [created] = await getDb().insert(dashboardUsers).values({
    id: randomUUID(),
    usernameKey,
    ...await passwordCredentials(password),
  }).onConflictDoNothing({ target: dashboardUsers.usernameKey }).returning({ id: dashboardUsers.id });
  return created?.id ?? null;
}

export async function authenticateDashboardUser(usernameKey: string, password: string) {
  const [account] = await getDb().select({
    id: dashboardUsers.id,
    passwordSalt: dashboardUsers.passwordSalt,
    passwordHash: dashboardUsers.passwordHash,
    passwordVersion: dashboardUsers.passwordVersion,
    mustChangePassword: dashboardUsers.mustChangePassword,
  }).from(dashboardUsers).where(eq(dashboardUsers.usernameKey, usernameKey)).limit(1);
  return account && await matchesPassword(password, account) ? account : null;
}
