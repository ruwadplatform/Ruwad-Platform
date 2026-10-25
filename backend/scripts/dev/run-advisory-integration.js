/**
 * Runs the advisory integration tests (src/advisory/advisory.integration.spec.ts) against the LOCAL embedded Postgres only.
 *   npm run test:advisory      (start the database first: npm run db:local)
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { useLocalDatabase, describe } = require("./local-db-guard");

const url = useLocalDatabase();
console.log(`[test:advisory] running against ${describe(url)} (local embedded Postgres)`);
const jest = path.join(path.dirname(require.resolve("jest/package.json", { paths: [path.join(__dirname, "..", "..")] })), "bin", "jest.js");
const result = spawnSync(process.execPath, [jest, "--runInBand", "--testPathPattern", "advisory.integration", ...process.argv.slice(2)], {
  cwd: path.join(__dirname, "..", ".."),
  stdio: "inherit",
  env: { ...process.env, ADVISORY_INTEGRATION: "1" },
});
process.exit(result.status ?? 1);
