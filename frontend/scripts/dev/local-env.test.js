/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script (CommonJS), run before anything is built */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { localFrontendEnv, localBackendOrigin, productionTargetsIn, productionTargetsInEnvFiles } = require("./local-env");

const emptyDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "ruwad-fe-env-"));

test("a local run pins the API to the local backend, whatever the shell had", () => {
  const env = localFrontendEnv({ shellEnv: { PATH: "x", NEXT_PUBLIC_API_URL: "/api" }, dir: emptyDir() });
  assert.equal(env.BACKEND_URL, "http://127.0.0.1:4000");
  assert.equal(env.NEXT_PUBLIC_API_URL, "http://127.0.0.1:4000/api");
  assert.equal(env.NEXT_PUBLIC_ADVISORY_ENABLED, "true");
  assert.equal(env.SEO_INDEX_PROFILES, "");
  assert.equal(env.PATH, "x");
});

test("a different local address is accepted; a deployed or non-local backend is refused", () => {
  assert.equal(localBackendOrigin("http://localhost:4100/api"), "http://localhost:4100");
  assert.throws(() => localBackendOrigin("https://ruwad-backend-e92x.onrender.com"), /this machine/);
  assert.throws(() => localBackendOrigin("https://api.example.com"), /this machine/);
  assert.throws(() => localBackendOrigin("not a url"), /could not be parsed/);
});

test("a production host anywhere in the shell makes it refuse, naming the variable but never its value", () => {
  const shellEnv = { BACKEND_URL: "https://www.ruwad.studio", OTHER: "fine" };
  assert.deepEqual(productionTargetsIn(shellEnv), ["BACKEND_URL"]);
  assert.throws(() => localFrontendEnv({ shellEnv, dir: emptyDir() }), (e) => /BACKEND_URL/.test(e.message) && !/ruwad\.studio/.test(e.message));
  for (const url of ["https://x.supabase.co", "https://abc.pooler.supabase.com:6543/db", "https://ruwad.onrender.com", "https://ruwad-backend.cs.amazonlightsail.com"]) {
    assert.deepEqual(productionTargetsIn({ NEXT_PUBLIC_API_URL: url }), ["NEXT_PUBLIC_API_URL"], url);
  }
});

test("a .env file that names a production host makes it refuse; only the file and variable names are reported", () => {
  const dir = emptyDir();
  fs.writeFileSync(path.join(dir, ".env.local"), 'NEXT_PUBLIC_API_URL="https://ruwad-backend-e92x.onrender.com/api"\nOTHER=1\n');
  assert.deepEqual(productionTargetsInEnvFiles(dir), [".env.local: NEXT_PUBLIC_API_URL"]);
  assert.throws(() => localFrontendEnv({ shellEnv: {}, dir }), (e) => /\.env\.local: NEXT_PUBLIC_API_URL/.test(e.message) && !/onrender/.test(e.message));
  fs.writeFileSync(path.join(dir, ".env.local"), "NEXT_PUBLIC_API_URL=http://127.0.0.1:4000\n");
  assert.deepEqual(productionTargetsInEnvFiles(dir), []);
});

test("values that are not URLs never count as a production target", () => {
  assert.deepEqual(productionTargetsIn({ A: "contact@ruwad.studio", B: "ruwad.studio", C: "true" }), []);
});
