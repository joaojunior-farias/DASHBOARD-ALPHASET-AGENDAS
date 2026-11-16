import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

let pool: Pool | undefined;

export function getDb() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Configure DATABASE_URL.");
    pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
    pool.on("error", (error) => console.error("Erro na conexão PostgreSQL:", error.message));
  }
  return drizzle(pool, { schema });
}

export async function closeDb() {
  await pool?.end();
}
