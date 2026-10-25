import * as path from "path";

/** Which migration files the TypeORM CLI (and therefore `deploy:start` on Render and the Docker start command) will see.
 *
 * The advisory migrations live in their own folder and are OPT-IN: they are only listed when ADVISORY_MIGRATIONS is exactly "true".
 * Why: Render still auto-deploys from `master` and runs pending migrations on start, and AWS runs them too unless RUN_MIGRATIONS=false. Without
 * this gate, merging the advisory work would apply it to the production database (including CREATE EXTENSION btree_gist) as a side effect of an
 * ordinary deploy. With it, a normal deploy simply doesn't know the advisory migrations exist; applying them is a deliberate act:
 *
 *     ADVISORY_MIGRATIONS=true  <migration command>
 *
 * Local tooling (scripts/dev/local-migrate.js) sets it for the local database only. Once the production window has happened the flag can stay
 * on (already-applied migrations are skipped) or off (TypeORM ignores applied migrations it no longer lists). */
export function migrationSources(env: NodeJS.ProcessEnv, baseDir: string): string[] {
  const sources = [path.join(baseDir, "migrations", "*.{ts,js}")];
  if (env.ADVISORY_MIGRATIONS === "true") sources.push(path.join(baseDir, "migrations-advisory", "*.{ts,js}"));
  return sources;
}
