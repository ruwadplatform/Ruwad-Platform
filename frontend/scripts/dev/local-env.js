/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script (CommonJS), run before anything is built */
/**
 * What a LOCAL frontend run is allowed to point at.
 *
 * The site reaches its API through two settings: BACKEND_URL / NEXT_PUBLIC_API_URL. next.config.ts proxies `/api/*` to them, server-side renders
 * call them directly, and large uploads go straight to NEXT_PUBLIC_API_URL from the browser. If either named the live backend, a local session
 * would read and write PRODUCTION data. The local runner therefore pins both to the local backend, and refuses to start when the shell or a
 * `.env*` file names a production host or any other machine.
 *
 * Only variable names, file names and hosts are ever printed.
 */
const fs = require("fs");
const path = require("path");

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const LOCAL_BACKEND = "http://127.0.0.1:4000";
/** Hosts that belong to the live RUWĀD service or its providers. */
const PRODUCTION_HOST_PATTERNS = [/(^|\.)supabase\.(co|com|net)$/i, /(^|\.)onrender\.com$/i, /(^|\.)amazonlightsail\.com$/i, /(^|\.)amazonaws\.com$/i, /(^|\.)ruwad\.studio$/i, /(^|\.)vercel\.(app|com)$/i];
const isProductionHost = (h) => PRODUCTION_HOST_PATTERNS.some((re) => re.test(h));
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

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

/** Names of the variables in `env` that point at a production host. */
const productionTargetsIn = (env) => Object.entries(env).filter(([, v]) => hostsIn(v).some(isProductionHost)).map(([k]) => k).sort();

/** `NAME` of each production-pointing variable in the frontend's own .env files, as "file: NAME". Values are never returned. */
function productionTargetsInEnvFiles(dir) {
  const out = [];
  for (const f of [".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"]) {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, f), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && hostsIn(m[2].trim().replace(/^["']|["']$/g, "")).some(isProductionHost)) out.push(`${f}: ${m[1]}`);
    }
  }
  return out;
}

/** The backend origin (no trailing slash, no /api) a local run may use. Throws unless it is this machine. */
function localBackendOrigin(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error("local-frontend: the backend URL could not be parsed.");
  }
  if (!LOCAL_HOSTS.has(u.hostname)) throw new Error("local-frontend: refusing to start. The backend URL must point at this machine (127.0.0.1 or localhost), never a deployed backend.");
  return u.origin;
}

/** The environment for a local frontend process: the shell's, with the API settings pinned to the local backend. */
function localFrontendEnv({ shellEnv = process.env, dir = path.join(__dirname, "..", "..") } = {}) {
  const fromShell = productionTargetsIn(shellEnv);
  if (fromShell.length) throw new Error(`local-frontend: refusing to start. ${fromShell.join(", ")} point(s) at a production host. Unset ${fromShell.length === 1 ? "it" : "them"} in this shell.`);
  const fromFiles = productionTargetsInEnvFiles(dir);
  if (fromFiles.length) throw new Error(`local-frontend: refusing to start. A .env file names a production host (${fromFiles.join(", ")}). Fix that file; local runs use the local backend only.`);
  const origin = localBackendOrigin(shellEnv.BACKEND_URL || LOCAL_BACKEND);
  if (shellEnv.NEXT_PUBLIC_API_URL && URL_LIKE.test(shellEnv.NEXT_PUBLIC_API_URL)) localBackendOrigin(shellEnv.NEXT_PUBLIC_API_URL);
  return {
    ...shellEnv,
    BACKEND_URL: origin,
    NEXT_PUBLIC_API_URL: `${origin}/api`, // absolute and ending in /api: server-side renders and direct uploads use it as is
    NEXT_PUBLIC_ADVISORY_ENABLED: "true",
    SEO_INDEX_PROFILES: "", // a local site is never opted in to search-engine indexing
  };
}

module.exports = { LOCAL_BACKEND, hostsIn, isProductionHost, productionTargetsIn, productionTargetsInEnvFiles, localBackendOrigin, localFrontendEnv };
