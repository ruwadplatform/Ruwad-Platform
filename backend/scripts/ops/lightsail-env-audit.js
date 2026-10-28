#!/usr/bin/env node
/**
 * READ-ONLY audit of the production backend's runtime configuration on AWS Lightsail against what the Advisory launch needs (launch-config.js).
 *
 *   node backend/scripts/ops/lightsail-env-audit.js [--profile ruwad] [--json]
 *
 * It only runs `aws lightsail get-container-service-deployments` (a read). It prints variable NAMES and set / absent; values are printed only for
 * names that cannot be secrets (APP_URL, ADVISORY_* flags, NODE_ENV, ...). Secrets (keys, tokens, passwords, database URLs) are never printed.
 * Needs a logged-in AWS profile: `aws login --profile ruwad`. Exit code 0 = ready for launch, 1 = something to fix, 2 = could not read.
 *
 * Run it BEFORE the launch (expected: the Advisory rows fail until the environment is set) and AFTER setting the environment (expected: all pass).
 */
const { execFileSync } = require("node:child_process");
const { evaluateEnv } = require("./launch-config");

const SERVICE = "ruwad-backend";
const REGION = "ap-southeast-2";
const AWS = process.env.AWS_CLI || (process.platform === "win32" ? "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe" : "aws");

const args = process.argv.slice(2);
const profile = args.includes("--profile") ? args[args.indexOf("--profile") + 1] : "ruwad";
const asJson = args.includes("--json");

let deployment;
try {
  const out = execFileSync(AWS, ["lightsail", "get-container-service-deployments", "--service-name", SERVICE, "--query", "deployments[0]", "--output", "json", "--profile", profile, "--region", REGION], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  deployment = JSON.parse(out);
} catch (e) {
  console.error(`Could not read the Lightsail deployment: ${String((e && e.stderr) || (e && e.message) || e).replace(/\s+/g, " ").slice(0, 240)}`);
  console.error("If the session expired, run: aws login --profile " + profile);
  process.exit(2);
}

const app = deployment && deployment.containers && deployment.containers.app;
if (!app) { console.error("The deployment has no container named \"app\"."); process.exit(2); }
const env = app.environment || {};
const result = evaluateEnv(env);

if (asJson) {
  console.log(JSON.stringify({ version: deployment.version, state: deployment.state, createdAt: deployment.createdAt, image: String(app.image || "").replace(/^.*\//, ""), ...result }, null, 2));
} else {
  console.log(`Lightsail service ${SERVICE}: deployment version ${deployment.version} (${deployment.state}), created ${deployment.createdAt}`);
  console.log(`image: ${String(app.image || "").replace(/^.*\//, "")}   |   ${Object.keys(env).length} environment variables set (names only below)\n`);
  for (const r of result.rows) console.log(`${r.ok ? "OK  " : "FIX "} ${r.name.padEnd(32)} ${r.state.padEnd(7)} ${r.shown !== undefined ? "= " + r.shown : ""}${r.ok ? "" : `   expected: ${r.expect}`}`);
  console.log(result.ok ? "\nREADY: the backend environment matches the launch configuration." : `\nNOT READY: ${result.failing.length} item(s) to set or fix: ${result.failing.join(", ")}`);
}
process.exit(result.ok ? 0 : 1);
