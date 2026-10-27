/**
 * Refuses to let development tooling touch anything but the local embedded Postgres.
 *
 * backend/.env points DATABASE_URL at the hosted Supabase database. These helpers exist so the advisory migration, the demo seed and the
 * integration tests can never run against it by accident: they ignore DATABASE_URL entirely and use LOCAL_DATABASE_URL (the embedded server
 * from `npm run db:local`, port 55432), and they refuse a URL whose host is not this machine.
 *
 * Nothing here prints a connection string — only the host:port — so credentials never reach a log.
 */
const LOCAL_DATABASE_URL = process.env.ADVISORY_LOCAL_DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:55432/ruwad";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function describe(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "an unparseable URL";
  }
}

/** Throws unless `url` points at this machine. Returns the url. */
function assertLocalDatabase(url = LOCAL_DATABASE_URL) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("Refusing to continue: the database URL could not be parsed.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to continue: ${describe(url)} is not a local database. Advisory migrations, seeds and tests run on the local embedded Postgres only.`);
  }
  return url;
}

/** Points this process (and the child processes it starts) at the local database, whatever backend/.env says. */
function useLocalDatabase() {
  const url = assertLocalDatabase();
  process.env.DATABASE_URL = url;
  process.env.DATABASE_SSL = "false";
  return url;
}

module.exports = { LOCAL_DATABASE_URL, assertLocalDatabase, useLocalDatabase, describe };
