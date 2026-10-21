import { isIP } from "node:net";

type ReqLike = { headers?: Record<string, unknown>; ip?: string; method?: string; path?: string; url?: string; body?: unknown };

/** The visitor's own IP, so each person gets their own rate-limit bucket.
 *
 * Browser traffic reaches the API through the Vercel proxy and Render's load balancer, so `req.ip` is
 * the address of a proxy that every visitor shares — one noisy visitor used to burn the budget for
 * everyone. Vercel sets `X-Forwarded-For` to the real client address (and Render appends its own
 * hops after it), so the first valid entry is the visitor. A client that talks to Render directly can
 * put its own value there, which is why the login/signup routes are ALSO limited per account (below)
 * and every route is ALSO limited per real connecting address (`resolvePeerIp`, a looser shared cap):
 * rotating this header only gets a client a bounded budget, not an unlimited one. Falls back to
 * `req.ip` when the header is absent or invalid. */
export function resolveClientIp(req: ReqLike): string {
  const raw = req.headers?.["x-forwarded-for"];
  const header = Array.isArray(raw) ? raw.join(",") : typeof raw === "string" ? raw : "";
  for (const part of header.split(",")) {
    const candidate = part.trim();
    if (candidate && isIP(candidate)) return candidate;
  }
  return req.ip ?? "unknown";
}

/** The address that actually connected to us, as Express resolved it behind the trusted proxy hops (`req.ip`). Unlike the visitor address
 * above it cannot be chosen by the client: a request sent straight to the backend URL with a made-up `X-Forwarded-For` still arrives from
 * its real address. Behind the Vercel proxy it is Vercel's shared egress address, so this key is only ever used with a generous cap. */
export function resolvePeerIp(req: ReqLike): string {
  return req.ip ?? "unknown";
}

/** How many times a route's own per-visitor limit the shared peer bucket allows. Default 10; RATE_LIMIT_PEER_MULTIPLIER changes it
 * without a redeploy. The per-visitor bucket (a forgeable header) stays the fine-grained limit; this one only bounds what a client can get
 * by rotating that header, instead of leaving it unlimited. Behind Vercel every visitor shares this bucket, so it must stay well above the
 * traffic the site really sees on any one route. */
export function peerMultiplier(raw: string | undefined): number {
  const n = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(n) && n >= 1 && n <= 1000 ? n : 10;
}

const DEFAULT_ROUTE_LIMIT = 100;

/** Per-minute cap of the peer bucket for one route: the route's own `@Throttle({ default: { limit } })` (or the global default) × the
 * multiplier. Reads the same metadata the throttler itself uses. */
export function peerLimit(context: { getHandler(): unknown; getClass(): unknown }, multiplier: number): number {
  const key = "THROTTLER:LIMITdefault";
  const meta = (target: unknown): unknown => (target ? Reflect.getMetadata(key, target as object) : undefined);
  const own = meta(context.getHandler()) ?? meta(context.getClass());
  const base = typeof own === "number" && own > 0 ? own : DEFAULT_ROUTE_LIMIT;
  return Math.ceil(base * multiplier);
}

/** Auth endpoints that take an email address and are worth limiting per ACCOUNT as well as per IP. */
const ACCOUNT_ROUTES = /\/auth\/(login|register|forgot-password)\/?$/;

/** `acct:<email>` for a login / signup / password-reset-request, otherwise null. Rotating or forging the
 * client IP does not get around this one: guessing passwords for one account is capped no matter where
 * the attempts appear to come from. */
export function accountKey(req: ReqLike): string | null {
  if (req.method !== "POST") return null;
  const path = (req.path ?? req.url ?? "").split("?")[0];
  if (!ACCOUNT_ROUTES.test(path)) return null;
  const email = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof email !== "string") return null;
  const normalised = email.trim().toLowerCase();
  return normalised ? `acct:${normalised.slice(0, 254)}` : null;
}
