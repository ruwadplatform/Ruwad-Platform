/** Pure rules for verify-user-email.js (the guarded recovery tool): argument checks, the confirmation phrase, and what a plan may conclude. No database, no network. */

const maskEmail = (email) => {
  const e = String(email || "").trim();
  const at = e.lastIndexOf("@");
  return at < 1 ? "***" : `${e[0]}***${e.slice(at)}`;
};

const phraseFor = (email, host) => `VERIFY-EMAIL ${String(email).trim().toLowerCase()} ON ${host}`;

/** Parses `plan|apply <email> [--reason "..."] [--operator "..."] [--allow-local]`. Returns { error } for anything malformed. */
function parseArgs(argv) {
  const [mode = "plan", email, ...rest] = argv;
  const flags = { allowLocal: false, reason: "", operator: "" };
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--allow-local") flags.allowLocal = true;
    else if (rest[i] === "--reason") flags.reason = rest[++i] ?? "";
    else if (rest[i] === "--operator") flags.operator = rest[++i] ?? "";
    else return { error: `unknown argument: ${rest[i]}` };
  }
  if (!["plan", "apply"].includes(mode)) return { error: "mode must be plan or apply" };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return { error: "give exactly one valid email address" };
  return { mode, email: email.trim().toLowerCase(), ...flags };
}

/** What may be done to this account. `user` is the row found by email (or undefined). */
function decide(user) {
  if (!user) return { ok: false, verdict: "NOT FOUND", reason: "no account has this email address" };
  if (user.emailVerifiedAt) return { ok: false, verdict: "NOT NEEDED", reason: `this address is already verified (${user.emailVerifiedVia || "unknown source"})` };
  if (user.status !== "ACTIVE") return { ok: false, verdict: "BLOCKED", reason: `the account status is ${user.status}, not ACTIVE; verifying it would not let the person in, so nothing is changed` };
  return { ok: true, verdict: "READY", reason: "the account is ACTIVE and unverified" };
}

/** Everything `apply` insists on, in one place. Returns a list of problems (empty = go). */
function applyProblems({ reason, operator, confirm, email, host }) {
  const problems = [];
  if ((reason || "").trim().length < 10) problems.push('--reason "<why this person is being verified by hand>" is required (at least 10 characters)');
  if ((operator || "").trim().length < 2) problems.push('--operator "<your name>" is required');
  if (confirm !== phraseFor(email, host)) problems.push(`set VERIFY_USER_CONFIRM to exactly: ${phraseFor(email, host)}`);
  return problems;
}

/** Who is recorded in the audit row: the named operator plus the operating-system account and machine that ran the tool, capped to the column. */
const actorLabel = (operator, osUser, machine) => `${operator.trim()} (os:${osUser}@${machine})`.slice(0, 120);

module.exports = { maskEmail, phraseFor, parseArgs, decide, applyProblems, actorLabel };
