import * as fs from "fs";
import * as path from "path";
import { migrationSources } from "./migration-sources";

const base = path.join("x", "database");

describe("advisory migrations are opt-in", () => {
  it("by default only the regular migrations are listed", () => {
    expect(migrationSources({}, base)).toEqual([path.join(base, "migrations", "*.{ts,js}")]);
  });

  it("only the exact string 'true' switches them on (a typo can't)", () => {
    for (const v of ["", "false", "TRUE", "1", "yes", " true"]) expect(migrationSources({ ADVISORY_MIGRATIONS: v }, base)).toHaveLength(1);
    expect(migrationSources({ ADVISORY_MIGRATIONS: "true" }, base)).toEqual([path.join(base, "migrations", "*.{ts,js}"), path.join(base, "migrations-advisory", "*.{ts,js}")]);
  });

  it("no advisory migration file sits in the regular folder (where it would run on every deploy)", () => {
    const regular = fs.readdirSync(path.join(__dirname, "migrations"));
    expect(regular.filter((f) => /advisory/i.test(f))).toEqual([]);
    const gated = fs.readdirSync(path.join(__dirname, "migrations-advisory"));
    expect(gated.length).toBeGreaterThan(0);
  });
});
