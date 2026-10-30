/**
 * Runs the email-verification integration tests (src/auth/email-verification.integration.spec.ts) against the LOCAL embedded Postgres only.
 *   npm run test:auth      (start the database first: npm run db:local, and apply migrations: npm run migration:run:local)
 *
 * The tests run with every secret removed from the environment; they build their own application with their own throwaway secrets and a fake email
 * service, so they can never send an email or reach Resend, whatever the shell or backend/.env contain.
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { useLocalDatabase, describe } = require("./local-db-guard");
const { sanitizedEnv } = require("./local-env");

const url = useLocalDatabase();
console.log(`[test:auth] running against ${describe(url)} (local embedded Postgres) · fake email service`);
const jest = path.join(path.dirname(require.resolve("jest/package.json", { paths: [path.join(__dirname, "..", "..")] })), "bin", "jest.js");
const result = spawnSync(process.execPath, [jest, "--runInBand", "--testPathPattern", "email-verification.*integration", ...process.argv.slice(2)], {
  cwd: path.join(__dirname, "..", ".."),
  stdio: "inherit",
  env: sanitizedEnv({ extra: { AUTH_INTEGRATION: "1" }, who: "test:auth" }),
});
process.exit(result.status ?? 1);
