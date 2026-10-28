/* eslint-disable @typescript-eslint/no-var-requires */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// The local-development tooling is plain Node scripts (they run before anything is built), so it is loaded with require.
const guard = require("../../scripts/dev/local-db-guard");
const local = require("../../scripts/dev/local-env");

const DB = "postgresql://postgres:postgres@127.0.0.1:55432/ruwad";
const SECRETS_IN_SHELL = {
  PATH: "p",
  SystemRoot: "C:\\Windows",
  ANTHROPIC_API_KEY: "sk-ant-should-never-appear",
  DAILY_API_KEY: "daily-should-never-appear",
  RESEND_API_KEY: "re_should_never_appear",
  GOOGLE_CLIENT_SECRET: "gsecret-should-never-appear",
  JWT_SECRET: "prod-jwt-should-never-appear",
  ML_SERVICE_TOKEN: "ml-should-never-appear",
  TOKEN_ENCRYPTION_KEY: "enc-should-never-appear",
  UNRELATED_THING: "also-not-inherited",
};

describe("local development guard: database", () => {
  it("accepts only the local embedded Postgres (this machine, port 55432)", () => {
    expect(guard.assertLocalDatabase(DB)).toBe(DB);
    expect(guard.assertLocalDatabase("postgresql://postgres:postgres@localhost:55432/scratch")).toContain("scratch");
  });

  it("refuses any other machine, any production host, any other port and anything unreadable, without echoing credentials", () => {
    const bad = [
      "postgresql://u:topsecret@db.abcdefgh.supabase.co:5432/postgres",
      "postgresql://u:topsecret@aws-0-eu.pooler.supabase.com:6543/postgres",
      "postgresql://u:topsecret@10.0.0.5:55432/ruwad",
      "postgresql://u:topsecret@127.0.0.1:5432/ruwad",
      "postgresql://u:topsecret@127.0.0.1/ruwad",
      "not a url",
    ];
    for (const url of bad) {
      let message = "";
      try { guard.assertLocalDatabase(url); } catch (e) { message = (e as Error).message; }
      expect(message).toMatch(/Refusing to continue/);
      expect(message).not.toContain("topsecret");
    }
  });
});

describe("local development guard: the local backend's environment", () => {
  it("is an explicit allow-list: no secret and no unrelated shell variable gets through; mock email and mock Daily are the defaults", () => {
    const { env, facts } = local.localBackendEnv({ shellEnv: SECRETS_IN_SHELL });
    for (const k of ["ANTHROPIC_API_KEY", "DAILY_API_KEY", "GOOGLE_CLIENT_SECRET", "ML_SERVICE_TOKEN", "TOKEN_ENCRYPTION_KEY", "UNRELATED_THING"]) expect(env[k]).toBeUndefined();
    expect(env.JWT_SECRET).not.toBe("prod-jwt-should-never-appear");
    expect(env.JWT_SECRET).toHaveLength(64); // throwaway, generated for this run
    expect(env.PATH).toBe("p");
    expect(env.DATABASE_URL).toBe(DB);
    expect(env).toMatchObject({ ADVISORY_ENABLED: "true", ADVISORY_EMAIL_MODE: "mock", ADVISORY_VIDEO_PROVIDER: "mock", RESEND_API_KEY: "", ML_SCORING_ENABLED: "false", CONTENT_REFRESH_INTERNAL: "false" });
    expect(env.DAILY_API_KEY).toBeUndefined();
    expect(facts).toMatchObject({ database: "127.0.0.1:55432", email: "mock", video: "mock" });
    expect(JSON.stringify(facts)).not.toMatch(/should-never-appear/);
  });

  it("refuses to start when the shell names a production database, a production site or a non-local frontend", () => {
    for (const [name, value] of [["DATABASE_URL", "postgresql://u:topsecret@db.x.supabase.co:5432/postgres"], ["FRONTEND_URL", "https://www.ruwad.studio"], ["NEXT_PUBLIC_API_URL", "https://ruwad-backend-e92x.onrender.com/api"]]) {
      let message = "";
      try { local.localBackendEnv({ shellEnv: { PATH: "p", [name]: value } }); } catch (e) { message = (e as Error).message; }
      expect(message).toContain(name);
      expect(message).not.toMatch(/topsecret|supabase|ruwad\.studio|onrender/);
    }
    expect(() => local.localBackendEnv({ shellEnv: { PATH: "p", FRONTEND_URL: "https://staging.example.com" } })).toThrow(/this machine/);
    expect(() => local.localBackendEnv({ shellEnv: { PATH: "p", FRONTEND_URL: "http://localhost:5174" } })).not.toThrow();
  });

  it("real Daily is an explicit opt-in: it needs the flag, a domain and a key, and the key is never reported", () => {
    const envFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ruwad-env-spec-")), ".env");
    fs.writeFileSync(envFile, "DAILY_API_KEY=real-daily-key-abc123\nANTHROPIC_API_KEY=sk-other-secret\nDATABASE_URL=postgresql://u:p@db.x.supabase.co/postgres\n");
    expect(() => local.localBackendEnv({ shellEnv: { PATH: "p" }, realDaily: true, envFile })).toThrow(/LOCAL_DAILY_DOMAIN/);
    expect(() => local.localBackendEnv({ shellEnv: { PATH: "p", LOCAL_DAILY_DOMAIN: "my-domain" }, realDaily: true, envFile: envFile + ".missing" })).toThrow(/DAILY_API_KEY/);
    const { env, facts } = local.localBackendEnv({ shellEnv: { PATH: "p", LOCAL_DAILY_DOMAIN: "my-domain" }, realDaily: true, envFile });
    expect(env).toMatchObject({ ADVISORY_VIDEO_PROVIDER: "daily", DAILY_DOMAIN: "my-domain", DAILY_API_KEY: "real-daily-key-abc123" });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined(); // only the Daily key is taken from the file
    expect(env.DATABASE_URL).toBe(DB);
    expect(JSON.stringify(facts)).not.toContain("real-daily-key-abc123");
    expect(facts.video).toMatch(/REAL Daily/);
    expect(env.ADVISORY_EMAIL_MODE).toBe("mock"); // real Daily does not switch email on
  });

  it("without the opt-in, no Daily key can reach the process even if the shell has one", () => {
    const { env } = local.localBackendEnv({ shellEnv: { PATH: "p", DAILY_API_KEY: "daily-in-shell", ADVISORY_VIDEO_PROVIDER: "daily", LOCAL_DAILY_DOMAIN: "d" } });
    expect(env.DAILY_API_KEY).toBeUndefined();
    expect(env.ADVISORY_VIDEO_PROVIDER).toBe("mock");
  });
});

describe("local development guard: test and migration runners", () => {
  it("strips every secret from the shell environment and unsets the mock-mode switches (unset = the app default, mock), with the local database", () => {
    const env = local.sanitizedEnv({ shellEnv: { ...SECRETS_IN_SHELL, NODE_ENV: "test", ADVISORY_EMAIL_MODE: "live", ADVISORY_VIDEO_PROVIDER: "daily" }, extra: { ADVISORY_INTEGRATION: "1" } });
    for (const k of ["ANTHROPIC_API_KEY", "DAILY_API_KEY", "GOOGLE_CLIENT_SECRET", "JWT_SECRET", "ML_SERVICE_TOKEN", "TOKEN_ENCRYPTION_KEY"]) expect(env[k]).toBeUndefined();
    expect(env).toMatchObject({ PATH: "p", NODE_ENV: "test", DATABASE_URL: DB, DATABASE_SSL: "false", ADVISORY_INTEGRATION: "1" });
    // a live-mode or Daily switch in the shell is REMOVED (so the app default, mock, applies); it is never forced, because @nestjs/config reads process.env
    // before a module's own config and the integration tests pass their own fake-provider settings
    for (const k of ["ADVISORY_EMAIL_MODE", "ADVISORY_VIDEO_PROVIDER", "RESEND_API_KEY", "DAILY_API_KEY"]) expect(env[k]).toBeUndefined();
  });

  it("refuses when the shell points at production", () => {
    expect(() => local.sanitizedEnv({ shellEnv: { PATH: "p", DATABASE_URL: "postgresql://u:p@db.x.supabase.co:5432/postgres" }, who: "test:advisory" })).toThrow(/test:advisory: refusing to start\. DATABASE_URL/);
  });

  it("recognises credential variable names and leaves ordinary ones alone", () => {
    for (const k of ["ANTHROPIC_API_KEY", "DAILY_API_KEY", "DAILY_WEBHOOK_SECRET", "RESEND_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_REDIRECT_URI", "ML_SERVICE_TOKEN", "ML_SCORING_SERVICE_URL", "TOKEN_ENCRYPTION_KEY", "JWT_SECRET", "DATABASE_URL", "SERPER_API_KEY"]) expect(local.SENSITIVE_KEY.test(k)).toBe(true);
    for (const k of ["PATH", "NODE_ENV", "PORT", "ADVISORY_ENABLED", "TEMP"]) expect(local.SENSITIVE_KEY.test(k)).toBe(false);
  });
});

describe("local development guard: working directory", () => {
  it("runs the backend from an empty directory, so backend/.env cannot be read, and removes it afterwards", () => {
    const run = local.emptyRunDir();
    expect(fs.readdirSync(run.dir)).toEqual([]);
    expect(fs.existsSync(path.join(run.dir, ".env"))).toBe(false);
    run.cleanup();
    expect(fs.existsSync(run.dir)).toBe(false);
  });
});
