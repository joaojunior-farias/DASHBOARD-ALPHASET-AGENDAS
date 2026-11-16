import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const database = globalThis as typeof globalThis & { alphaSetPool?: Pool };

export function getDb() {
  if (!database.alphaSetPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("Configure DATABASE_URL.");
    const pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
    pool.on("error", (error) => console.error("Erro na conexão PostgreSQL:", error.message));
    database.alphaSetPool = pool;
  }
  return drizzle(database.alphaSetPool, { schema });
}
