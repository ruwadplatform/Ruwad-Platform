#!/usr/bin/env node
/**
 * READ-ONLY before/after evidence for the Advisory release, used while no separate database backup exists. It is NOT a backup and cannot restore anything.
 *
 *   DATABASE_URL=<connection string> node backend/scripts/ops/prod-snapshot.js take <file.json>      (before the migrations)
 *   DATABASE_URL=<connection string> node backend/scripts/ops/prod-snapshot.js compare <file.json>   (after the migrations)
 *
 * `take` records, per public table: its row count and a SHA-256 fingerprint of its schema (columns, indexes, constraints), plus the migration list and
 * the extensions. No row data is read. `compare` takes a fresh snapshot and reports:
 *   - tables that disappeared (must be none);
 *   - tables that were added (must be only advisory_* tables);
 *   - any PRE-EXISTING table whose schema fingerprint changed (must be none: the Advisory migrations only add);
 *   - row-count differences (informational: the live site keeps writing, so small changes are normal).
 * Verdict EXISTING SCHEMA UNCHANGED means every pre-existing table has the identical schema and none is missing.
 *
 * Safety: the connection string is read from the environment only and never printed; all statements run in BEGIN READ ONLY and must start with
 * SELECT or SHOW; a database on this machine needs --allow-local (rehearsals).
 */
const fs = require("node:fs");
const crypto = require("node:crypto");
const { Client } = require("pg");

const [mode, file] = process.argv.slice(2);
const allowLocal = process.argv.includes("--allow-local");
if (!["take", "compare"].includes(mode) || !file) { console.error("Usage: prod-snapshot.js take|compare <file.json> [--allow-local]"); process.exit(2); }
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set in this process."); process.exit(2); }
let host; try { host = new URL(url).hostname; } catch { console.error("DATABASE_URL is not a valid URL."); process.exit(2); }
const isLocal = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
if (isLocal !== allowLocal) { console.error(isLocal ? "Refusing: that is this machine; use --allow-local for rehearsals." : "Refusing: --allow-local is only for a database on this machine."); process.exit(2); }

const ro = async (c, sql, params) => { if (!/^\s*(select|show)\b/i.test(sql)) throw new Error("refusing a non-read statement"); return (await c.query(sql, params)).rows; };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function snapshot() {
  const c = new Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 20000, statement_timeout: 60000, application_name: "ruwad-prod-snapshot" });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const tables = (await ro(c, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1")).map((r) => r.table_name);
    const out = {};
    for (const t of tables) {
      const cols = await ro(c, "SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length, numeric_precision FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position", [t]);
      const idx = await ro(c, "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname", [t]);
      const con = await ro(c, "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = ('public.' || quote_ident($1))::regclass ORDER BY conname", [t]);
      const n = (await ro(c, `SELECT count(*)::int AS n FROM public."${t.replace(/"/g, "")}"`))[0].n;
      out[t] = { rows: n, schema: sha(JSON.stringify({ cols, idx, con })) };
    }
    const migrations = (await ro(c, "SELECT name FROM migrations ORDER BY id")).map((r) => r.name);
    const extensions = (await ro(c, "SELECT extname || ' ' || extversion AS x FROM pg_extension ORDER BY 1")).map((r) => r.x);
    return { takenAt: new Date().toISOString(), tables: out, migrations, extensions };
  } finally { await c.query("ROLLBACK").catch(() => {}); await c.end(); }
}

(async () => {
  const now = await snapshot();
  const rows = Object.values(now.tables).reduce((a, t) => a + t.rows, 0);
  if (mode === "take") {
    if (fs.existsSync(file)) { console.error("Refusing to overwrite an existing snapshot file."); process.exit(2); }
    fs.writeFileSync(file, JSON.stringify({ note: "Counts and schema fingerprints only (no row data). Not a backup.", ...now }, null, 2), { flag: "wx" });
    console.log(`snapshot written: ${Object.keys(now.tables).length} tables, ${rows} rows in total, ${now.migrations.length} migrations recorded (latest ${now.migrations[now.migrations.length - 1]}), extensions: ${now.extensions.join(", ")}`);
    return;
  }
  const before = JSON.parse(fs.readFileSync(file, "utf8"));
  const gone = Object.keys(before.tables).filter((t) => !(t in now.tables));
  const added = Object.keys(now.tables).filter((t) => !(t in before.tables));
  const unexpected = added.filter((t) => !t.startsWith("advisory_"));
  const changed = Object.keys(before.tables).filter((t) => t in now.tables && before.tables[t].schema !== now.tables[t].schema);
  const deltas = Object.keys(before.tables).filter((t) => t in now.tables && before.tables[t].rows !== now.tables[t].rows).map((t) => `${t}: ${before.tables[t].rows} -> ${now.tables[t].rows}`);
  console.log(`before: ${before.takenAt}   after: ${now.takenAt}`);
  console.log(`tables before ${Object.keys(before.tables).length}, after ${Object.keys(now.tables).length}; added: ${added.length} (${added.join(", ") || "none"})`);
  console.log(`migrations added: ${now.migrations.filter((m) => !before.migrations.includes(m)).join(", ") || "none"}`);
  console.log(`row-count differences in existing tables (informational): ${deltas.length ? deltas.join("; ") : "none"}`);
  const ok = !gone.length && !changed.length && !unexpected.length;
  if (gone.length) console.log("MISSING TABLES: " + gone.join(", "));
  if (changed.length) console.log("SCHEMA CHANGED IN EXISTING TABLES: " + changed.join(", "));
  if (unexpected.length) console.log("UNEXPECTED NEW TABLES (not advisory_*): " + unexpected.join(", "));
  console.log(ok ? "\nEXISTING SCHEMA UNCHANGED: every pre-existing table has the identical schema; only advisory_* tables were added." : "\nPROBLEM: see above. Stop and investigate before continuing the release.");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("failed: " + String(e.message).replace(/postgres(ql)?:\/\/\S+/gi, "[database url]").slice(0, 300)); process.exit(2); });
