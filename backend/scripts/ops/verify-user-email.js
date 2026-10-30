#!/usr/bin/env node
/**
 * Guarded recovery tool: marks ONE account's email address as verified by hand (for a person whose verification email never arrived and who cannot be helped any
 * other way), with an audit record. It is a command-line tool only. It is NOT an API endpoint and nothing in the application can call it.
 *
 *   plan   (default, strictly READ ONLY)
 *     DATABASE_URL=<direct connection string> node backend/scripts/ops/verify-user-email.js plan person@example.com
 *   apply
 *     DATABASE_URL=... VERIFY_USER_CONFIRM="VERIFY-EMAIL person@example.com ON <host>" \
 *       node backend/scripts/ops/verify-user-email.js apply person@example.com --reason "why" --operator "Your Name"
 *
 * What it guarantees:
 *   - DATABASE_URL must be in this process's environment; it is never read from backend/.env and never printed (only host and port are shown).
 *   - `plan` runs inside BEGIN READ ONLY and sends only SELECTs. It prints a masked address and the account's state, never a password hash, token or code.
 *   - `apply` re-runs the plan, requires the exact confirmation phrase for THIS address on THIS host, a written reason and an operator name, and then, in ONE
 *     transaction: marks the address verified (only if it is still unverified), retires any outstanding code, and writes the audit row (who, which account, why).
 *   - It refuses accounts that are already verified, not ACTIVE, or not found, and it never touches more than one account.
 *   - A database on this machine is refused unless --allow-local (rehearsal); a remote one cannot use --allow-local.
 */
const os = require("node:os");
const { Client } = require("pg");
const { maskEmail, parseArgs, decide, applyProblems, actorLabel } = require("./verify-user-email-lib");

const args = parseArgs(process.argv.slice(2));
if (args.error) { console.error(args.error + "\nUsage: verify-user-email.js plan|apply <email> [--reason \"...\" --operator \"...\"] [--allow-local]"); process.exit(2); }

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set in this process (it is deliberately not read from any .env file)."); process.exit(2); }
let target; try { target = new URL(url); } catch { console.error("DATABASE_URL is not a valid URL."); process.exit(2); }
const host = target.hostname;
const isLocal = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
if (isLocal && !args.allowLocal) { console.error(`Refusing: ${host} is this machine. Use --allow-local only for a rehearsal on a scratch database.`); process.exit(2); }
if (!isLocal && args.allowLocal) { console.error("Refusing: --allow-local cannot be used with a remote database."); process.exit(2); }

const client = () => new Client({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 20000, statement_timeout: 30000, application_name: "ruwad-verify-user-email" });
const line = (s = "") => console.log(s);

async function load(c, email) {
  const { rows } = await c.query(`SELECT id, role, status, "createdAt", "emailVerifiedAt", "emailVerifiedVia" FROM users WHERE email = $1`, [email]);
  if (!rows.length) return undefined;
  const codes = (await c.query(`SELECT count(*)::int AS n, max("createdAt") AS last FROM email_verification_codes WHERE "userId" = $1`, [rows[0].id])).rows[0];
  return { ...rows[0], codes: codes.n, lastCodeAt: codes.last };
}

(async () => {
  line(`target: ${host}${isLocal ? " (this machine, rehearsal)" : ""}   mode: ${args.mode}   account: ${maskEmail(args.email)}`);
  const c = client();
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const u = await load(c, args.email);
    await c.query("ROLLBACK");
    const d = decide(u);
    if (u) line(`found: role ${u.role}, status ${u.status}, created ${new Date(u.createdAt).toISOString().slice(0, 10)}, verified ${u.emailVerifiedAt ? "yes (" + (u.emailVerifiedVia || "?") + ")" : "no"}, codes issued ${u.codes}${u.lastCodeAt ? ", last " + new Date(u.lastCodeAt).toISOString() : ""}`);
    line(`${d.verdict}: ${d.reason}`);
    if (!d.ok) process.exit(d.verdict === "NOT NEEDED" ? 0 : 1);
    if (args.mode === "plan") { line("\nNothing was changed (plan is read-only)."); process.exit(0); }

    const problems = applyProblems({ reason: args.reason, operator: args.operator, confirm: process.env.VERIFY_USER_CONFIRM, email: args.email, host });
    if (problems.length) { console.error("\napply refused:\n  - " + problems.join("\n  - ")); process.exit(2); }

    await c.query("BEGIN");
    const upd = await c.query(`UPDATE users SET "emailVerifiedAt" = now(), "emailVerifiedVia" = 'ADMIN' WHERE id = $1 AND "emailVerifiedAt" IS NULL AND status = 'ACTIVE'`, [u.id]);
    if (upd.rowCount !== 1) { await c.query("ROLLBACK"); console.error("The account changed while this ran (it is no longer unverified and active). Nothing was changed."); process.exit(1); }
    await c.query(`UPDATE email_verification_codes SET "supersededAt" = now() WHERE "userId" = $1 AND "consumedAt" IS NULL AND "supersededAt" IS NULL`, [u.id]);
    const audit = await c.query(`INSERT INTO email_verification_audit ("userId", action, actor, reason) VALUES ($1, 'ADMIN_VERIFIED', $2, $3) RETURNING id`, [u.id, actorLabel(args.operator, os.userInfo().username, os.hostname()), args.reason.trim()]);
    await c.query("COMMIT");

    const check = await load(c, args.email);
    const ok = !!check?.emailVerifiedAt && check.emailVerifiedVia === "ADMIN";
    line(`\n${ok ? "DONE" : "VERIFICATION FAILED"}: ${maskEmail(args.email)} is ${ok ? "now verified (source ADMIN)" : "NOT shown as verified: look at it before doing anything else"}. Audit record ${audit.rows[0].id} written.`);
    process.exit(ok ? 0 : 1);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    await c.end().catch(() => {});
  }
})().catch((e) => { console.error("failed: " + String(e.message).replace(/postgres(ql)?:\/\/\S+/gi, "[database url]").slice(0, 300)); process.exit(2); });
