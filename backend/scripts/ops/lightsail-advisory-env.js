#!/usr/bin/env node
/**
 * The exact production environment change for the Advisory launch, with guards. It adds the 7 missing Advisory variables and updates APP_URL in ONE
 * Lightsail deployment (infra/aws/set-lightsail-env.js does the actual change). It touches nothing else; in particular FRONTEND_URL and
 * GOOGLE_REDIRECT_URI are never part of it.
 *
 *   plan    READ ONLY. Validates the inputs, checks the Daily key against the Daily account, reads Lightsail, and prints which variable NAMES would be
 *           added or updated (via set-lightsail-env.js --dry-run). Creates no deployment.
 *   apply   PRODUCTION CHANGE. Same checks, then creates the deployment, waits for it to be ACTIVE and healthy, and runs the audit, which must say READY.
 *
 * Inputs (process environment only; never printed; never read from backend/.env):
 *   DAILY_API_KEY             or DAILY_API_KEY_FILE            (default: ~/secure/daily-api-key.txt)
 *   DAILY_WEBHOOK_SECRET      or DAILY_WEBHOOK_SECRET_FILE     (default: ~/secure/daily-webhook-secret.txt; base64, at least 32 bytes)
 *   EXPECT_DEPLOYMENT_VERSION the Lightsail deployment version that must be current (default 10, recorded in the preflight)
 *   LIGHTSAIL_ENV_CONFIRM     apply only; must be exactly: SET-ADVISORY-ENV ruwad-backend FROM-VERSION-<EXPECT_DEPLOYMENT_VERSION>
 *
 * Values set: ADVISORY_ENABLED=true, ADVISORY_VIDEO_PROVIDER=daily, DAILY_DOMAIN=ruwadstudio, ADVISORY_EMAIL_MODE=live, ADVISORY_SCHEDULER_ENABLED=true,
 *             APP_URL=https://www.ruwad.studio, DAILY_API_KEY, DAILY_WEBHOOK_SECRET.
 * The secrets go to the helper as command-line arguments of a local child process for a few seconds; they are never written to disk or printed.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PRODUCTION_BACKEND, PRODUCTION_SITE, isBase64Secret } = require("./launch-config");

const SERVICE = "ruwad-backend";
const REGION = "ap-southeast-2";
const DAILY_DOMAIN = "ruwadstudio";
const mode = (process.argv[2] || "plan").toLowerCase();
const profile = process.argv.includes("--profile") ? process.argv[process.argv.indexOf("--profile") + 1] : "ruwad";
const expectVersion = String(process.env.EXPECT_DEPLOYMENT_VERSION || "10");
const AWS = process.env.AWS_CLI || (process.platform === "win32" ? "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe" : "aws");
const HELPER = path.join(__dirname, "..", "..", "..", "infra", "aws", "set-lightsail-env.js");

const die = (m, c = 2) => { console.error(m); process.exit(c); };
if (!["plan", "apply"].includes(mode)) die("Usage: lightsail-advisory-env.js plan|apply [--profile ruwad]");

const fromEnvOrFile = (name, defFile) => {
  const direct = (process.env[name] || "").trim();
  if (direct) return direct;
  const f = process.env[name + "_FILE"] || path.join(os.homedir(), "secure", defFile);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim() : "";
};
const dailyKey = fromEnvOrFile("DAILY_API_KEY", "daily-api-key.txt");
const secret = fromEnvOrFile("DAILY_WEBHOOK_SECRET", "daily-webhook-secret.txt");
if (!dailyKey) die("The Daily API key is missing (set DAILY_API_KEY, or put it in DAILY_API_KEY_FILE / ~/secure/daily-api-key.txt).");
if (!isBase64Secret(secret)) die("The webhook secret is missing or weak: it must be base64 of at least 32 bytes (create it with: node backend/scripts/ops/daily-webhook-production.js gen-secret <file>).");
if (secret === dailyKey) die("The webhook secret must not be the Daily API key.");

const aws = (args) => execFileSync(AWS, [...args, "--profile", profile, "--region", REGION], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const clean = (e) => String((e && e.stderr) || (e && e.message) || e).replace(/\s+/g, " ").slice(0, 240);

(async () => {
  // 1. the Daily key belongs to the expected Daily domain (a read)
  const d = await fetch("https://api.daily.co/v1/", { headers: { authorization: `Bearer ${dailyKey}` }, signal: AbortSignal.timeout(20000) });
  const dj = await d.json().catch(() => ({}));
  if (d.status !== 200 || dj.domain_name !== DAILY_DOMAIN) die(`The Daily key was not accepted for the domain "${DAILY_DOMAIN}" (HTTP ${d.status}${dj.domain_name ? ", domain " + dj.domain_name : ""}).`);
  console.log(`Daily key accepted for domain ${dj.domain_name}.`);

  // 2. Lightsail is in the state the preflight recorded
  let cur;
  try { cur = JSON.parse(aws(["lightsail", "get-container-service-deployments", "--service-name", SERVICE, "--query", "deployments[0]", "--output", "json"])); }
  catch (e) { die("Could not read Lightsail (is the AWS session valid? run: aws login --profile " + profile + "): " + clean(e), 2); }
  console.log(`Lightsail current deployment: version ${cur.version} (${cur.state}), image ${String(cur.containers.app.image).replace(/^.*\//, "")}`);
  if (String(cur.version) !== expectVersion || cur.state !== "ACTIVE") die(`Refusing: the current deployment is version ${cur.version} (${cur.state}), not ACTIVE version ${expectVersion}. Something changed since the preflight; look at it and set EXPECT_DEPLOYMENT_VERSION deliberately.`, 1);

  const kv = ["ADVISORY_ENABLED=true", "ADVISORY_VIDEO_PROVIDER=daily", `DAILY_DOMAIN=${DAILY_DOMAIN}`, "ADVISORY_EMAIL_MODE=live", "ADVISORY_SCHEDULER_ENABLED=true", `APP_URL=${PRODUCTION_SITE}`, `DAILY_API_KEY=${dailyKey}`, `DAILY_WEBHOOK_SECRET=${secret}`];
  if (kv.some((x) => /^(FRONTEND_URL|GOOGLE_REDIRECT_URI|PUBLIC_API_URL)=/.test(x))) die("Internal guard: this change must never touch FRONTEND_URL, GOOGLE_REDIRECT_URI or PUBLIC_API_URL.");
  const helper = (extra) => execFileSync(process.execPath, [HELPER, "--profile", profile, ...extra, ...kv], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  // 3. what would change (names only)
  const dry = helper(["--dry-run"]);
  console.log(dry.split("\n").filter((l) => /^(Changes:|Already|Dry run)/.test(l)).join("\n"));
  if (mode === "plan") return void console.log("\nPLAN ONLY: nothing was deployed.");

  // 4. apply
  const phrase = `SET-ADVISORY-ENV ${SERVICE} FROM-VERSION-${expectVersion}`;
  if (process.env.LIGHTSAIL_ENV_CONFIRM !== phrase) die(`\napply refused: set LIGHTSAIL_ENV_CONFIRM to exactly: ${phrase}`);
  const out = helper([]);
  const m = /Created deployment version (\d+)/.exec(out);
  if (!m) die("The helper did not report a new deployment version; check Lightsail before doing anything else.\n" + out.split("\n").slice(-3).join("\n"), 1);
  const next = m[1];
  console.log(`Created deployment version ${next}; waiting for it to become ACTIVE...`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const s = JSON.parse(aws(["lightsail", "get-container-service-deployments", "--service-name", SERVICE, "--query", `deployments[?version==\`${next}\`]|[0]`, "--output", "json"]));
    process.stdout.write(`  version ${next}: ${s.state}\n`);
    if (s.state === "ACTIVE") break;
    if (s.state === "FAILED") die(`Deployment ${next} FAILED. Lightsail keeps serving version ${cur.version}. Nothing public changed.`, 1);
    if (i === 59) die(`Deployment ${next} did not become ACTIVE within 10 minutes; look at the Lightsail console. Version ${cur.version} is the rollback target.`, 1);
  }
  const h = await fetch(PRODUCTION_BACKEND + "/api/health", { signal: AbortSignal.timeout(20000) }).then((r) => r.status).catch(() => 0);
  console.log(`health after the change: HTTP ${h}`);
  let audit = 0;
  try { execFileSync(process.execPath, [path.join(__dirname, "lightsail-env-audit.js"), "--profile", profile], { stdio: "inherit" }); } catch (e) { audit = e.status || 1; }
  if (h !== 200 || audit !== 0) die(`\nNOT HEALTHY: health ${h}, audit exit ${audit}. Roll back by redeploying Lightsail version ${cur.version} (see the runbook).`, 1);
  console.log(`\nDONE: the Advisory environment is set (deployment ${next}). The audit says READY. Rollback target if needed: version ${cur.version}.`);
})().catch((e) => die("failed: " + clean(e), 1));
