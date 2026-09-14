/**
 * Local development Postgres — runs a genuine PostgreSQL server (real
 * postgres/pg_ctl binaries via the `embedded-postgres` package) on disk at
 * ./.pgdata, listening on 127.0.0.1:55432. This exists only because this
 * machine has no system PostgreSQL install and no Docker/WSL available —
 * production (Render) uses a normal managed Postgres instance via
 * DATABASE_URL, and the app talks to both through the exact same `pg`
 * driver / TypeORM Postgres connector. Data persists across restarts
 * (that's the whole point — see the persistence tests in the completion
 * report), it is not an in-memory or mocked database.
 *
 * Usage: node scripts/local-postgres.js
 * Leave it running in the background while developing; Ctrl+C (or process
 * kill) stops the server cleanly.
 */
const path = require("path");
const EmbeddedPostgres = require("embedded-postgres").default;

const pg = new EmbeddedPostgres({
  databaseDir: path.join(__dirname, "..", ".pgdata"),
  user: "postgres",
  password: "postgres",
  port: 55432,
  persistent: true,
});

async function main() {
  const fs = require("fs");
  const initialized = fs.existsSync(path.join(__dirname, "..", ".pgdata", "PG_VERSION"));
  if (!initialized) {
    console.log("[pg] initialising data directory (first run)...");
    await pg.initialise();
  }
  await pg.start();
  console.log("[pg] PostgreSQL listening on 127.0.0.1:55432");

  // Ensure the `ruwad` database exists (embedded-postgres only creates the
  // default `postgres` database on init).
  const { Client } = require("pg");
  const client = new Client({ host: "127.0.0.1", port: 55432, user: "postgres", password: "postgres", database: "postgres" });
  await client.connect();
  const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'ruwad'");
  if (res.rowCount === 0) {
    // Explicit UTF8 + C collation: initdb on Windows otherwise defaults the
    // whole cluster (and template1) to the OS codepage (WIN1252), which
    // then rejects non-Latin1 characters like RUWĀD's own name on insert.
    await client.query("CREATE DATABASE ruwad ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0");
    console.log("[pg] created database 'ruwad' (UTF8)");
  }
  await client.end();
  console.log("[pg] ready — DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/ruwad");

  const shutdown = async () => {
    console.log("\n[pg] stopping...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[pg] failed to start:", e);
  process.exit(1);
});
