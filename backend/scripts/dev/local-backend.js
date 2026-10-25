/**
 * Starts the built backend (dist/main.js) for LOCAL development against the local embedded Postgres, with Advisory Services switched on.
 *
 *   npm run build && node scripts/dev/local-backend.js        (npm run start:local)
 *
 * backend/.env holds production credentials (the hosted database, a live email key, the production JWT secret). This runner overrides every one
 * of them for the process it starts, so a local session can never write to the hosted database or send real email:
 *   - DATABASE_URL        → the local embedded Postgres (refuses anything that isn't on this machine; see local-db-guard.js)
 *   - RESEND_API_KEY      → blank (no provider, so nothing can be sent); ADVISORY_EMAIL_MODE=mock as well
 *   - JWT_SECRET          → a throwaway value generated for this run, so the production secret is never used locally
 *   - ADVISORY_ENABLED    → true
 * Only the host:port of the database is printed, never a connection string.
 */
const { spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const { useLocalDatabase, describe } = require("./local-db-guard");

const url = useLocalDatabase();
const root = path.join(__dirname, "..", "..");
const env = {
  ...process.env,
  DATABASE_URL: url,
  DATABASE_SSL: "false",
  RESEND_API_KEY: "",
  EMAIL_FROM: "",
  ADMIN_NOTIFICATION_EMAIL: "",
  ADVISORY_EMAIL_MODE: "mock",
  ADVISORY_ENABLED: "true",
  JWT_SECRET: process.env.LOCAL_JWT_SECRET || crypto.randomBytes(32).toString("hex"),
  NODE_ENV: "development",
  PORT: process.env.PORT || "4000",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5174",
  // Features that call out to third parties stay off for a local run.
  CONTENT_REFRESH_INTERNAL: "false",
  ML_SCORING_ENABLED: "false",
  ML_EXPERIMENTAL_INFERENCE_ENABLED: "false",
};

console.log(`[local-backend] database ${describe(url)} (local embedded Postgres) · advisory ON · email MOCK (no provider key) · port ${env.PORT}`);
const child = spawn(process.execPath, [path.join(root, "dist", "main.js")], { cwd: root, env, stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
