// Docker-free dev database: an embedded Postgres (PGlite) served over the Postgres wire protocol.
// Usage: node scripts/dev-db.mjs [dataDir]   → postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1&pgbouncer=true
// Data lives in ./.pglite (persisted) unless "memory" is passed. PGlite is single-connection, hence connection_limit=1.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const dir = process.argv[2] ?? ".pglite";
const db = new PGlite(dir === "memory" ? undefined : dir);
await db.waitReady;

const applied = await db
  .query(`select to_regclass('"_dev_migrations"') as t`)
  .then((r) => r.rows[0]?.t != null)
  .catch(() => false);
if (!applied) await db.exec(`create table "_dev_migrations" (name text primary key)`);
const done = new Set((await db.query(`select name from "_dev_migrations"`)).rows.map((r) => r.name));
const root = path.resolve("prisma/migrations");
for (const name of readdirSync(root).filter((n) => /^\d{4}_/.test(n)).sort()) {
  if (done.has(name)) continue;
  await db.exec(readFileSync(path.join(root, name, "migration.sql"), "utf8"));
  await db.query(`insert into "_dev_migrations" values ($1)`, [name]);
  console.log("applied", name);
}

const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1" });
await server.start();
console.log("PGlite listening on postgresql://postgres:postgres@127.0.0.1:5433/postgres?connection_limit=1&pgbouncer=true");
process.on("SIGINT", async () => { await server.stop(); await db.close(); process.exit(0); });
