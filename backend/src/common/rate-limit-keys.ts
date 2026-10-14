import { isIP } from "node:net";

type ReqLike = { headers?: Record<string, unknown>; ip?: string; method?: string; path?: string; url?: string; body?: unknown };

/** The visitor's own IP, so each person gets their own rate-limit bucket.
 *
 * Browser traffic reaches the API through the Vercel proxy and Render's load balancer, so `req.ip` is
 * the address of a proxy that every visitor shares — one noisy visitor used to burn the budget for
 * everyone. Vercel sets `X-Forwarded-For` to the real client address (and Render appends its own
 * hops after it), so the first valid entry is the visitor. A client that talks to Render directly can
 * put its own value there, which is why the login/signup routes are ALSO limited per account (below)
 * rather than relying on the IP alone. Falls back to `req.ip` when the header is absent or invalid. */
export function resolveClientIp(req: ReqLike): string {
  const raw = req.headers?.["x-forwarded-for"];
  const header = Array.isArray(raw) ? raw.join(",") : typeof raw === "string" ? raw : "";
  for (const part of header.split(",")) {
    const candidate = part.trim();
    if (candidate && isIP(candidate)) return candidate;
  }
  return req.ip ?? "unknown";
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
