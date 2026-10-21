import type { ThrottlerOptions } from "@nestjs/throttler";
import { accountKey, peerLimit, peerMultiplier, resolveClientIp, resolvePeerIp } from "./rate-limit-keys";

/** The app's rate-limit buckets (all per route, per minute). Every request is counted in all that apply and must pass every one. */
export function appThrottlers(env: { RATE_LIMIT_PEER_MULTIPLIER?: string } = process.env): ThrottlerOptions[] {
  return [
    // Per visitor: each person's own IP, not the shared proxy address (see rate-limit-keys.ts).
    { name: "default", ttl: 60_000, limit: 100, getTracker: (req) => resolveClientIp(req) },
    // Per account, only on login / signup / password-reset-request: caps guessing at one account
    // regardless of where the attempts appear to come from.
    {
      name: "account",
      ttl: 60_000,
      limit: 10,
      skipIf: (context) => accountKey(context.switchToHttp().getRequest()) === null,
      getTracker: (req) => accountKey(req) ?? resolveClientIp(req),
    },
    // Per real connecting address, a looser shared cap (route limit × RATE_LIMIT_PEER_MULTIPLIER, default 10). The visitor address above
    // comes from a header a client can forge when it calls the backend URL directly; this one cannot be forged, so rotating the header
    // no longer gets unlimited requests.
    {
      name: "peer",
      ttl: 60_000,
      limit: (context) => peerLimit(context, peerMultiplier(env.RATE_LIMIT_PEER_MULTIPLIER)),
      getTracker: (req) => resolvePeerIp(req),
    },
  ];
}
