/**
 * Starts the built backend (dist/main.js) for LOCAL development against the local embedded Postgres, with Advisory Services switched on.
 *
 *   npm run build && node scripts/dev/local-backend.js        (npm run start:local)
 *   node scripts/dev/local-backend.js --real-daily            (npm run start:local -- --real-daily)   explicit opt-in, see below
 *   node scripts/dev/local-backend.js --bookings              (npm run start:local -- --bookings)     switch consultation bookings ON (they are OFF by default, as in production)
 *
 * backend/.env holds production credentials. This runner never lets them reach the local process (see local-env.js):
 *   - it hands the backend an EXPLICIT environment (a few system variables + local values), not a copy of the shell's;
 *   - it starts the backend from an empty directory, so backend/.env cannot be read at all;
 *   - DATABASE_URL is the local embedded Postgres only (127.0.0.1:55432); a production host anywhere in the environment makes it refuse to start;
 *   - email is MOCK (no provider key, ADVISORY_EMAIL_MODE=mock) and video is MOCK (simulated rooms) unless you opt in;
 *   - JWT_SECRET is a throwaway value generated for this run, so the production secret is never used locally.
 *
 * Real Daily (--real-daily) is for deliberately testing the real provider: it needs LOCAL_DAILY_DOMAIN in the shell and DAILY_API_KEY in
 * backend/.env, creates real rooms, and prints a notice. Without the flag no Daily call can be made.
 *
 * Only names, hosts and yes/no facts are printed, never a secret or a connection string.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { localBackendEnv, emptyRunDir } = require("./local-env");

const main = path.join(__dirname, "..", "..", "dist", "main.js");
if (!fs.existsSync(main)) {
  console.error("[local-backend] dist/main.js not found. Run `npm run build` first.");
  process.exit(1);
}

let plan;
try {
  plan = localBackendEnv({ realDaily: process.argv.includes("--real-daily"), bookings: process.argv.includes("--bookings") });
} catch (e) {
  console.error(`[local-backend] ${e.message.replace(/^local-backend: /, "")}`);
  process.exit(1);
}
const { env, facts } = plan;
const run = emptyRunDir();

console.log(`[local-backend] database ${facts.database} (local embedded Postgres) · advisory ON · email ${facts.email.toUpperCase()} · video ${facts.video} · port ${facts.port}`);
console.log(`[local-backend] environment handed to the app (names only): ${facts.variables.join(", ")}`);
if (env.ADVISORY_VIDEO_PROVIDER === "daily") console.warn("[local-backend] REAL DAILY IS ENABLED (explicit opt-in): consultations will create real Daily rooms. Recording is never requested.");

const child = spawn(process.execPath, [main], { cwd: run.dir, env, stdio: "inherit" });
child.on("exit", (code) => { run.cleanup(); process.exit(code ?? 0); });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
