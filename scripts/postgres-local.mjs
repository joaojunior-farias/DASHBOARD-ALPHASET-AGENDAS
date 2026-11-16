import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL no .env.");
const url = new URL(process.env.DATABASE_URL);
const database = decodeURIComponent(url.pathname.slice(1));
if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname !== "127.0.0.1"
    || !url.port || !url.username || !url.password || !/^[a-z][a-z0-9_]*_dev$/.test(database)) {
  throw new Error("O PostgreSQL local precisa de um DATABASE_URL em 127.0.0.1 com porta e banco terminado em _dev.");
}

const databaseDir = fileURLToPath(new URL("../.postgres", import.meta.url));
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port: Number(url.port),
  persistent: true,
  authMethod: "scram-sha-256",
  autoRehydrateSymlinks: true,
  postgresFlags: ["-h", "127.0.0.1"],
});

if (!existsSync(join(databaseDir, "PG_VERSION"))) await postgres.initialise();
await postgres.start();

const client = postgres.getPgClient("postgres", "127.0.0.1");
try {
  await client.connect();
  const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (!existing.rowCount) await client.query("CREATE DATABASE " + client.escapeIdentifier(database));
} catch (error) {
  await client.end().catch(() => {});
  await postgres.stop();
  throw error;
}
await client.end();
console.log("PostgreSQL local pronto na porta " + url.port + ". Deixe este terminal aberto.");
