import "reflect-metadata";
import { config } from "dotenv";
import { DataSource } from "typeorm";
import { migrationSources } from "./migration-sources";

config();

/** Used only by the TypeORM CLI (migration:generate/run/revert) — the
 * running Nest app gets its connection from DatabaseModule instead. Kept
 * separate because the CLI needs a plain DataSource, not a Nest-wired one. */
export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  entities: [__dirname + "/../**/*.entity.{ts,js}"],
  // The advisory migrations are opt-in (ADVISORY_MIGRATIONS=true); see migration-sources.ts for why.
  migrations: migrationSources(process.env, __dirname),
  synchronize: false,
  logging: false,
});
