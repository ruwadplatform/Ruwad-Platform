/**
 * What the production Advisory launch needs, written once so the audit scripts and the runbook agree. Pure data and pure functions: nothing here
 * touches the network, AWS, Daily, Resend or any database.
 *
 * Used by lightsail-env-audit.js (read-only) and tested by launch-config.test.js (node --test).
 */

const PRODUCTION_SITE = "https://www.ruwad.studio";
const PRODUCTION_BACKEND = "https://ruwad-backend.vaykv052p845y.ap-southeast-2.cs.amazonlightsail.com";
const WEBHOOK_PATH = "/api/advisory/webhooks/daily";

/** A value is "secret" when it must never be printed, even by an audit. Only names and set / not set are shown for these. */
const SECRET = /(KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL|ENCRYPTION)/i;

const isSet = (v) => typeof v === "string" && v.trim() !== "";
const isBase64Secret = (v) => isSet(v) && /^[A-Za-z0-9+/=]+$/.test(v.trim()) && Buffer.from(v.trim(), "base64").length >= 32;
const sameOrigin = (a, b) => { try { return new URL(a).origin === new URL(b).origin; } catch { return false; } };
const isHttpsPublic = (v) => { try { const u = new URL(v); return u.protocol === "https:" && !/^(localhost|127\.|\[::1\])/.test(u.hostname); } catch { return false; } };

/** Each rule: what the backend's runtime environment must look like for the launch. `check` gets the value (or undefined) and the whole environment. */
const RULES = [
  { name: "ADVISORY_ENABLED", why: "the Advisory API (anything but exactly \"true\" means every Advisory route is a 404)", check: (v) => v === "true", expect: "true" },
  { name: "ADVISORY_VIDEO_PROVIDER", why: "real Daily rooms (anything else means simulated rooms)", check: (v) => v === "daily", expect: "daily" },
  { name: "DAILY_API_KEY", why: "creates and deletes Daily rooms and tokens", check: isSet, expect: "set (secret)" },
  { name: "DAILY_DOMAIN", why: "the Daily domain the rooms belong to", check: (v) => isSet(v) && /^[a-z0-9-]+$/i.test(v.trim()), expect: "the Daily domain name, e.g. ruwadstudio" },
  { name: "DAILY_WEBHOOK_SECRET", why: "verifies Daily's signature on attendance webhooks; the webhook route answers 404 without it", check: isBase64Secret, expect: "set (secret): base64 of at least 32 random bytes" },
  { name: "ADVISORY_EMAIL_MODE", why: "real notification emails (anything but exactly \"live\" is mock)", check: (v) => v === "live", expect: "live" },
  { name: "RESEND_API_KEY", why: "the email provider", check: isSet, expect: "set (secret)" },
  { name: "EMAIL_FROM", why: "a sender the email provider has verified", check: (v) => isSet(v) && /@/.test(v), expect: "a verified sender address" },
  { name: "ADMIN_NOTIFICATION_EMAIL", why: "where administrator notices go", check: isSet, expect: "set" },
  { name: "APP_URL", why: "links inside emails (defaults to http://localhost:5174 when unset)", check: (v) => isHttpsPublic(v) && v.replace(/\/+$/, "") === PRODUCTION_SITE, expect: PRODUCTION_SITE },
  // Deliberately NOT required to be the www address: it is already set and must stay as it is. Its first entry also feeds the Google Calendar redirect
  // (GOOGLE_REDIRECT_URI uses the same address), so changing it could break the existing calendar sign-in. Advisory needs no CORS change (browser calls go
  // through the site proxy). The rule only insists that it is set, public https, and still agrees with GOOGLE_REDIRECT_URI.
  { name: "FRONTEND_URL", why: "CORS list and the Google Calendar redirect origin: leave as it is (do NOT switch it to the www address)", check: (v, env) => isSet(v) && v.split(",").every((s) => isHttpsPublic(s.trim())) && (!isSet(env && env.GOOGLE_REDIRECT_URI) || sameOrigin(v.split(",")[0].trim(), env.GOOGLE_REDIRECT_URI)), expect: "set, https, unchanged (it must keep the same address as GOOGLE_REDIRECT_URI)" },
  { name: "ADVISORY_SCHEDULER_ENABLED", why: "request expiry, reminders and the Needs Review pass; enable on ONE backend only (Render is stopped)", check: (v) => v === "true", expect: "true" },
  { name: "NODE_ENV", why: "production mode (API docs are not served in production)", check: (v) => v === "production", expect: "production" },
  { name: "RUN_MIGRATIONS", why: "the container must never apply migrations at start; the one approved migration run is done by hand", check: (v) => v === "false", expect: "false" },
  // Must be absent (or, where noted, at the agreed value):
  { name: "ADVISORY_MIGRATIONS", why: "must NOT be on a running service (it is only for the one migration command)", check: (v) => !isSet(v), expect: "absent", forbidden: true },
  { name: "ADVISORY_BOOKINGS_ENABLED", why: "online consultation booking is not open yet: absent (or anything but \"true\") keeps every booking route answering 403 BOOKINGS_DISABLED", check: (v) => v !== "true", expect: "absent or not \"true\"", forbidden: true },
  { name: "ADVISORY_AUTOCOMPLETE_ENABLED", why: "automatic completion is not approved", check: (v) => v !== "true", expect: "absent or not \"true\"", forbidden: true },
  { name: "ADVISORY_MAX_PENDING_REQUESTS", why: "the agreed limit is the built-in 2", check: (v) => !isSet(v) || v.trim() === "2", expect: "absent (or 2)", forbidden: true },
  { name: "DAILY_API_BASE", why: "must be Daily's real API", check: (v) => !isSet(v) || /^https:\/\/api\.daily\.co\/v1\/?$/.test(v.trim()), expect: "absent", forbidden: true },
  { name: "ADVISORY_INTEGRATION", why: "a test-only switch", check: (v) => !isSet(v), expect: "absent", forbidden: true },
  { name: "EMAIL_DEV_OUTBOX_FILE", why: "a development-only file that receives email instead of Resend: it must never exist in production (the service also refuses to start with it)", check: (v) => !isSet(v), expect: "absent", forbidden: true },
  { name: "EMAIL_OTP_SECRET", why: "required only while EMAIL_VERIFICATION_REQUIRED is on, then it must be base64 of at least 32 random bytes (never derived from JWT_SECRET)", check: (v, env) => (env.EMAIL_VERIFICATION_REQUIRED || "").trim() !== "true" || isBase64Secret(v), expect: "a strong secret when verification is on, otherwise optional" },
];

/** @param {Record<string, string | undefined>} env the backend container's environment
 *  @returns {{ rows: { name: string, ok: boolean, state: string, expect: string, why: string, shown?: string }[], ok: boolean, failing: string[] }} */
function evaluateEnv(env) {
  const rows = RULES.map((r) => {
    const v = env[r.name];
    const ok = !!r.check(v, env);
    const state = isSet(v) ? "set" : "absent";
    return { name: r.name, ok, state, expect: r.expect, why: r.why, ...(isSet(v) && !SECRET.test(r.name) ? { shown: v.trim().slice(0, 80) } : {}) };
  });
  const failing = rows.filter((r) => !r.ok).map((r) => r.name);
  return { rows, ok: failing.length === 0, failing };
}

/** The Vercel (frontend) side, which this repo cannot read: the checklist the runbook uses. */
const VERCEL_REQUIRED = [
  { name: "NEXT_PUBLIC_ADVISORY_ENABLED", value: "true", note: "BUILD-time: it only takes effect in a build made after it is set. Set it only after the backend gate has passed, then redeploy." },
];
const VERCEL_MUST_STAY = ["BACKEND_URL (or an absolute NEXT_PUBLIC_API_URL) already pointing at the Lightsail backend", "NEXT_PUBLIC_API_URL if it already exists: unchanged"];

module.exports = { PRODUCTION_SITE, PRODUCTION_BACKEND, WEBHOOK_PATH, SECRET, RULES, evaluateEnv, isBase64Secret, isHttpsPublic, VERCEL_REQUIRED, VERCEL_MUST_STAY };
