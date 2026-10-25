/**
 * Runs the TypeORM migration CLI against the LOCAL embedded Postgres only.
 *
 *   node scripts/dev/local-migrate.js run|revert|show
 *
 * `npm run migration:run` uses DATABASE_URL from backend/.env, which is the hosted database; use this script (npm run migration:run:local)
 * for anything you do on a development machine. See local-db-guard.js.
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { useLocalDatabase, describe } = require("./local-db-guard");

const action = process.argv[2];
if (!["run", "revert", "show"].includes(action)) {
  console.error("Usage: node scripts/dev/local-migrate.js run|revert|show");
  process.exit(2);
}

const url = useLocalDatabase();
console.log(`[local-migrate] ${action} against ${describe(url)} (local embedded Postgres)`);

// typeorm's own ts-node entry point (it registers ts-node for us). Run with node directly, no shell, so a path with spaces is fine.
const cli = require.resolve("typeorm/cli-ts-node-commonjs.js", { paths: [path.join(__dirname, "..", "..")] });
const result = spawnSync(process.execPath, [cli, `migration:${action}`, "-d", "src/database/data-source.ts"], {
  cwd: path.join(__dirname, "..", ".."),
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
