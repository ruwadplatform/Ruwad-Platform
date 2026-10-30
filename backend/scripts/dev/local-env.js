/**
 * What a LOCAL process is allowed to see.
 *
 * backend/.env holds production credentials (hosted database, live email key, AI/search/Google keys, the production JWT secret, the Daily key).
 * The app's ConfigModule reads `.env` from the working directory and only skips variables that are already set, so every variable a runner did
 * not override used to leak into the local process. These helpers close that:
 *   - the local backend gets an EXPLICIT environment (a short allow-list of system variables + local values), never a copy of the shell's;
 *   - it is started from an empty working directory, so backend/.env cannot be read at all;
 *   - test and migration runners get the shell environment with every secret removed and the mock modes forced;
 *   - anything that points at a production host (database, API, site) makes the runner refuse to start.
 *
 * Email and video stay MOCK. Real Daily is an explicit opt-in (`--real-daily` plus LOCAL_DAILY_DOMAIN); its key is read from backend/.env inside
 * this process only, handed to the one child that needs it, and never printed.
 *
 * Nothing here prints a secret: messages carry variable NAMES, hosts and yes/no facts only.
 */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { LOCAL_HOSTS, LOCAL_DATABASE_URL, assertLocalDatabase, isProductionHost } = require("./local-db-guard");

/** System variables a child process needs to run on Windows or Unix. Nothing else is inherited by the local backend. */
const SYSTEM_VARS = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "COMSPEC", "TEMP", "TMP", "TMPDIR"];

/** Variable names that carry a credential, a third-party endpoint or a production setting. Removed for test and migration runs. */
const SENSITIVE_KEY = /(API_KEY|SECRET|TOKEN|PASSWORD|ENCRYPTION_KEY|CLIENT_ID|CLIENT_SECRET|SERVICE_URL|DATABASE_URL|^DAILY_|^RESEND|^ANTHROPIC|^SERPER|^GOOGLE_|^ML_|^EMAIL_FROM$|^ADMIN_NOTIFICATION_EMAIL$)/i;

/** The mock modes the local BACKEND runs in (it has no other configuration, so they are set explicitly). */
const MOCK_MODES = {
  ADVISORY_EMAIL_MODE: "mock",
  ADVISORY_VIDEO_PROVIDER: "mock",
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  ADMIN_NOTIFICATION_EMAIL: "",
  ML_SCORING_ENABLED: "false",
  ML_EXPERIMENTAL_INFERENCE_ENABLED: "false",
  CONTENT_REFRESH_INTERNAL: "false",
};

const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Every host named by a value (a URL, or a comma/space separated list of URLs). Values that are not URLs name no host. */
function hostsIn(value) {
  if (typeof value !== "string") return [];
  return value.split(/[,\s]+/).filter((v) => URL_LIKE.test(v)).flatMap((v) => {
    try {
      return [new URL(v).hostname];
    } catch {
      return [];
    }
  });
}

/** Names (never values) of the variables in `env` that point at a production host. */
function productionTargetsIn(env) {
  return Object.entries(env).filter(([, v]) => hostsIn(v).some(isProductionHost)).map(([k]) => k).sort();
}

/** Throws if any variable in `env` points at a production host. `who` names the tool for the message. */
function refuseIfProductionDetected(env, who) {
  const found = productionTargetsIn(env);
  if (found.length) {
    throw new Error(`${who}: refusing to start. ${found.join(", ")} point(s) at a production host. Unset ${found.length === 1 ? "it" : "them"} in this shell; local runs use the local backend and the local database only.`);
  }
}

/** Throws unless every host in `value` is this machine. Used for values a local run accepts from the shell (the frontend URL). */
function assertLocalUrls(name, value, who) {
  const hosts = hostsIn(value);
  const bad = hosts.filter((h) => !LOCAL_HOSTS.has(h));
  if (bad.length) throw new Error(`${who}: refusing to start. ${name} must point at this machine (127.0.0.1 or localhost).`);
}

/** Reads one KEY from a dotenv-style file without putting the file's other values anywhere. Returns "" when absent. */
function readEnvFileValue(file, key) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
  const line = text.split(/\r?\n/).find((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
  return line ? line.replace(/^[^=]*=/, "").trim().replace(/^["']|["']$/g, "") : "";
}

/**
 * The environment for the local BACKEND process. Explicit allow-list: nothing is inherited from the shell except the system variables above.
 * `realDaily` is the explicit opt-in for real Daily.co testing; it needs LOCAL_DAILY_DOMAIN and a DAILY_API_KEY in backend/.env.
 * Returns { env, facts } where `facts` is safe to print.
 */
function localBackendEnv({ shellEnv = process.env, realDaily = false, bookings = false, emailVerification = false, envFile = path.join(__dirname, "..", "..", ".env") } = {}) {
  const who = "local-backend";
  refuseIfProductionDetected(shellEnv, who);
  const url = assertLocalDatabase(LOCAL_DATABASE_URL);
  const port = shellEnv.PORT || "4000";
  if (!/^\d{2,5}$/.test(port)) throw new Error(`${who}: PORT must be a number.`);
  const frontend = shellEnv.FRONTEND_URL || "http://127.0.0.1:5174,http://localhost:5174";
  assertLocalUrls("FRONTEND_URL", frontend, who);

  const env = {};
  for (const k of SYSTEM_VARS) if (shellEnv[k]) env[k] = shellEnv[k];
  Object.assign(env, {
    NODE_ENV: "development",
    PORT: port,
    DATABASE_URL: url,
    DATABASE_SSL: "false",
    JWT_SECRET: shellEnv.LOCAL_JWT_SECRET || crypto.randomBytes(32).toString("hex"), // throwaway: the production secret is never used locally
    JWT_EXPIRES_IN: "7d",
    FRONTEND_URL: frontend,
    APP_URL: frontend.split(",")[0],
    ADVISORY_ENABLED: "true",
    ...MOCK_MODES,
  });

  if (realDaily) {
    const domain = (shellEnv.LOCAL_DAILY_DOMAIN || "").trim();
    if (!/^[a-z0-9-]+$/i.test(domain)) throw new Error(`${who}: --real-daily needs LOCAL_DAILY_DOMAIN set to your Daily subdomain (for example the part before .daily.co).`);
    const key = readEnvFileValue(envFile, "DAILY_API_KEY");
    if (!key) throw new Error(`${who}: --real-daily needs DAILY_API_KEY in backend/.env.`);
    Object.assign(env, {
      ADVISORY_VIDEO_PROVIDER: "daily",
      DAILY_API_KEY: key,
      DAILY_DOMAIN: domain,
      DAILY_WEBHOOK_SECRET: shellEnv.LOCAL_DAILY_WEBHOOK_SECRET || crypto.randomBytes(32).toString("base64"),
    });
  }

  // Consultation bookings follow the production default (OFF). `--bookings` switches them on locally so the full booking flow can still be exercised.
  if (bookings) env.ADVISORY_BOOKINGS_ENABLED = "true";

  // Email verification follows the production default (OFF). `--email-verification` switches it on locally with a throwaway secret and a LOCAL email outbox (a file in the
  // temp folder that receives every email instead of Resend), so the 6-digit code can be read during a walkthrough. The outbox is refused by the backend in production.
  if (emailVerification) {
    env.EMAIL_VERIFICATION_REQUIRED = "true";
    env.EMAIL_OTP_SECRET = crypto.randomBytes(32).toString("base64");
    env.EMAIL_DEV_OUTBOX_FILE = path.join(os.tmpdir(), "ruwad-local-email-outbox.jsonl");
  }

  refuseIfProductionDetected(env, who); // belt and braces: the environment we are about to hand over is clean too
  return {
    env,
    facts: { emailVerification: env.EMAIL_VERIFICATION_REQUIRED === "true", outbox: env.EMAIL_DEV_OUTBOX_FILE ?? null, bookings: env.ADVISORY_BOOKINGS_ENABLED === "true", database: assertLocalDatabase(env.DATABASE_URL) && "127.0.0.1:55432", port, email: env.ADVISORY_EMAIL_MODE, video: env.ADVISORY_VIDEO_PROVIDER === "daily" ? `REAL Daily (domain ${env.DAILY_DOMAIN}, opt-in)` : "mock", variables: Object.keys(env).filter((k) => !SYSTEM_VARS.includes(k)).sort() },
  };
}

/** Settings a test or migration process must never inherit. Unset means the app default, which is mock email, mock video and no refresh job. */
const UNSET_FOR_TESTS = ["ADVISORY_EMAIL_MODE", "ADVISORY_VIDEO_PROVIDER", "CONTENT_REFRESH_INTERNAL", "ADVISORY_BOOKINGS_ENABLED", "EMAIL_VERIFICATION_REQUIRED", "EMAIL_DEV_OUTBOX_FILE"];

/**
 * The shell environment for TEST and MIGRATION runners: every secret removed, the mock-mode switches UNSET, local database only. Refuses if the
 * shell environment points at production.
 *
 * Mock is guaranteed by removal, not by forcing a value: @nestjs/config reads process.env BEFORE a module's own config object, so a forced
 * "mock" would override the settings the integration tests deliberately pass to exercise Daily and live email with fake providers.
 */
function sanitizedEnv({ shellEnv = process.env, extra = {}, who = "local tooling" } = {}) {
  refuseIfProductionDetected(shellEnv, who);
  const env = {};
  for (const [k, v] of Object.entries(shellEnv)) if (v !== undefined && !SENSITIVE_KEY.test(k) && !UNSET_FOR_TESTS.includes(k)) env[k] = v;
  return { ...env, DATABASE_URL: assertLocalDatabase(LOCAL_DATABASE_URL), DATABASE_SSL: "false", ...extra };
}

/** A fresh, empty directory to run the backend from, so a `.env` file in the working directory cannot exist. Call cleanup() on exit. */
function emptyRunDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ruwad-local-run-"));
  return { dir, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } } };
}

module.exports = { SYSTEM_VARS, SENSITIVE_KEY, MOCK_MODES, UNSET_FOR_TESTS, hostsIn, productionTargetsIn, refuseIfProductionDetected, assertLocalUrls, readEnvFileValue, localBackendEnv, sanitizedEnv, emptyRunDir };
