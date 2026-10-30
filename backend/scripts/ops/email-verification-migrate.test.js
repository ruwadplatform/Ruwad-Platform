const test = require("node:test");
const assert = require("node:assert/strict");
const { MIGRATION, decide, verifyAfter, phraseFor, backupProblem } = require("./email-verification-migrate-lib");

const base = (over = {}) => ({ hasMigrationsTable: true, applied: new Set(["Older1"]), regularFiles: ["Older1", MIGRATION], tables: new Set(["users"]), columns: new Set(["id"]), byRoleStatus: [{ role: "RUWAD_ADMIN", status: "ACTIVE", n: 1 }], ...over });

test("a clean database with only this migration pending is READY and counts the accounts and administrators it will protect", () => {
  const d = decide(base());
  assert.deepEqual(d.reasons, []);
  assert.equal(d.total, 1);
  assert.equal(d.admins, 1);
  assert.equal(d.noAdminWarning, false);
});

test("it warns (does not block) when no active administrator exists", () => {
  const d = decide(base({ byRoleStatus: [{ role: "USER", status: "ACTIVE", n: 3 }] }));
  assert.deepEqual(d.reasons, []);
  assert.equal(d.noAdminWarning, true);
});

test("it is blocked by any OTHER pending migration, a missing migrations table, or a half-applied feature", () => {
  assert.equal(decide(base({ regularFiles: ["Older1", "Unrelated2", MIGRATION] })).reasons.length, 1);
  assert.equal(decide(base({ hasMigrationsTable: false })).reasons.length >= 1, true);
  assert.equal(decide(base({ tables: new Set(["users", "email_verification_codes"]) })).reasons.length, 1);
  assert.equal(decide(base({ columns: new Set(["id", "emailVerifiedAt"]) })).reasons.length, 1);
});

test("once applied it says so, and flags a recorded migration whose objects are missing", () => {
  const done = base({ applied: new Set(["Older1", MIGRATION]), tables: new Set(["users", "email_verification_codes", "email_verification_audit"]), columns: new Set(["id", "emailVerifiedAt", "emailVerifiedVia"]) });
  assert.equal(decide(done).done, true);
  assert.deepEqual(decide(done).reasons, []);
  assert.equal(decide({ ...done, tables: new Set(["users"]) }).reasons.length, 1);
});

test("after applying, every account and every administrator must be verified and the account count must not change", () => {
  const ok = { recorded: true, tablesPresent: true, unverified: 0, adminsUnverified: 0, usersBefore: 1, usersAfter: 1 };
  assert.deepEqual(verifyAfter(ok), []);
  assert.equal(verifyAfter({ ...ok, unverified: 1 }).length, 1);
  assert.equal(verifyAfter({ ...ok, adminsUnverified: 1 }).length, 1);
  assert.equal(verifyAfter({ ...ok, usersAfter: 0 }).length, 1);
  assert.equal(verifyAfter({ ...ok, recorded: false, tablesPresent: false }).length, 2);
});

test("apply needs the host-specific phrase and a backup reference or the owner's explicit no-backup acknowledgement", () => {
  assert.equal(phraseFor("db.example.com"), "APPLY-EMAIL-VERIFICATION-MIGRATION-TO db.example.com");
  assert.equal(backupProblem({ BACKUP_REFERENCE: "snapshot-2026-11-01" }), null);
  assert.equal(backupProblem({ NO_BACKUP_ACKNOWLEDGED: "OWNER-ACCEPTED-RISK" }), null);
  assert.ok(backupProblem({}));
  assert.ok(backupProblem({ BACKUP_REFERENCE: "short" }));
  assert.ok(backupProblem({ NO_BACKUP_ACKNOWLEDGED: "yes" }));
});
