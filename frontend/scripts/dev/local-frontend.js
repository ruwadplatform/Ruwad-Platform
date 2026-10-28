/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script (CommonJS), run before anything is built */
/**
 * Starts, builds or serves the frontend for LOCAL development, pointed ONLY at the local backend (http://127.0.0.1:4000).
 *
 *   npm run dev:local      next dev on port 5174
 *   npm run build:local    next build, and records that the build targets the local backend
 *   npm run start:local    next start on port 5174; refuses to serve a build that was not made by build:local
 *
 * See local-env.js. The `/api` proxy target and NEXT_PUBLIC_API_URL are baked into a build, which is why `start:local` checks the marker that
 * `build:local` leaves: a build made against any other backend can never be served from here.
 * Set BACKEND_URL to use a different LOCAL backend address; anything that is not this machine is refused.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { localFrontendEnv, localBackendOrigin } = require("./local-env");

const root = path.join(__dirname, "..", "..");
const mode = process.argv[2];
if (!["dev", "build", "start"].includes(mode)) {
  console.error("Usage: node scripts/dev/local-frontend.js dev|build|start");
  process.exit(2);
}

let env;
try {
  env = localFrontendEnv({ dir: root });
} catch (e) {
  console.error(`[local-frontend] ${e.message.replace(/^local-frontend: /, "")}`);
  process.exit(1);
}

const marker = path.join(root, ".next", "local-build.json");
if (mode === "start") {
  let built = null;
  try {
    built = JSON.parse(fs.readFileSync(marker, "utf8")).backend;
    localBackendOrigin(built);
  } catch {
    console.error("[local-frontend] refusing to start: .next was not built by `npm run build:local` (or targets another backend). Run `npm run build:local` first.");
    process.exit(1);
  }
  if (built !== env.BACKEND_URL) {
    console.error("[local-frontend] refusing to start: the build targets a different local backend address than BACKEND_URL. Run `npm run build:local` again.");
    process.exit(1);
  }
}

const next = require.resolve("next/dist/bin/next", { paths: [root] });
const args = { dev: ["dev", "--port", "5174"], build: ["build"], start: ["start", "--port", "5174"] }[mode];
console.log(`[local-frontend] ${mode} · API → ${env.BACKEND_URL} (local backend only) · advisory ON · search indexing OFF`);
const child = spawn(process.execPath, [next, ...args], { cwd: root, env, stdio: "inherit" });
child.on("exit", (code) => {
  if (mode === "build" && code === 0) fs.writeFileSync(marker, JSON.stringify({ backend: env.BACKEND_URL, builtAt: new Date().toISOString() }));
  process.exit(code ?? 0);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
