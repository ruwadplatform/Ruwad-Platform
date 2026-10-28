/**
 * Refuses to let development tooling touch anything but the local embedded Postgres.
 *
 * backend/.env points DATABASE_URL at the hosted Supabase database. These helpers exist so the advisory migration, the demo seed and the
 * integration tests can never run against it by accident: they ignore DATABASE_URL entirely and use LOCAL_DATABASE_URL (the embedded server
 * from `npm run db:local`, port 55432), and they refuse a URL whose host is not this machine or whose port is not 55432.
 *
 * Nothing here prints a connection string — only the host:port — so credentials never reach a log.
 */
const LOCAL_DB_PORT = "55432";
const LOCAL_DATABASE_URL = process.env.ADVISORY_LOCAL_DATABASE_URL || `postgresql://postgres:postgres@127.0.0.1:${LOCAL_DB_PORT}/ruwad`;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Hosts that belong to the live RUWĀD service or its providers. A local process must never be pointed at any of them. */
const PRODUCTION_HOST_PATTERNS = [
  /(^|\.)supabase\.(co|com|net)$/i, // the hosted database (direct and pooler hosts)
  /(^|\.)onrender\.com$/i, // the Render backend
  /(^|\.)amazonlightsail\.com$/i, // the AWS Lightsail backend
  /(^|\.)amazonaws\.com$/i,
  /(^|\.)ruwad\.studio$/i, // the live site
  /(^|\.)vercel\.(app|com)$/i, // the live frontend deployment
];

const isProductionHost = (host) => PRODUCTION_HOST_PATTERNS.some((re) => re.test(host));

function describe(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}`;
  } catch {
    return "an unparseable URL";
  }
}

/** Throws unless `url` points at the local embedded Postgres (this machine, port 55432). Returns the url. */
function assertLocalDatabase(url = LOCAL_DATABASE_URL) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Refusing to continue: the database URL could not be parsed.");
  }
  if (isProductionHost(parsed.hostname)) {
    throw new Error(`Refusing to continue: ${describe(url)} is a production host. Local tooling runs on the local embedded Postgres only.`);
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing to continue: ${describe(url)} is not a local database. Advisory migrations, seeds and tests run on the local embedded Postgres only.`);
  }
  if ((parsed.port || "5432") !== LOCAL_DB_PORT) {
    throw new Error(`Refusing to continue: ${describe(url)} is not the local embedded Postgres (port ${LOCAL_DB_PORT}, started by \`npm run db:local\`).`);
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

module.exports = { LOCAL_DB_PORT, LOCAL_DATABASE_URL, LOCAL_HOSTS, PRODUCTION_HOST_PATTERNS, isProductionHost, assertLocalDatabase, useLocalDatabase, describe };
