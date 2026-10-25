/**
 * Seeds the six fictional demonstration advisors into the LOCAL embedded Postgres only (see local-db-guard.js).
 *
 *   node scripts/dev/local-advisory-seed.js        (npm run advisory:seed:local)
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { useLocalDatabase } = require("./local-db-guard");

useLocalDatabase();
const root = path.join(__dirname, "..", "..");
const result = spawnSync(process.execPath, ["-r", "ts-node/register/transpile-only", path.join("src", "advisory", "seed", "run-seed.ts")], { cwd: root, stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
