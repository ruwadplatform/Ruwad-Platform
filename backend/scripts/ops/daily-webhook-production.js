#!/usr/bin/env node
/**
 * Registers (and removes) the PRODUCTION Daily.co webhook for Advisory attendance, with guards. Nothing here runs automatically.
 *
 *   gen-secret <file>   writes a new random webhook secret to <file> (refuses to overwrite; never prints it)
 *   list                READ ONLY: the account's webhooks and rooms (host, path, state; never the secret or the key)
 *   probe               POSTs one UNSIGNED, empty request to the production endpoint. It can change nothing: 401 = ready (Advisory on, secret
 *                       configured, signatures enforced), 404 = not ready (flag off or no secret), anything else = not ready
 *   register            creates the webhook. Requires every guard below.
 *   delete <uuid>       removes one webhook (the rollback)
 *
 * Environment (read from THIS process only; never from backend/.env, never printed):
 *   DAILY_API_KEY             the production Daily API key
 *   DAILY_WEBHOOK_SECRET      base64, at least 32 bytes: the SAME value that is set on the backend as DAILY_WEBHOOK_SECRET
 *   WEBHOOK_URL               optional; default https://<production backend>/api/advisory/webhooks/daily (must be https, never local or a tunnel)
 *   DAILY_WEBHOOK_CONFIRM     must be exactly "REGISTER <host>" (register) or "DELETE <uuid>" (delete)
 *
 * `register` refuses unless: the key and secret are present and well formed; the confirmation phrase matches; the probe says the endpoint is
 * READY (so Daily's creation-time test ping, which needs an HTTP 200 within 8 seconds, will be accepted); and no webhook already points at that URL.
 * It then creates ONE webhook for participant.joined and participant.left with retryType "exponential" (the default circuit breaker would mark
 * the webhook FAILED after three failures) and re-reads the account to confirm its state is ACTIVE.
 */
const fs = require("node:fs");
const crypto = require("node:crypto");
const { PRODUCTION_BACKEND, WEBHOOK_PATH, isBase64Secret, isHttpsPublic } = require("./launch-config");

const DAILY_API = "https://api.daily.co/v1";
const EVENT_TYPES = ["participant.joined", "participant.left"];
const BAD_HOSTS = /(^|\.)(trycloudflare\.com|ngrok[a-z.-]*|loca\.lt|localhost)$/i;
const url = (process.env.WEBHOOK_URL || PRODUCTION_BACKEND + WEBHOOK_PATH).trim();

const die = (msg, code = 2) => { console.error(msg); process.exit(code); };
const key = () => { const k = (process.env.DAILY_API_KEY || "").trim(); if (!k) die("DAILY_API_KEY is not set in this process."); return k; };
const daily = async (method, p, body) => {
  const r = await fetch(DAILY_API + p, { method, headers: { authorization: `Bearer ${key()}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  let json = null; try { json = await r.json(); } catch { /* no body */ }
  return { status: r.status, json };
};
const listOf = (j) => (Array.isArray(j) ? j : j?.data ?? j?.webhooks ?? []);
const show = (h) => { let host = "?", path = ""; try { const u = new URL(h.url); host = u.host; path = u.pathname; } catch { /* none */ } return `${h.uuid}  ${host}${path}  state=${h.state}  events=${(h.eventTypes || []).join(",")}  retry=${h.retryType}`; };

function checkUrl() {
  let u; try { u = new URL(url); } catch { die("WEBHOOK_URL is not a valid URL."); }
  if (!isHttpsPublic(url) || BAD_HOSTS.test(u.hostname)) die("The webhook URL must be a public https address (no localhost, no tunnel).");
  if (u.pathname !== WEBHOOK_PATH || u.search) die(`The webhook URL must end exactly in ${WEBHOOK_PATH}`);
  return u;
}

async function probe() {
  const u = checkUrl();
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: AbortSignal.timeout(15000) });
  const ready = r.status === 401;
  console.log(`probe ${u.host}${u.pathname}: HTTP ${r.status} -> ${ready ? "READY (signatures are enforced)" : r.status === 404 ? "NOT READY (404: Advisory is off or DAILY_WEBHOOK_SECRET is not set)" : "NOT READY (unexpected answer)"}`);
  return ready;
}

(async () => {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "gen-secret") {
    if (!arg) die("Usage: gen-secret <file>");
    if (fs.existsSync(arg)) die("Refusing to overwrite an existing file.");
    fs.writeFileSync(arg, crypto.randomBytes(32).toString("base64"), { flag: "wx", mode: 0o600 });
    return void console.log(`wrote a new 32-byte secret to ${arg} (not shown). Keep it in the password manager; the same value goes to the backend and to this script.`);
  }
  if (cmd === "list") {
    const w = await daily("GET", "/webhooks"); const r = await daily("GET", "/rooms");
    console.log(`GET /webhooks -> HTTP ${w.status}; webhooks: ${listOf(w.json).length}`); listOf(w.json).forEach((h) => console.log("  " + show(h)));
    console.log(`GET /rooms -> HTTP ${r.status}; rooms: ${(r.json?.data ?? []).length}${(r.json?.data ?? []).length ? " (names: " + (r.json.data).map((x) => String(x.name).slice(0, 8) + "...").join(", ") + ")" : ""}`);
    return;
  }
  if (cmd === "probe") return void process.exit((await probe()) ? 0 : 1);
  if (cmd === "register") {
    const u = checkUrl();
    const secret = (process.env.DAILY_WEBHOOK_SECRET || "").trim();
    if (!isBase64Secret(secret)) die("DAILY_WEBHOOK_SECRET must be a base64 string of at least 32 bytes (see gen-secret).");
    if (process.env.DAILY_WEBHOOK_CONFIRM !== `REGISTER ${u.host}`) die(`Refusing: set DAILY_WEBHOOK_CONFIRM to exactly: REGISTER ${u.host}`);
    if (!(await probe())) die("Refusing: the endpoint is not ready. Deploy the backend with Advisory enabled and the secret set first.", 1);
    const existing = listOf((await daily("GET", "/webhooks")).json);
    const same = existing.filter((h) => { try { return new URL(h.url).href === u.href; } catch { return false; } });
    if (same.length) die(`Refusing: a webhook already points at this URL (${same.map((h) => h.uuid).join(", ")}). Delete it first or leave it.`, 1);
    if (existing.length) console.log(`note: the account already has ${existing.length} other webhook(s); they are left alone.`);
    const r = await daily("POST", "/webhooks", { url, eventTypes: EVENT_TYPES, hmac: secret, retryType: "exponential" });
    if (r.status >= 300) die(`Daily refused the registration (HTTP ${r.status}): ${String(r.json?.info || r.json?.error || "").slice(0, 200)}. If it says the endpoint did not answer the test ping, the backend is not ready.`, 1);
    const created = listOf((await daily("GET", "/webhooks")).json).find((h) => h.uuid === r.json?.uuid);
    console.log("registered:", created ? show(created) : r.json?.uuid);
    console.log(created && created.state === "ACTIVE" ? "OK: the webhook is ACTIVE." : "WARNING: the webhook is not ACTIVE; look at it before going on.");
    console.log("Rollback: DAILY_WEBHOOK_CONFIRM=\"DELETE " + r.json?.uuid + "\" node backend/scripts/ops/daily-webhook-production.js delete " + r.json?.uuid);
    return void process.exit(created && created.state === "ACTIVE" ? 0 : 1);
  }
  if (cmd === "delete") {
    if (!arg) die("Usage: delete <uuid>");
    if (process.env.DAILY_WEBHOOK_CONFIRM !== `DELETE ${arg}`) die(`Refusing: set DAILY_WEBHOOK_CONFIRM to exactly: DELETE ${arg}`);
    const target = listOf((await daily("GET", "/webhooks")).json).find((h) => h.uuid === arg);
    if (!target) die("No webhook with that uuid on this account.", 1);
    const r = await daily("DELETE", `/webhooks/${encodeURIComponent(arg)}`);
    console.log(`DELETE -> HTTP ${r.status}. Webhooks now on the account: ${listOf((await daily("GET", "/webhooks")).json).length}`);
    return;
  }
  die("Usage: gen-secret <file> | list | probe | register | delete <uuid>   (see the header of this file)");
})().catch((e) => die("failed: " + String(e.message).slice(0, 200), 1));
