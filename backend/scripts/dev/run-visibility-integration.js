/**
 * Runs the field-level access control integration tests (src/visibility/visibility.integration.spec.ts) against the LOCAL embedded Postgres only.
 *   npm run test:visibility      (start the database first: npm run db:local)
 *
 * The tests run with every secret removed from the environment and email and video forced to mock (see local-env.js).
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { useLocalDatabase, describe } = require("./local-db-guard");
const { sanitizedEnv } = require("./local-env");

const url = useLocalDatabase();
console.log(`[test:visibility] running against ${describe(url)} (local embedded Postgres) · email mock · video mock`);
const jest = path.join(path.dirname(require.resolve("jest/package.json", { paths: [path.join(__dirname, "..", "..")] })), "bin", "jest.js");
const result = spawnSync(process.execPath, [jest, "--runInBand", "--testPathPattern", "visibility.*integration", ...process.argv.slice(2)], {
  cwd: path.join(__dirname, "..", ".."),
  stdio: "inherit",
  env: sanitizedEnv({ extra: { VISIBILITY_INTEGRATION: "1" }, who: "test:visibility" }),
});
process.exit(result.status ?? 1);
