const test = require("node:test");
const assert = require("node:assert/strict");
const { maskEmail, phraseFor, parseArgs, decide, applyProblems, actorLabel } = require("./verify-user-email-lib");

test("the address is masked and never printed in full", () => {
  assert.equal(maskEmail("muzzammil@example.com"), "m***@example.com");
  assert.equal(maskEmail("nonsense"), "***");
});

test("arguments: one valid address, a known mode, known flags only", () => {
  assert.deepEqual(parseArgs(["plan", "A@Example.com"]), { mode: "plan", email: "a@example.com", allowLocal: false, reason: "", operator: "" });
  assert.equal(parseArgs(["apply", "a@example.com", "--reason", "owner confirmed by phone", "--operator", "Muzzammil"]).reason, "owner confirmed by phone");
  assert.ok(parseArgs(["plan"]).error);
  assert.ok(parseArgs(["plan", "not-an-email"]).error);
  assert.ok(parseArgs(["delete", "a@example.com"]).error);
  assert.ok(parseArgs(["plan", "a@example.com", "--bulk"]).error);
  assert.ok(parseArgs(["plan", "a@example.com", "b@example.com"]).error); // never more than one account
});

test("what may be done: only an ACTIVE, unverified account is ready", () => {
  assert.equal(decide(undefined).verdict, "NOT FOUND");
  assert.equal(decide({ emailVerifiedAt: new Date(), emailVerifiedVia: "LEGACY", status: "ACTIVE" }).verdict, "NOT NEEDED");
  assert.equal(decide({ emailVerifiedAt: null, status: "SUSPENDED" }).verdict, "BLOCKED");
  assert.equal(decide({ emailVerifiedAt: null, status: "ACTIVE" }).ok, true);
});

test("apply insists on the exact phrase for this address and host, a reason and an operator", () => {
  const good = { reason: "the person's mailbox rejects our mail; identity confirmed by phone", operator: "Muzzammil", email: "a@example.com", host: "db.example.com" };
  assert.deepEqual(applyProblems({ ...good, confirm: phraseFor("a@example.com", "db.example.com") }), []);
  assert.equal(applyProblems({ ...good, confirm: undefined }).length, 1);
  assert.equal(applyProblems({ ...good, confirm: phraseFor("b@example.com", "db.example.com") }).length, 1); // another address
  assert.equal(applyProblems({ ...good, confirm: phraseFor("a@example.com", "other-host") }).length, 1); // another host
  assert.equal(applyProblems({ ...good, reason: "short", confirm: phraseFor("a@example.com", "db.example.com") }).length, 1);
  assert.equal(applyProblems({ ...good, operator: "", confirm: phraseFor("a@example.com", "db.example.com") }).length, 1);
});

test("the audit actor names the operator, the OS account and the machine, within the column size", () => {
  assert.equal(actorLabel("Muzzammil", "muzza", "LAPTOP"), "Muzzammil (os:muzza@LAPTOP)");
  assert.ok(actorLabel("x".repeat(300), "u", "m").length <= 120);
});
