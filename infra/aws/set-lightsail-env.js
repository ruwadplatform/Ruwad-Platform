#!/usr/bin/env node
// Changes runtime settings on the `ruwad-backend` Lightsail service without touching the image: it copies the current deployment, applies
// your changes, and creates a new deployment (Lightsail keeps serving the old one until the new one is healthy).
//
//   node infra/aws/set-lightsail-env.js [--profile ruwad] [--dry-run] KEY=VALUE ... [--unset KEY ...]
//
// Values are never printed — only the NAMES that change — so it is safe to run with secrets. Needs the AWS CLI and a logged-in profile
// (`aws login --profile ruwad`). Roll back a setting by running it again with the old value (or --unset).
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SERVICE = "ruwad-backend";
const REGION = "ap-southeast-2";
const AWS = process.env.AWS_CLI || (process.platform === "win32" ? "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe" : "aws");

const args = process.argv.slice(2);
let profile = "ruwad";
let dryRun = false;
const set = {};
const unset = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--profile") profile = args[++i];
  else if (a === "--dry-run") dryRun = true;
  else if (a === "--unset") unset.push(args[++i]);
  else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(a)) set[a.slice(0, a.indexOf("="))] = a.slice(a.indexOf("=") + 1);
  else { console.error(`Unrecognised argument: ${a.split("=")[0]}`); process.exit(2); }
}
if (!Object.keys(set).length && !unset.length) { console.error("Nothing to change. Pass KEY=VALUE and/or --unset KEY."); process.exit(2); }

const aws = (cmd) => execFileSync(AWS, [...cmd, "--profile", profile, "--region", REGION], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const fail = (what, e) => { console.error(`${what}: ${String((e && e.stderr) || (e && e.message) || e).replace(/\s+/g, " ").slice(0, 300)}`); process.exit(1); };

let current;
try { current = JSON.parse(aws(["lightsail", "get-container-service-deployments", "--service-name", SERVICE, "--query", "deployments[0]", "--output", "json"])); }
catch (e) { fail("Could not read the current deployment", e); }

const app = current.containers && current.containers.app;
if (!app || !current.publicEndpoint) { console.error("Unexpected deployment shape (no `app` container or public endpoint)."); process.exit(1); }

const environment = { ...(app.environment || {}) };
const changed = [];
for (const [k, v] of Object.entries(set)) { if (environment[k] !== v) changed.push(`${k} ${k in environment ? "updated" : "added"}`); environment[k] = v; }
for (const k of unset) { if (k in environment) { delete environment[k]; changed.push(`${k} removed`); } }
if (!changed.length) { console.log("Already up to date — nothing to deploy."); process.exit(0); }
console.log(`Current deployment: version ${current.version} (${current.state}), image ${app.image}`);
console.log("Changes:", changed.join(", "));
if (dryRun) { console.log("Dry run — nothing deployed."); process.exit(0); }

const ep = current.publicEndpoint;
const containers = { app: { image: app.image, environment, ports: app.ports || { [ep.containerPort]: "HTTP" } } };
const endpoint = { containerName: ep.containerName, containerPort: ep.containerPort, healthCheck: ep.healthCheck };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lightsail-env-"));
const cf = path.join(dir, "containers.json");
const ef = path.join(dir, "endpoint.json");
try {
  fs.writeFileSync(cf, JSON.stringify(containers), { mode: 0o600 });
  fs.writeFileSync(ef, JSON.stringify(endpoint), { mode: 0o600 });
  const url = (p) => "file://" + p.replace(/\\/g, "/");
  const version = aws(["lightsail", "create-container-service-deployment", "--service-name", SERVICE, "--containers", url(cf), "--public-endpoint", url(ef), "--query", "containerService.nextDeployment.version", "--output", "text"]).trim();
  console.log(`Created deployment version ${version}. Watch it with: aws lightsail get-container-service-deployments --service-name ${SERVICE} --profile ${profile} --region ${REGION} --query "deployments[0].[version,state]" --output text`);
} catch (e) {
  fail("Creating the deployment failed", e);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
