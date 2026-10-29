// node --test backend/scripts/ops/launch-config.test.js
// Pure tests for the launch rules, plus the guard paths of the production scripts that need no network (every case below is refused or read-only).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { evaluateEnv, isBase64Secret, isHttpsPublic, PRODUCTION_SITE } = require("./launch-config");

// The values production has today (read from Lightsail deployment 10): the site address the owner uses for links is www, while FRONTEND_URL and the Google redirect stay on vercel.app.
const VERCEL_APP = "https://ruwad-platform.vercel.app";
const GOOD = {
  ADVISORY_ENABLED: "true", ADVISORY_VIDEO_PROVIDER: "daily", DAILY_API_KEY: "k".repeat(40), DAILY_DOMAIN: "ruwadstudio", DAILY_WEBHOOK_SECRET: Buffer.alloc(32, 7).toString("base64"),
  ADVISORY_EMAIL_MODE: "live", RESEND_API_KEY: "re_x".repeat(8), EMAIL_FROM: "RUWAD <no-reply@karama.tech>", ADMIN_NOTIFICATION_EMAIL: "admin@example.test",
  APP_URL: PRODUCTION_SITE, FRONTEND_URL: VERCEL_APP, GOOGLE_REDIRECT_URI: `${VERCEL_APP}/api/calendar/callback`, ADVISORY_SCHEDULER_ENABLED: "true", NODE_ENV: "production", RUN_MIGRATIONS: "false",
};

test("the intended launch environment passes every rule", () => {
  const r = evaluateEnv(GOOD);
  assert.deepEqual(r.failing, []);
  assert.equal(r.ok, true);
});

test("today's production (no Advisory settings) fails exactly the Advisory rules, not the unrelated ones", () => {
  const today = { NODE_ENV: "production", RUN_MIGRATIONS: "false", RESEND_API_KEY: "re_x".repeat(8), EMAIL_FROM: "ruwadplatform@karama.tech", ADMIN_NOTIFICATION_EMAIL: "a@example.test", APP_URL: VERCEL_APP, FRONTEND_URL: VERCEL_APP, GOOGLE_REDIRECT_URI: VERCEL_APP };
  const f = evaluateEnv(today).failing;
  for (const n of ["ADVISORY_ENABLED", "ADVISORY_VIDEO_PROVIDER", "DAILY_API_KEY", "DAILY_DOMAIN", "DAILY_WEBHOOK_SECRET", "ADVISORY_EMAIL_MODE", "ADVISORY_SCHEDULER_ENABLED", "APP_URL"]) assert.ok(f.includes(n), n); // APP_URL: set to the www address at the release
  for (const n of ["NODE_ENV", "RUN_MIGRATIONS", "RESEND_API_KEY", "FRONTEND_URL"]) assert.ok(!f.includes(n), n); // FRONTEND_URL is fine as it is
});

test("each dangerous value is caught", () => {
  const bad = (over) => evaluateEnv({ ...GOOD, ...over }).failing;
  assert.deepEqual(bad({ ADVISORY_MIGRATIONS: "true" }), ["ADVISORY_MIGRATIONS"]);
  assert.deepEqual(bad({ ADVISORY_AUTOCOMPLETE_ENABLED: "true" }), ["ADVISORY_AUTOCOMPLETE_ENABLED"]);
  assert.deepEqual(bad({ ADVISORY_MAX_PENDING_REQUESTS: "50" }), ["ADVISORY_MAX_PENDING_REQUESTS"]);
  assert.deepEqual(bad({ ADVISORY_MAX_PENDING_REQUESTS: "2" }), []);
  assert.deepEqual(bad({ DAILY_API_BASE: "http://localhost:9999" }), ["DAILY_API_BASE"]);
  assert.deepEqual(bad({ ADVISORY_EMAIL_MODE: "Live" }), ["ADVISORY_EMAIL_MODE"]); // exactly "live" only
  assert.deepEqual(bad({ APP_URL: "http://localhost:5174" }), ["APP_URL"]);
  assert.deepEqual(bad({ APP_URL: VERCEL_APP }), ["APP_URL"]); // the owner chose the www address for links
  assert.deepEqual(bad({ FRONTEND_URL: "http://localhost:5174" }), ["FRONTEND_URL"]);
  assert.deepEqual(bad({ FRONTEND_URL: "" }), ["FRONTEND_URL"]);
  // FRONTEND_URL is guarded against the change that would break Google Calendar sign-in, and is NOT forced to the www address
  assert.deepEqual(bad({ FRONTEND_URL: PRODUCTION_SITE }), ["FRONTEND_URL"]);
  assert.deepEqual(bad({ FRONTEND_URL: `${VERCEL_APP},${PRODUCTION_SITE}` }), []);
  assert.deepEqual(bad({ FRONTEND_URL: PRODUCTION_SITE, GOOGLE_REDIRECT_URI: undefined }), []);
  assert.deepEqual(bad({ RUN_MIGRATIONS: "true" }), ["RUN_MIGRATIONS"]);
  assert.deepEqual(bad({ DAILY_WEBHOOK_SECRET: "short" }), ["DAILY_WEBHOOK_SECRET"]);
  assert.deepEqual(bad({ NODE_ENV: "development" }), ["NODE_ENV"]);
});

test("the audit never carries a secret value", () => {
  const out = JSON.stringify(evaluateEnv(GOOD));
  for (const secret of [GOOD.DAILY_API_KEY, GOOD.RESEND_API_KEY, GOOD.DAILY_WEBHOOK_SECRET]) assert.ok(!out.includes(secret));
  assert.ok(out.includes("ruwadstudio")); // a non-secret value may be shown
});

test("secret and URL helpers", () => {
  assert.equal(isBase64Secret(Buffer.alloc(32, 1).toString("base64")), true);
  assert.equal(isBase64Secret(Buffer.alloc(16, 1).toString("base64")), false);
  assert.equal(isBase64Secret(""), false);
  assert.equal(isHttpsPublic("https://www.ruwad.studio"), true);
  assert.equal(isHttpsPublic("http://www.ruwad.studio"), false);
  assert.equal(isHttpsPublic("https://localhost:4000"), false);
});

const run = (script, args, env = {}) => spawnSync(process.execPath, [path.join(__dirname, script), ...args], { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env }, encoding: "utf8", timeout: 20000 });

test("daily-webhook-production refuses everything unsafe without touching the network", () => {
  const secret = Buffer.alloc(32, 9).toString("base64");
  // no key at all
  assert.notEqual(run("daily-webhook-production.js", ["list"]).status, 0);
  // a tunnel or local URL is never accepted
  for (const u of ["https://abc.trycloudflare.com/api/advisory/webhooks/daily", "http://127.0.0.1:4000/api/advisory/webhooks/daily", "https://example.com/other"]) {
    const r = run("daily-webhook-production.js", ["register"], { DAILY_API_KEY: "x", DAILY_WEBHOOK_SECRET: secret, WEBHOOK_URL: u, DAILY_WEBHOOK_CONFIRM: "REGISTER example.com" });
    assert.notEqual(r.status, 0, u);
  }
  // a weak secret, then a missing confirmation
  assert.match(run("daily-webhook-production.js", ["register"], { DAILY_API_KEY: "x", DAILY_WEBHOOK_SECRET: "weak" }).stderr, /base64 string of at least 32 bytes/);
  assert.match(run("daily-webhook-production.js", ["register"], { DAILY_API_KEY: "x", DAILY_WEBHOOK_SECRET: secret }).stderr, /DAILY_WEBHOOK_CONFIRM/);
  assert.match(run("daily-webhook-production.js", ["delete", "abc"], { DAILY_API_KEY: "x" }).stderr, /DAILY_WEBHOOK_CONFIRM/);
});

test("gen-secret writes a 32-byte secret, never prints it, and never overwrites", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ruwad-secret-")), "s.txt");
  const r = run("daily-webhook-production.js", ["gen-secret", f]);
  assert.equal(r.status, 0);
  const v = fs.readFileSync(f, "utf8");
  assert.equal(Buffer.from(v, "base64").length, 32);
  assert.ok(!r.stdout.includes(v));
  assert.notEqual(run("daily-webhook-production.js", ["gen-secret", f]).status, 0);
  fs.rmSync(path.dirname(f), { recursive: true, force: true });
});

test("advisory-migrate refuses without DATABASE_URL, refuses a local database without --allow-local, and never prints the connection string", () => {
  assert.notEqual(run("advisory-migrate.js", ["plan"]).status, 0);
  const r = run("advisory-migrate.js", ["plan"], { DATABASE_URL: "postgresql://user:SuperSecretPw@127.0.0.1:55432/x" });
  assert.notEqual(r.status, 0);
  assert.ok(!(r.stdout + r.stderr).includes("SuperSecretPw"));
  assert.match(r.stderr, /allow-local/);
  const remoteLocalFlag = run("advisory-migrate.js", ["plan", "--allow-local"], { DATABASE_URL: "postgresql://user:SuperSecretPw@db.example.test:5432/x" });
  assert.notEqual(remoteLocalFlag.status, 0);
  assert.ok(!(remoteLocalFlag.stdout + remoteLocalFlag.stderr).includes("SuperSecretPw"));
});

test("lightsail-advisory-env refuses before touching AWS or Daily when the inputs are missing or weak", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "ruwad-home-"));
  const env = { USERPROFILE: empty, HOME: empty };
  assert.match(run("lightsail-advisory-env.js", ["plan"], env).stderr, /Daily API key is missing/);
  assert.match(run("lightsail-advisory-env.js", ["plan"], { ...env, DAILY_API_KEY: "k".repeat(30) }).stderr, /webhook secret is missing or weak/);
  assert.match(run("lightsail-advisory-env.js", ["plan"], { ...env, DAILY_API_KEY: "k".repeat(30), DAILY_WEBHOOK_SECRET: "weak" }).stderr, /missing or weak/);
  const same = Buffer.alloc(32, 5).toString("base64");
  assert.match(run("lightsail-advisory-env.js", ["plan"], { ...env, DAILY_API_KEY: same, DAILY_WEBHOOK_SECRET: same }).stderr, /must not be the Daily API key/);
  assert.notEqual(run("lightsail-advisory-env.js", ["bogus"], env).status, 0);
  fs.rmSync(empty, { recursive: true, force: true });
});

test("prod-snapshot refuses a local database without --allow-local, a remote one with it, and never overwrites a snapshot", () => {
  const f = path.join(os.tmpdir(), `ruwad-snap-${process.pid}.json`);
  assert.match(run("prod-snapshot.js", ["take", f], { DATABASE_URL: "postgresql://u:SecretPw@127.0.0.1:55432/x" }).stderr, /allow-local/);
  const r = run("prod-snapshot.js", ["take", f, "--allow-local"], { DATABASE_URL: "postgresql://u:SecretPw@db.example.test:5432/x" });
  assert.notEqual(r.status, 0);
  assert.ok(!(r.stdout + r.stderr).includes("SecretPw"));
  assert.notEqual(run("prod-snapshot.js", ["take"], { DATABASE_URL: "postgresql://u:p@127.0.0.1/x" }).status, 0);
  assert.notEqual(run("prod-snapshot.js", ["take", f]).status, 0); // no DATABASE_URL
});

test("lightsail-rollback needs a mode and a numeric version before it does anything", () => {
  for (const args of [[], ["plan"], ["plan", "abc"], ["apply"], ["bogus", "10"]]) assert.notEqual(run("lightsail-rollback.js", args).status, 0, args.join(" "));
  assert.match(run("lightsail-rollback.js", ["plan"]).stderr, /Usage/);
});

test("daily-domain-geo refuses every change before any network call: bad region, no key, no or wrong confirmation phrase", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "ruwad-home-"));
  const env = { USERPROFILE: empty, HOME: empty };
  const ok = "SET-DAILY-GEO eu-central-1 ON ruwadstudio";
  assert.match(run("daily-domain-geo.js", ["set", "mars-1"], { ...env, DAILY_GEO_CONFIRM: ok }).stderr, /documented regions/);
  assert.match(run("daily-domain-geo.js", ["set"], env).stderr, /documented regions/);
  assert.match(run("daily-domain-geo.js", ["set", "eu-central-1"], { ...env, DAILY_API_KEY: "k".repeat(30) }).stderr, /DAILY_GEO_CONFIRM/);
  assert.match(run("daily-domain-geo.js", ["set", "eu-central-1"], { ...env, DAILY_API_KEY: "k".repeat(30), DAILY_GEO_CONFIRM: "yes" }).stderr, /DAILY_GEO_CONFIRM/);
  assert.match(run("daily-domain-geo.js", ["set", "us-east-1"], { ...env, DAILY_API_KEY: "k".repeat(30), DAILY_GEO_CONFIRM: ok }).stderr, /DAILY_GEO_CONFIRM/); // phrase is bound to the region
  assert.match(run("daily-domain-geo.js", ["set", "eu-central-1"], { ...env, DAILY_GEO_CONFIRM: ok }).stderr, /API key is missing/);
  assert.match(run("daily-domain-geo.js", ["restore"], { ...env, DAILY_API_KEY: "k".repeat(30) }).stderr, /DAILY_GEO_CONFIRM/);
  assert.match(run("daily-domain-geo.js", ["bogus"], env).stderr, /Usage/);
  fs.rmSync(empty, { recursive: true, force: true });
});
