/**
 * Helper for the supervised LIVE test of Daily's webhook delivery (see docs/advisory-daily-webhook-live-test.md). Nothing here runs by itself and
 * nothing is registered until you run `register` yourself, with the confirmation below.
 *
 *   node scripts/dev/daily-webhook-live.js relay                 start the single-route relay on 127.0.0.1:4100 (put the tunnel on THIS port)
 *   node scripts/dev/daily-webhook-live.js list                  read-only: the webhooks registered on the Daily account
 *   CONFIRM_DAILY_WEBHOOK=register node scripts/dev/daily-webhook-live.js register https://<tunnel-host>/api/advisory/webhooks/daily
 *   CONFIRM_DAILY_WEBHOOK=delete   node scripts/dev/daily-webhook-live.js delete <webhook-uuid>
 *
 * Safety, by construction:
 *   - the relay forwards ONE route (POST /api/advisory/webhooks/daily) to the local backend and nothing else, so a public tunnel never exposes the rest of
 *     the local API; it passes only the headers the signature needs, never logs a header or body, and switches itself off after LOCAL_RELAY_MINUTES (30);
 *   - `register` only accepts an https URL on a known tunnel host (or the one host in LOCAL_WEBHOOK_PUBLIC_HOST), ending in the webhook path, never a
 *     production host; it subscribes to participant.joined and participant.left ONLY (never recordings); it needs LOCAL_DAILY_WEBHOOK_SECRET (the same
 *     base64 secret the local backend was started with) and refuses to run if ANY webhook already exists on the account;
 *   - `delete` only removes a webhook whose URL is on a tunnel host, so it can never remove a production webhook;
 *   - the Daily key is read from backend/.env inside this process and is never printed; the webhook secret is never printed.
 */
const http = require("http");
const path = require("path");
const { readEnvFileValue } = require("./local-env");
const { isProductionHost } = require("./local-db-guard");

const WEBHOOK_PATH = "/api/advisory/webhooks/daily";
const DAILY_API = "https://api.daily.co/v1";
const EVENT_TYPES = ["participant.joined", "participant.left"];
/** Hosts a temporary tunnel gets. Anything else must be named explicitly in LOCAL_WEBHOOK_PUBLIC_HOST. */
const TUNNEL_HOSTS = [/(^|\.)trycloudflare\.com$/i, /(^|\.)ngrok-free\.(app|dev)$/i, /(^|\.)ngrok\.(app|io|dev)$/i, /(^|\.)loca\.lt$/i];
const MAX_BODY = 64 * 1024;

/** Whether `host` is an acceptable temporary public address for the webhook. */
function isTunnelHost(host, env = process.env) {
  if (!host || isProductionHost(host)) return false;
  return TUNNEL_HOSTS.some((re) => re.test(host)) || (!!env.LOCAL_WEBHOOK_PUBLIC_HOST && host.toLowerCase() === env.LOCAL_WEBHOOK_PUBLIC_HOST.toLowerCase());
}

/** Returns the URL if it may be registered; throws (without echoing credentials or query strings) otherwise. */
function assertRegistrableUrl(value, env = process.env) {
  let u;
  try { u = new URL(value); } catch { throw new Error("The URL could not be parsed."); }
  if (u.protocol !== "https:") throw new Error("The webhook URL must be https.");
  if (u.username || u.password || u.search || u.hash) throw new Error("The webhook URL must have no credentials, query or fragment.");
  if (u.pathname !== WEBHOOK_PATH) throw new Error(`The webhook URL must end with ${WEBHOOK_PATH}.`);
  if (isProductionHost(u.hostname)) throw new Error("Refusing: that is a production host.");
  if (!isTunnelHost(u.hostname, env)) throw new Error("Refusing: that host is not a known temporary tunnel host (set LOCAL_WEBHOOK_PUBLIC_HOST to allow exactly one other host).");
  return u.toString();
}

/** The one request the relay lets through. */
function isRelayRequestAllowed(method, url) {
  return method === "POST" && (url || "").split("?")[0] === WEBHOOK_PATH && !(url || "").includes("?");
}

/** The webhook secret, as the base64 string Daily's `hmac` and the backend's DAILY_WEBHOOK_SECRET use. At least 32 bytes. */
function readWebhookSecret(env = process.env) {
  const v = (env.LOCAL_DAILY_WEBHOOK_SECRET || "").trim();
  const bytes = /^[A-Za-z0-9+/]+={0,2}$/.test(v) ? Buffer.from(v, "base64") : Buffer.alloc(0);
  if (bytes.length < 32) throw new Error("LOCAL_DAILY_WEBHOOK_SECRET must be a base64 string of at least 32 bytes (for example: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"). Start the backend with the SAME value.");
  return v;
}

// ---- relay -----------------------------------------------------------------------------------------------------------------------------------

function startRelay({ port = Number(process.env.LOCAL_RELAY_PORT || 4100), upstream = `http://127.0.0.1:${process.env.PORT || 4000}`, minutes = Number(process.env.LOCAL_RELAY_MINUTES || 30) } = {}) {
  const server = http.createServer((req, res) => {
    if (!isRelayRequestAllowed(req.method, req.url)) { res.writeHead(404).end(); console.log(`[relay] ${req.method} (not the webhook route) -> 404`); return; }
    const chunks = []; let size = 0; let aborted = false;
    req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { aborted = true; res.writeHead(413).end(); req.destroy(); } else chunks.push(c); });
    req.on("end", () => {
      if (aborted) return;
      const body = Buffer.concat(chunks); // forwarded byte for byte: the signature is over the exact bytes
      const headers = { "content-type": req.headers["content-type"] || "application/json", "content-length": String(body.length) };
      for (const h of ["x-webhook-timestamp", "x-webhook-signature", "x-forwarded-for"]) if (req.headers[h]) headers[h] = req.headers[h];
      const out = http.request(upstream + WEBHOOK_PATH, { method: "POST", headers, timeout: 7000 }, (r) => {
        const parts = []; r.on("data", (c) => parts.push(c)); r.on("end", () => { res.writeHead(r.statusCode || 502, { "content-type": "application/json" }).end(Buffer.concat(parts)); console.log(`[relay] POST webhook -> ${r.statusCode} (${body.length} bytes in)`); });
      });
      out.on("timeout", () => out.destroy(new Error("upstream timeout")));
      out.on("error", () => { res.writeHead(502).end(); console.log("[relay] POST webhook -> 502 (the local backend did not answer)"); });
      out.end(body);
    });
  });
  server.listen(port, "127.0.0.1", () => console.log(`[relay] listening on 127.0.0.1:${port}, forwarding ONLY POST ${WEBHOOK_PATH} to ${upstream}; switches itself off in ${minutes} minutes`));
  const timer = setTimeout(() => { console.log("[relay] time is up: shutting down"); server.close(); process.exit(0); }, minutes * 60_000);
  timer.unref?.();
  return server;
}

// ---- Daily API (read the key in-process; never print it) -----------------------------------------------------------------------------------------

function dailyKey() {
  const key = readEnvFileValue(path.join(__dirname, "..", "..", ".env"), "DAILY_API_KEY");
  if (!key) throw new Error("DAILY_API_KEY not found in backend/.env.");
  return key;
}

async function daily(method, p, body) {
  const res = await fetch(DAILY_API + p, { method, headers: { authorization: `Bearer ${dailyKey()}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  let json = null; try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

const listOf = (json) => (Array.isArray(json) ? json : json?.data ?? json?.webhooks ?? []);
const show = (h) => { let host = "?", p = ""; try { const u = new URL(h.url); host = u.host; p = u.pathname; } catch { /* none */ } return { id: h.uuid, host, path: p, state: h.state, eventTypes: h.eventTypes, retryType: h.retryType, failedCount: h.failedCount, lastMomentPushed: h.lastMomentPushed }; };

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "relay") return void startRelay();
  if (cmd === "list") {
    const r = await daily("GET", "/webhooks");
    if (r.status !== 200) throw new Error(`Daily answered ${r.status}`);
    const items = listOf(r.json);
    console.log(`${items.length} webhook(s) on the Daily account`);
    for (const h of items) console.log(show(h));
    return;
  }
  if (cmd === "register") {
    if (process.env.CONFIRM_DAILY_WEBHOOK !== "register") throw new Error("Not registering: set CONFIRM_DAILY_WEBHOOK=register to confirm.");
    const url = assertRegistrableUrl(arg);
    const hmac = readWebhookSecret();
    const existing = listOf((await daily("GET", "/webhooks")).json);
    if (existing.length) throw new Error(`Refusing: ${existing.length} webhook(s) already exist on the account. Run \`list\`, and delete a temporary one with \`delete\` first.`);
    const r = await daily("POST", "/webhooks", { url, eventTypes: EVENT_TYPES, hmac, retryType: "exponential" });
    if (r.status !== 200) throw new Error(`Daily refused to create the webhook (${r.status}${r.json?.info ? ": " + r.json.info : ""}). Is the local backend, the relay and the tunnel running with the same secret?`);
    console.log("registered:", show(r.json));
    console.log("REMEMBER: remove it when the test is over: CONFIRM_DAILY_WEBHOOK=delete node scripts/dev/daily-webhook-live.js delete", r.json.uuid);
    return;
  }
  if (cmd === "delete") {
    if (process.env.CONFIRM_DAILY_WEBHOOK !== "delete") throw new Error("Not deleting: set CONFIRM_DAILY_WEBHOOK=delete to confirm.");
    if (!arg) throw new Error("Give the webhook uuid (see `list`).");
    const target = listOf((await daily("GET", "/webhooks")).json).find((h) => h.uuid === arg);
    if (!target) throw new Error("No webhook with that id on this account.");
    let host = ""; try { host = new URL(target.url).hostname; } catch { /* none */ }
    if (!isTunnelHost(host)) throw new Error("Refusing: that webhook is not on a temporary tunnel host, so this helper will not delete it.");
    const r = await daily("DELETE", `/webhooks/${encodeURIComponent(arg)}`);
    if (r.status !== 200) throw new Error(`Daily answered ${r.status} when deleting.`);
    console.log("deleted. Webhooks now on the account:", listOf((await daily("GET", "/webhooks")).json).length);
    return;
  }
  console.error("Usage: relay | list | register <https-url> | delete <uuid>   (see the header of this file)");
  process.exit(2);
}

module.exports = { WEBHOOK_PATH, EVENT_TYPES, isTunnelHost, assertRegistrableUrl, isRelayRequestAllowed, readWebhookSecret, startRelay };

if (require.main === module) main().catch((e) => { console.error(`[daily-webhook-live] ${String(e.message).replace(/Bearer [A-Za-z0-9._-]+/g, "<hidden>")}`); process.exit(1); });
