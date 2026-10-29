#!/usr/bin/env node
/**
 * Rolls the Lightsail backend back to the exact configuration (image, environment, ports, command, health check) of an earlier deployment version.
 * Lightsail only ever moves forward (a rollback is a NEW deployment that copies an old one), so this is the precise, repeatable form of
 * "deploy the previous version".
 *
 *   plan  <version>   READ ONLY. Shows the target's image and which variable NAMES would be added, removed or changed compared with what runs now.
 *   apply <version>   PRODUCTION CHANGE. Creates a deployment from the target's configuration, waits for ACTIVE and /api/health.
 *                     Requires LIGHTSAIL_ROLLBACK_CONFIRM="ROLLBACK-LIGHTSAIL ruwad-backend TO-VERSION-<version>".
 *
 * Typical use for the Advisory launch: the recorded rollback target is version 10 (image api.8, the environment WITHOUT the Advisory variables and with
 * APP_URL as it was). Rolling back to it switches the Advisory API off (ADVISORY_ENABLED disappears) and restores the old image. No database row is touched;
 * the Advisory tables stay, and the old code ignores them.
 *
 * Values are never printed: names only, and values are compared by hash. Needs `aws login --profile ruwad`. The target is refused if it is a placeholder
 * (nginx) deployment.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PRODUCTION_BACKEND } = require("./launch-config");

const SERVICE = "ruwad-backend";
const REGION = "ap-southeast-2";
const AWS = process.env.AWS_CLI || (process.platform === "win32" ? "C:\\Program Files\\Amazon\\AWSCLIV2\\aws.exe" : "aws");
const [mode, versionArg] = process.argv.slice(2);
const profile = process.argv.includes("--profile") ? process.argv[process.argv.indexOf("--profile") + 1] : "ruwad";
const die = (m, c = 2) => { console.error(m); process.exit(c); };
if (!["plan", "apply"].includes(mode) || !/^\d+$/.test(versionArg || "")) die("Usage: lightsail-rollback.js plan|apply <version number> [--profile ruwad]");

const aws = (args) => execFileSync(AWS, [...args, "--profile", profile, "--region", REGION], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const clean = (e) => String((e && e.stderr) || (e && e.message) || e).replace(/\s+/g, " ").slice(0, 240);
const h = (v) => crypto.createHash("sha256").update(String(v)).digest("hex").slice(0, 12);

(async () => {
  let all;
  try { all = JSON.parse(aws(["lightsail", "get-container-service-deployments", "--service-name", SERVICE, "--output", "json"])).deployments; }
  catch (e) { die("Could not read Lightsail (run: aws login --profile " + profile + "): " + clean(e)); }
  const cur = all[0];
  const target = all.find((d) => String(d.version) === versionArg);
  if (!target) die(`No deployment version ${versionArg} exists. Versions: ${all.map((d) => d.version).join(", ")}`);
  const tapp = target.containers && target.containers.app;
  if (!tapp || /nginx/.test(String(tapp.image))) die("Refusing: that version is a placeholder deployment, not a backend release.", 1);
  const capp = cur.containers.app;
  console.log(`current: version ${cur.version} (${cur.state}), image ${String(capp.image).replace(/^.*\//, "")}`);
  console.log(`target : version ${target.version} (${target.state}), image ${String(tapp.image).replace(/^.*\//, "")}`);
  const ce = capp.environment || {}, te = tapp.environment || {};
  const removed = Object.keys(ce).filter((k) => !(k in te));
  const added = Object.keys(te).filter((k) => !(k in ce));
  const changed = Object.keys(te).filter((k) => k in ce && h(ce[k]) !== h(te[k]));
  console.log(`variables: current ${Object.keys(ce).length}, target ${Object.keys(te).length}`);
  console.log(`rolling back would REMOVE: ${removed.join(", ") || "none"}`);
  console.log(`rolling back would ADD   : ${added.join(", ") || "none"}`);
  console.log(`rolling back would CHANGE: ${changed.join(", ") || "none"}`);
  if (String(cur.version) === versionArg) return void console.log("\nThe target is the version that is already running: nothing to do.");
  if (mode === "plan") return void console.log("\nPLAN ONLY: nothing was deployed.");

  const phrase = `ROLLBACK-LIGHTSAIL ${SERVICE} TO-VERSION-${versionArg}`;
  if (process.env.LIGHTSAIL_ROLLBACK_CONFIRM !== phrase) die(`\napply refused: set LIGHTSAIL_ROLLBACK_CONFIRM to exactly: ${phrase}`);
  const ep = target.publicEndpoint;
  const containers = { app: { image: tapp.image, environment: te, ports: tapp.ports || { [ep.containerPort]: "HTTP" }, ...(Array.isArray(tapp.command) && tapp.command.length ? { command: tapp.command } : {}) } };
  const endpoint = { containerName: ep.containerName, containerPort: ep.containerPort, healthCheck: ep.healthCheck };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lightsail-rollback-"));
  let next;
  try {
    const cf = path.join(dir, "containers.json"), ef = path.join(dir, "endpoint.json");
    fs.writeFileSync(cf, JSON.stringify(containers), { mode: 0o600 });
    fs.writeFileSync(ef, JSON.stringify(endpoint), { mode: 0o600 });
    const url = (p) => "file://" + p.replace(/\\/g, "/");
    next = aws(["lightsail", "create-container-service-deployment", "--service-name", SERVICE, "--containers", url(cf), "--public-endpoint", url(ef), "--query", "containerService.nextDeployment.version", "--output", "text"]).trim();
  } catch (e) { die("Creating the rollback deployment failed: " + clean(e), 1); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(`Created deployment version ${next} from version ${versionArg}; waiting for ACTIVE...`);
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const s = JSON.parse(aws(["lightsail", "get-container-service-deployments", "--service-name", SERVICE, "--query", `deployments[?version==\`${next}\`]|[0]`, "--output", "json"]));
    console.log(`  version ${next}: ${s.state}`);
    if (s.state === "ACTIVE") break;
    if (s.state === "FAILED") die(`The rollback deployment FAILED; Lightsail keeps serving version ${cur.version}.`, 1);
    if (i === 59) die("The rollback deployment did not become ACTIVE within 10 minutes; check the Lightsail console.", 1);
  }
  const code = await fetch(PRODUCTION_BACKEND + "/api/health", { signal: AbortSignal.timeout(20000) }).then((r) => r.status).catch(() => 0);
  console.log(`health after the rollback: HTTP ${code}`);
  process.exit(code === 200 ? 0 : 1);
})().catch((e) => die("failed: " + clean(e), 1));
