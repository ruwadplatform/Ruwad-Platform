#!/usr/bin/env node
/**
 * The ONE approved way to apply the email-verification migration to a real database, with guards.
 *
 *   plan   (default, strictly READ ONLY)   DATABASE_URL=<direct connection string> node backend/scripts/ops/email-verification-migrate.js plan
 *   apply                                  DATABASE_URL=... EMAIL_VERIFICATION_MIGRATION_CONFIRM="APPLY-EMAIL-VERIFICATION-MIGRATION-TO <host>" \
 *                                          (BACKUP_REFERENCE="<where the verified backup is>" | NO_BACKUP_ACKNOWLEDGED=OWNER-ACCEPTED-RISK) \
 *                                          node backend/scripts/ops/email-verification-migrate.js apply
 *
 * What it guarantees:
 *   - DATABASE_URL must be in this process's environment; it is never read from backend/.env, never printed (only host and port are shown).
 *   - `plan` runs inside BEGIN READ ONLY and sends only SELECT / SHOW. It reports how many accounts exist (by role and status), which administrators exist (masked), that
 *     every one of them will be marked verified (LEGACY) so nobody is locked out, and decides READY, BLOCKED or ALREADY APPLIED. BLOCKED when any OTHER migration is pending,
 *     when part of this feature already exists, or when the migrations table is missing.
 *   - `apply` re-runs the plan, requires the exact confirmation phrase for THIS host and a backup reference or the owner's explicit no-backup acknowledgement, runs the TypeORM CLI
 *     once (the migration is one transaction: it applies completely or not at all), then verifies read-only: recorded, tables present, ZERO unverified accounts, ZERO unverified
 *     administrators, same number of accounts as before.
 *   - A database on this machine is refused unless --allow-local (rehearsal on a scratch database); a remote one cannot use --allow-local.
 *   - Running it again after success is a no-op: apply refuses when the migration is already applied.
 *
 * Nothing here runs at deploy time: the Lightsail container runs with RUN_MIGRATIONS=false, so this is the only path.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Client } = require("pg");
const { MIGRATION, NEW_TABLES, NEW_COLUMNS, ADMIN_ROLES, decide, verifyAfter, phraseFor, backupProblem } = require("./email-verification-migrate-lib");

const BACKEND = path.join(__dirname, "..", "..");
const mode = (process.argv[2] || "plan").toLowerCase();
const allowLocal = process.argv.includes("--allow-local");
if (!["plan", "apply"].includes(mode)) { console.error("Usage: email-verification-migrate.js plan|apply [--allow-local]"); process.exit(2); }

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set in this process (it is deliberately not read from any .env file)."); process.exit(2); }
let target; try { target = new URL(url); } catch { console.error("DATABASE_URL is not a valid URL."); process.exit(2); }
const host = target.hostname;
const port = target.port || "5432";
const isLocal = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
if (isLocal && !allowLocal) { console.error(`Refusing: ${host}:${port} is this machine. Use --allow-local only for a rehearsal on a scratch database.`); process.exit(2); }
if (!isLocal && allowLocal) { console.error("Refusing: --allow-local cannot be used with a remote database."); process.exit(2); }

const regularFiles = fs.readdirSync(path.join(BACKEND, "src", "database", "migrations")).filter((f) => /^\d+-.+\.ts$/.test(f)).map((f) => { const [, ts, name] = /^(\d+)-(.+)\.ts$/.exec(f); return `${name}${ts}`; });
const line = (s = "") => console.log(s);
const maskEmail = (e) => { const at = String(e).lastIndexOf("@"); return at < 1 ? "***" : `${e[0]}***${e.slice(at)}`; };
const ro = async (c, sql, params) => { if (!/^\s*(select|show)\b/i.test(sql)) throw new Error("refusing a non-read statement in plan mode"); return (await c.query(sql, params)).rows; };

async function inspect() {
  const c = new Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 20000, statement_timeout: 30000, application_name: "ruwad-email-verification-migrate" });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const [ver] = await ro(c, "SHOW server_version");
    const hasMigrationsTable = (await ro(c, "SELECT to_regclass('public.migrations') AS t"))[0].t !== null;
    const applied = new Set(hasMigrationsTable ? (await ro(c, "SELECT name FROM migrations")).map((r) => r.name) : []);
    const tables = new Set((await ro(c, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).map((r) => r.table_name));
    const columns = new Set((await ro(c, "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'")).map((r) => r.column_name));
    const byRoleStatus = columns.size ? (await ro(c, `SELECT "role"::text AS role, "status"::text AS status, count(*)::int AS n FROM users GROUP BY 1, 2 ORDER BY 3 DESC`)) : [];
    const admins = columns.size ? (await ro(c, `SELECT "email", "role"::text AS role FROM users WHERE "role"::text = ANY($1) AND "status"::text = 'ACTIVE' ORDER BY "createdAt"`, [ADMIN_ROLES])) : [];
    const verified = columns.has("emailVerifiedAt") ? (await ro(c, `SELECT count(*) FILTER (WHERE "emailVerifiedAt" IS NULL)::int AS unverified, count(*) FILTER (WHERE "emailVerifiedAt" IS NULL AND "role"::text = ANY($1))::int AS "adminsUnverified" FROM users`, [ADMIN_ROLES]))[0] : { unverified: null, adminsUnverified: null };
    return { version: ver.server_version, hasMigrationsTable, applied, tables, columns, byRoleStatus, admins, ...verified, usersTotal: byRoleStatus.reduce((a, r) => a + r.n, 0) };
  } finally { await c.query("ROLLBACK").catch(() => {}); await c.end(); }
}

(async () => {
  line(`target: ${host}:${port}${isLocal ? " (this machine, rehearsal)" : ""}   mode: ${mode}${port === "6543" ? "   NOTE: port 6543 is the pooler; use the DIRECT connection (5432) for migrations" : ""}`);
  let s; try { s = await inspect(); } catch (e) { console.error("Could not inspect the database: " + String(e.message).replace(/postgres(ql)?:\/\/\S+/gi, "[database url]").slice(0, 200)); process.exit(2); }
  line(`PostgreSQL ${s.version}; migration to apply: ${MIGRATION}`);
  line(`accounts: ${s.usersTotal} in total (${s.byRoleStatus.map((r) => `${r.n} ${r.role}/${r.status}`).join(", ") || "none"})`);
  line(`active administrators (${s.admins.length}): ${s.admins.map((a) => `${maskEmail(a.email)} [${a.role}]`).join(", ") || "none"}`);
  const d = decide({ hasMigrationsTable: s.hasMigrationsTable, applied: s.applied, regularFiles, tables: s.tables, columns: s.columns, byRoleStatus: s.byRoleStatus });
  if (d.done) { line("\nALREADY APPLIED: nothing to do."); if (mode === "apply") { console.error("apply refused: it is already applied."); process.exit(3); } process.exit(0); }
  if (d.reasons.length) { line("\nBLOCKED:"); d.reasons.forEach((r) => line("  - " + r)); process.exit(1); }
  if (d.noAdminWarning) line("\nWARNING: no ACTIVE administrator account was found. The migration would still mark every existing account verified, but find out why before going on.");
  line(`\nREADY: would add 2 columns and 2 tables, and mark ALL ${d.total} existing account(s) as verified (LEGACY), including the ${d.admins} administrator(s): nobody existing can be locked out.`);
  if (mode === "plan") { line("\nNothing was changed (plan is read-only)."); process.exit(0); }

  // ---- apply -----------------------------------------------------------------------------------------------------------------------------
  const bp = backupProblem(process.env);
  if (bp) { console.error(`\napply refused: ${bp}.`); process.exit(2); }
  if (process.env.EMAIL_VERIFICATION_MIGRATION_CONFIRM !== phraseFor(host)) { console.error(`\napply refused: set EMAIL_VERIFICATION_MIGRATION_CONFIRM to exactly: ${phraseFor(host)}`); process.exit(2); }
  line(`\nbackup: ${(process.env.BACKUP_REFERENCE || "NO BACKUP (owner-accepted risk)").trim().slice(0, 120)}\napplying...`);
  const cli = require.resolve("typeorm/cli-ts-node-commonjs.js", { paths: [BACKEND] });
  const run = spawnSync(process.execPath, [cli, "migration:run", "-d", "src/database/data-source.ts"], {
    cwd: BACKEND, encoding: "utf8",
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, DATABASE_URL: url, DATABASE_SSL: isLocal ? "false" : "true" },
  });
  const out = (run.stdout || "") + (run.stderr || "");
  const executed = [...out.matchAll(/Migration (\S+) has been\s+executed successfully/g)].map((m) => m[1]);
  line(`CLI exit ${run.status}; executed: ${executed.join(", ") || "(none)"}`);
  if (run.status !== 0) { console.error("The migration run FAILED. It is one transaction, so nothing should have been applied; confirm with: plan\n" + out.replace(/postgres(ql)?:\/\/\S+/gi, "[database url]").slice(-600)); process.exit(1); }

  // ---- verify (read only) ----------------------------------------------------------------------------------------------------------------
  const a = await inspect();
  const problems = verifyAfter({ recorded: a.applied.has(MIGRATION), tablesPresent: NEW_TABLES.every((t) => a.tables.has(t)) && NEW_COLUMNS.every((c) => a.columns.has(c)), unverified: a.unverified, adminsUnverified: a.adminsUnverified, usersBefore: s.usersTotal, usersAfter: a.usersTotal });
  line(`verification: recorded ${a.applied.has(MIGRATION) ? "yes" : "NO"}; accounts ${s.usersTotal} -> ${a.usersTotal}; unverified accounts ${a.unverified}; unverified administrators ${a.adminsUnverified}`);
  if (problems.length) { line("\nVERIFICATION FAILED:"); problems.forEach((p) => line("  - " + p)); process.exit(1); }
  line("\nDONE: the email-verification migration is applied and every existing account (administrators included) is verified. Do not run apply again.");
})().catch((e) => { console.error("failed: " + String(e.message).replace(/postgres(ql)?:\/\/\S+/gi, "[database url]").slice(0, 300)); process.exit(2); });
