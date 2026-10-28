#!/usr/bin/env node
/**
 * The ONE approved way to apply the Advisory migrations to a real database (the production launch), with guards.
 *
 *   plan   (default, strictly READ ONLY)   DATABASE_URL=<direct connection string> node backend/scripts/ops/advisory-migrate.js plan
 *   apply                                  DATABASE_URL=... BACKUP_REFERENCE="<where the verified backup is>" \
 *                                          ADVISORY_MIGRATION_CONFIRM="APPLY-ADVISORY-MIGRATIONS-TO <host>" node backend/scripts/ops/advisory-migrate.js apply
 *
 * What it guarantees:
 *   - DATABASE_URL must be in the environment of the process; it is never read from backend/.env, never printed (only host and port are shown).
 *   - `plan` runs inside BEGIN READ ONLY and sends only SELECT / SHOW. It decides READY or BLOCKED:
 *       BLOCKED when any non-advisory migration is pending (unrelated schema change), when the advisory migrations are only partly applied, when
 *       btree_gist is not installed yet (pre-install it from the Supabase dashboard so the migration needs no extension privilege), or when the
 *       migrations table is missing.
 *   - `apply` re-runs the plan, requires the exact confirmation phrase for THIS host and a backup reference, runs the TypeORM CLI once with
 *       ADVISORY_MIGRATIONS=true (all pending migrations run in ONE transaction: either all four apply or none), then verifies read-only.
 *   - A database on this machine is refused unless --allow-local is given (rehearsals on a scratch database); a remote one cannot use --allow-local.
 *   - Running it again after success is a no-op: apply refuses when everything is already applied.
 *
 * Nothing here runs at deploy time. The Lightsail container runs with RUN_MIGRATIONS=false and Render is stopped, so this is the only path.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Client } = require("pg");

const BACKEND = path.join(__dirname, "..", "..");
const mode = (process.argv[2] || "plan").toLowerCase();
const allowLocal = process.argv.includes("--allow-local");
if (!["plan", "apply"].includes(mode)) { console.error("Usage: advisory-migrate.js plan|apply [--allow-local]"); process.exit(2); }

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set in this process (it is deliberately not read from any .env file)."); process.exit(2); }
let target;
try { target = new URL(url); } catch { console.error("DATABASE_URL is not a valid URL."); process.exit(2); }
const host = target.hostname;
const port = target.port || "5432";
const isLocal = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
if (isLocal && !allowLocal) { console.error(`Refusing: ${host}:${port} is this machine. Use --allow-local only for a rehearsal on a scratch database.`); process.exit(2); }
if (!isLocal && allowLocal) { console.error("Refusing: --allow-local cannot be used with a remote database."); process.exit(2); }

/** "<timestamp>-<Name>.ts" -> "<Name><timestamp>", the way TypeORM records the migration. */
const namesIn = (dir) => fs.readdirSync(path.join(BACKEND, "src", "database", dir)).filter((f) => /^\d+-.+\.ts$/.test(f)).map((f) => { const [, ts, name] = /^(\d+)-(.+)\.ts$/.exec(f); return { file: f, name: name + ts, ts: Number(ts), dir }; }).sort((a, b) => a.ts - b.ts);
const advisory = namesIn("migrations-advisory");
const regular = namesIn("migrations");
const tablesCreated = advisory.flatMap((m) => [...fs.readFileSync(path.join(BACKEND, "src", "database", m.dir, m.file), "utf8").matchAll(/CREATE TABLE "([a-z_]+)"/g)].map((x) => x[1]));

const line = (s = "") => console.log(s);
const ro = async (c, sql, params) => { if (!/^\s*(select|show)\b/i.test(sql)) throw new Error("refusing a non-read statement in plan mode"); return (await c.query(sql, params)).rows; };

async function inspect() {
  const c = new Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 20000, statement_timeout: 30000, application_name: "ruwad-advisory-migrate-plan" });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const [ver] = await ro(c, "SHOW server_version");
    const [who] = await ro(c, "SELECT current_user AS u, (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS su, current_database() AS db, (SELECT setting FROM pg_settings WHERE name = 'server_encoding') AS enc");
    const ext = await ro(c, "SELECT name, installed_version FROM pg_available_extensions WHERE name = 'btree_gist'");
    const hasTable = (await ro(c, "SELECT to_regclass('public.migrations') AS t"))[0].t !== null;
    const applied = hasTable ? (await ro(c, "SELECT name FROM migrations ORDER BY id")).map((r) => r.name) : [];
    const existing = new Set((await ro(c, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).map((r) => r.table_name));
    return { version: ver.server_version, user: who.u, superuser: who.su, db: who.db, encoding: who.enc, extAvailable: ext.length > 0, extInstalled: !!(ext[0] && ext[0].installed_version), hasTable, applied: new Set(applied), existing };
  } finally { await c.query("ROLLBACK").catch(() => {}); await c.end(); }
}

function decide(s) {
  const reasons = [];
  if (!s.hasTable) reasons.push("the migrations table does not exist: this is not the RUWAD database");
  const pendingRegular = regular.filter((m) => !s.applied.has(m.name));
  if (pendingRegular.length) reasons.push(`${pendingRegular.length} NON-advisory migration(s) are pending (${pendingRegular.map((m) => m.name).join(", ")}): an unrelated schema change would ride along; stop and look`);
  const done = advisory.filter((m) => s.applied.has(m.name));
  const pending = advisory.filter((m) => !s.applied.has(m.name));
  const partial = done.length > 0 && pending.length > 0;
  if (partial) reasons.push(`the Advisory migrations are only partly applied (${done.map((m) => m.name).join(", ")}): do not continue until someone has looked`);
  const stray = tablesCreated.filter((t) => s.existing.has(t));
  if (!done.length && stray.length) reasons.push(`Advisory tables already exist without the migration records (${stray.slice(0, 3).join(", ")}...)`);
  if (pending.length && !s.extInstalled) reasons.push(s.extAvailable ? "btree_gist is available but NOT installed: install it first (Supabase dashboard, Database, Extensions, btree_gist) so the migration needs no extension privilege" : "btree_gist is not available on this server");
  return { reasons, pending, done, allDone: pending.length === 0 };
}

(async () => {
  line(`target: ${host}:${port}${isLocal ? " (this machine, rehearsal)" : ""}   mode: ${mode}${port === "6543" ? "   NOTE: port 6543 is the pooler; use the DIRECT connection (5432) for migrations" : ""}`);
  let s;
  try { s = await inspect(); } catch (e) { console.error("Could not inspect the database: " + String(e.message).slice(0, 200)); process.exit(2); }
  line(`PostgreSQL ${s.version}, database ${s.db} (${s.encoding}), role ${s.user}${s.superuser ? " (superuser)" : " (not a superuser)"}`);
  line(`btree_gist: ${s.extInstalled ? "installed" : s.extAvailable ? "available, not installed" : "not available"}`);
  line(`advisory migrations expected (${advisory.length}): ${advisory.map((m) => m.name).join(", ")}`);
  const d = decide(s);
  line(`already applied: ${d.done.length}   pending: ${d.pending.length}`);
  if (d.allDone) { line("\nALREADY APPLIED: nothing to do."); if (mode === "apply") { console.error("apply refused: everything is already applied."); process.exit(3); } process.exit(0); }
  if (d.reasons.length) { line("\nBLOCKED:"); d.reasons.forEach((r) => line("  - " + r)); process.exit(1); }
  line(`\nREADY: would apply ${d.pending.length} migration(s) in ONE transaction, in this order:`); d.pending.forEach((m, i) => line(`  ${i + 1}. ${m.name}`));
  if (mode === "plan") { line("\nNothing was changed (plan is read-only)."); process.exit(0); }

  // ---- apply -----------------------------------------------------------------------------------------------------------------------------
  const phrase = `APPLY-ADVISORY-MIGRATIONS-TO ${host}`;
  if ((process.env.BACKUP_REFERENCE || "").trim().length < 8) { console.error("\napply refused: set BACKUP_REFERENCE to where the verified backup is (at least 8 characters)."); process.exit(2); }
  if (process.env.ADVISORY_MIGRATION_CONFIRM !== phrase) { console.error(`\napply refused: set ADVISORY_MIGRATION_CONFIRM to exactly: ${phrase}`); process.exit(2); }
  line(`\nbackup reference: ${process.env.BACKUP_REFERENCE.trim().slice(0, 120)}\napplying...`);
  const cli = require.resolve("typeorm/cli-ts-node-commonjs.js", { paths: [BACKEND] });
  const run = spawnSync(process.execPath, [cli, "migration:run", "-d", "src/database/data-source.ts"], {
    cwd: BACKEND, encoding: "utf8",
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, DATABASE_URL: url, DATABASE_SSL: isLocal ? "false" : "true", ADVISORY_MIGRATIONS: "true", NODE_ENV: "production" },
  });
  const out = (run.stdout || "") + (run.stderr || "");
  const executed = [...out.matchAll(/Migration (\S+) has been\s+executed successfully/g)].map((m) => m[1]);
  line(`CLI exit ${run.status}; executed: ${executed.join(", ") || "(none)"}`);
  if (run.status !== 0) { console.error("The migration run FAILED. All migrations run in one transaction, so nothing should have been applied; confirm with: plan\n" + out.replace(/postgres(ql)?:\/\/\S+/gi, "[database url]").slice(-600)); process.exit(1); }

  // ---- verify (read only) ----------------------------------------------------------------------------------------------------------------
  const after = await inspect();
  const missing = advisory.filter((m) => !after.applied.has(m.name)).map((m) => m.name);
  const noTable = [...new Set(tablesCreated)].filter((t) => !after.existing.has(t));
  const ok = !missing.length && !noTable.length && executed.length === advisory.length;
  line(`verification: migrations recorded ${advisory.length - missing.length}/${advisory.length}; Advisory tables present ${new Set(tablesCreated).size - noTable.length}/${new Set(tablesCreated).size}${missing.length ? "; MISSING " + missing.join(",") : ""}${noTable.length ? "; NO TABLE " + noTable.join(",") : ""}`);
  line(ok ? "\nDONE: the Advisory migrations are applied. Do not run apply again." : "\nVERIFICATION FAILED: stop, do not continue the launch.");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("failed: " + String(e.message).replace(/postgres(ql)?:\/\/\S+/gi, "[database url]").slice(0, 300)); process.exit(2); });
