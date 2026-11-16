import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Configure DATABASE_URL.");

const dir = new URL("../db/migrations/", import.meta.url);
const files = (await readdir(dir)).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(2187620)");
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)");
  const applied = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map(({ name }) => name));
  for (const file of files) {
    if (applied.has(file)) continue;
    await client.query(await readFile(new URL(file, dir), "utf8"));
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
    console.log("Migração aplicada " + file);
  }
  await client.query("COMMIT");
  console.log("Banco atualizado.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await client.end();
}
