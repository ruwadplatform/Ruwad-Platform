#!/usr/bin/env node
/**
 * Sets, reads and restores the Daily.co DOMAIN-level media region (`geo`) for the RUWAD domain. A Daily account setting, not application code.
 *
 *   show                        READ ONLY. Prints the domain, the current `geo`, the recording / transcription settings, the number of rooms and webhooks,
 *                               and the exact request that `set` would send. Changes nothing.
 *   set <region>                PRODUCTION CHANGE (Daily account). Region must be one of Daily's ten documented values. Requires
 *                               DAILY_GEO_CONFIRM="SET-DAILY-GEO <region> ON ruwadstudio".
 *   restore                     PRODUCTION CHANGE (Daily account). Sends geo: null to return to the original (null = the server is chosen by DNS from the
 *                               first participant's location). Requires DAILY_GEO_CONFIRM="RESTORE-DAILY-GEO ON ruwadstudio".
 *
 * The documented requests (docs.daily.co, Get / Set domain configuration): GET https://api.daily.co/v1/ and POST https://api.daily.co/v1/ with the JSON body
 * {"properties": {"geo": "<region>"}}, bearer authentication. Daily does NOT document: whether the setting reaches rooms that already exist, how a property is
 * unset, or how it ranks against a room-level geo. This tool therefore (a) refuses to change anything if rooms already exist, (b) reads the whole domain
 * configuration back after the change and requires that ONLY `geo` changed, and (c) reports honestly if Daily does not accept null on `restore`.
 *
 * Environment (this process only; never printed): DAILY_API_KEY, or DAILY_API_KEY_FILE (default ~/secure/daily-api-key.txt).
 * Optional: DAILY_GEO_ALLOW_EXISTING_ROOMS=yes (not recommended: the effect on existing rooms is undocumented).
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DAILY_API = "https://api.daily.co/v1";
const DOMAIN = "ruwadstudio";
const REGIONS = { "af-south-1": "Cape Town", "ap-northeast-2": "Seoul", "ap-southeast-1": "Singapore", "ap-southeast-2": "Sydney", "ap-south-1": "Mumbai", "eu-central-1": "Frankfurt", "eu-west-2": "London", "sa-east-1": "Sao Paulo", "us-east-1": "N. Virginia", "us-west-2": "Oregon" };
const WATCH = ["geo", "rtmp_geo", "transcription_geo", "enable_auto_recording", "intercom_auto_record", "enable_transcription", "enable_transcription_storage", "hipaa", "max_webhook_count", "force_private_rooms"];

const [cmd, regionArg] = process.argv.slice(2);
const die = (m, c = 2) => { console.error(m); process.exit(c); };
if (!["show", "set", "restore"].includes(cmd || "")) die("Usage: daily-domain-geo.js show | set <region> | restore");

// ---- everything that can be refused is refused BEFORE any network call -------------------------------------------------------------------------
if (cmd === "set") {
  if (!regionArg || !(regionArg in REGIONS)) die(`set needs one of Daily's documented regions: ${Object.keys(REGIONS).join(", ")}`);
  const phrase = `SET-DAILY-GEO ${regionArg} ON ${DOMAIN}`;
  if (process.env.DAILY_GEO_CONFIRM !== phrase) die(`Refusing: set DAILY_GEO_CONFIRM to exactly: ${phrase}`);
}
if (cmd === "restore" && process.env.DAILY_GEO_CONFIRM !== `RESTORE-DAILY-GEO ON ${DOMAIN}`) die(`Refusing: set DAILY_GEO_CONFIRM to exactly: RESTORE-DAILY-GEO ON ${DOMAIN}`);

const keyFile = process.env.DAILY_API_KEY_FILE || path.join(os.homedir(), "secure", "daily-api-key.txt");
const key = (process.env.DAILY_API_KEY || "").trim() || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, "utf8").trim() : "");
if (!key) die("The Daily API key is missing (set DAILY_API_KEY, or put it in DAILY_API_KEY_FILE / ~/secure/daily-api-key.txt).");

const call = async (method, p, body) => {
  const r = await fetch(DAILY_API + p, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  let json = null; try { json = await r.json(); } catch { /* none */ }
  return { status: r.status, json };
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function snapshot() {
  const d = await call("GET", "/");
  if (d.status !== 200 || d.json?.domain_name !== DOMAIN) die(`Refusing: the key does not belong to the domain "${DOMAIN}" (HTTP ${d.status}${d.json?.domain_name ? ", domain " + d.json.domain_name : ""}).`, 1);
  const rooms = await call("GET", "/rooms?limit=1");
  const hooks = await call("GET", "/webhooks");
  const list = Array.isArray(hooks.json) ? hooks.json : hooks.json?.data ?? [];
  return { config: d.json.config || {}, rooms: rooms.json?.total_count ?? (rooms.json?.data || []).length, webhooks: list.length };
}
const watched = (c) => Object.fromEntries(WATCH.map((n) => [n, c[n] === undefined ? "(absent)" : c[n]]));

(async () => {
  const before = await snapshot();
  console.log(`domain ${DOMAIN}: rooms ${before.rooms}, webhooks ${before.webhooks}`);
  for (const [n, v] of Object.entries(watched(before.config))) console.log(`  ${n.padEnd(30)} ${JSON.stringify(v)}`);
  const recording = before.config.enable_auto_recording === null && before.config.intercom_auto_record === false && before.config.enable_transcription === null && before.config.enable_transcription_storage === false;
  console.log(`recording and transcription: ${recording ? "DISABLED by default at the domain" : "CHECK: a default is enabled"}`);

  if (cmd === "show") {
    console.log(`\nThe request that "set eu-central-1" would send:  POST ${DAILY_API}/   body {"properties":{"geo":"eu-central-1"}}   (bearer authentication; nothing was sent now)`);
    return void console.log("SHOW ONLY: nothing was changed.");
  }

  const want = cmd === "set" ? regionArg : null;
  if (same(before.config.geo, want)) return void console.log(`\nAlready ${want === null ? "unset (null)" : "set to " + want}: nothing to do.`);
  if (cmd === "set" && before.config.geo !== null) die(`Refusing: geo is already set to "${before.config.geo}", not null. Look at it first; this tool only moves null to a region.`, 1);
  if (cmd === "set" && !recording) die("Refusing: a recording or transcription default is enabled at the domain; resolve that first.", 1);
  if (before.rooms > 0 && process.env.DAILY_GEO_ALLOW_EXISTING_ROOMS !== "yes") die(`Refusing: ${before.rooms} room(s) already exist and Daily does not document whether the setting reaches existing rooms. Set DAILY_GEO_ALLOW_EXISTING_ROOMS=yes only deliberately.`, 1);

  const r = await call("POST", "/", { properties: { geo: want } });
  console.log(`\nPOST / {"properties":{"geo":${JSON.stringify(want)}}} -> HTTP ${r.status}`);
  if (r.status >= 300) die(`Daily refused the change: ${String(r.json?.info || r.json?.error || "").slice(0, 200)}`, 1);

  const after = await snapshot();
  const geoOk = same(after.config.geo, want);
  const others = Object.keys({ ...before.config, ...after.config }).filter((n) => n !== "geo" && !same(before.config[n], after.config[n]));
  console.log(`read-back geo: ${JSON.stringify(after.config.geo)} ${geoOk ? "(as requested)" : "(NOT as requested)"}`);
  console.log(`other settings changed by this request: ${others.length ? others.join(", ") : "none"}`);
  console.log(`rooms ${after.rooms}, webhooks ${after.webhooks}`);
  if (!geoOk && cmd === "restore") die("Daily did not accept null for geo (how to unset a property is not documented). Restore it in the Daily dashboard's domain settings, or ask help@daily.co to clear it.", 1);
  if (!geoOk || others.length) die("PROBLEM: the read-back does not match. Stop; do not continue the launch. Use `restore` or the dashboard.", 1);
  console.log(cmd === "set" ? `\nDONE: media region for ${DOMAIN} is ${want} (${REGIONS[want]}). Rollback: DAILY_GEO_CONFIRM="RESTORE-DAILY-GEO ON ${DOMAIN}"; node backend/scripts/ops/daily-domain-geo.js restore` : "\nDONE: geo is back to null (the original).");
})().catch((e) => die("failed: " + String(e.message).slice(0, 200), 1));
