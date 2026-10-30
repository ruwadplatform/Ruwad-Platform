/** Pure rules for email-verification-migrate.js: what a read-only look at the database may conclude. No database, no network. */

const MIGRATION = "AddEmailVerification1794700000000";
const NEW_TABLES = ["email_verification_codes", "email_verification_audit"];
const NEW_COLUMNS = ["emailVerifiedAt", "emailVerifiedVia"];
const ADMIN_ROLES = ["RUWAD_ADMIN", "SUPER_ADMIN"];

/** s = { hasMigrationsTable, applied:Set<string>, regularFiles:string[] (names), tables:Set<string>, columns:Set<string> (users columns), byRoleStatus:[{role,status,n}] } */
function decide(s) {
  const reasons = [];
  if (!s.hasMigrationsTable) reasons.push("the migrations table does not exist: this is not the RUWAD database");
  const done = s.applied.has(MIGRATION);
  const pendingOthers = s.regularFiles.filter((n) => n !== MIGRATION && !s.applied.has(n));
  if (!done && pendingOthers.length) reasons.push(`${pendingOthers.length} OTHER migration(s) are pending (${pendingOthers.slice(0, 3).join(", ")}): an unrelated schema change would ride along. Stop and ask`);
  const strayTables = NEW_TABLES.filter((t) => s.tables.has(t));
  const strayColumns = NEW_COLUMNS.filter((c) => s.columns.has(c));
  if (!done && (strayTables.length || strayColumns.length)) reasons.push(`part of this feature already exists without its migration record (${[...strayTables, ...strayColumns].join(", ")}): do not continue until someone has looked`);
  if (done && (strayTables.length !== NEW_TABLES.length || strayColumns.length !== NEW_COLUMNS.length)) reasons.push("the migration is recorded as applied but some of its tables or columns are missing");
  const total = s.byRoleStatus.reduce((a, r) => a + r.n, 0);
  const admins = s.byRoleStatus.filter((r) => ADMIN_ROLES.includes(r.role) && r.status === "ACTIVE").reduce((a, r) => a + r.n, 0);
  return { reasons, done, total, admins, noAdminWarning: !done && admins === 0 };
}

/** After applying: every existing account must be verified and every administrator included. */
function verifyAfter(a) {
  const problems = [];
  if (!a.recorded) problems.push("the migration is not recorded");
  if (!a.tablesPresent) problems.push("the new tables are missing");
  if (a.unverified !== 0) problems.push(`${a.unverified} account(s) are still unverified after the backfill`);
  if (a.adminsUnverified !== 0) problems.push(`${a.adminsUnverified} administrator account(s) are unverified`);
  if (a.usersBefore !== a.usersAfter) problems.push(`the number of accounts changed (${a.usersBefore} -> ${a.usersAfter})`);
  return problems;
}

const phraseFor = (host) => `APPLY-EMAIL-VERIFICATION-MIGRATION-TO ${host}`;

/** The backup rule: a reference to a verified backup, OR the owner's explicit acknowledgement that there is none (the recorded accepted risk). */
const backupProblem = (env) => ((env.BACKUP_REFERENCE || "").trim().length >= 8 || env.NO_BACKUP_ACKNOWLEDGED === "OWNER-ACCEPTED-RISK") ? null : "set BACKUP_REFERENCE (where the verified backup is) or NO_BACKUP_ACKNOWLEDGED=OWNER-ACCEPTED-RISK";

module.exports = { MIGRATION, NEW_TABLES, NEW_COLUMNS, ADMIN_ROLES, decide, verifyAfter, phraseFor, backupProblem };
