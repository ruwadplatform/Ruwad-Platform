import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

/** A NUL byte can never be real text, and Postgres refuses it ("invalid byte sequence") — which used to surface as a 500 from any search box or
 * text field. Rejecting it at the door turns it into an ordinary 400. */
const hasNul = (s: string) => s.includes("\u0000");

function scan(value: unknown, depth = 0): boolean {
  if (depth > 20 || value == null) return false;
  if (typeof value === "string") return hasNul(value);
  if (Array.isArray(value)) return value.some((v) => scan(v, depth + 1));
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).some(([k, v]) => hasNul(k) || scan(v, depth + 1));
  return false;
}

/** Global pipe: rejects any body, query or path value that contains a NUL byte. Runs before validation. */
@Injectable()
export class RejectNulBytesPipe implements PipeTransform {
  transform(value: unknown): unknown {
    if (scan(value)) throw new BadRequestException("Text may not contain null characters.");
    return value;
  }
}

/** Early middleware: a request whose URL is not valid percent-encoding (e.g. a truncated "%E0%A4%A") or that smuggles an encoded NUL ("%00")
 * is answered with a plain 400 instead of reaching routing, where it used to produce a 500 or a broken response. */
export function rejectMalformedUrls(req: Request, res: Response, next: NextFunction): void {
  try {
    if (hasNul(decodeURIComponent(req.url))) throw new URIError("nul");
  } catch {
    res.status(400).json({ statusCode: 400, message: "Malformed request URL." });
    return;
  }
  next();
}

/** How many reverse-proxy hops sit in front of the app. Behind Render's load balancer this must be 1, otherwise every visitor looks like the
 * balancer's address and the per-IP rate limit becomes one shared bucket for the whole site. 0 (the default outside production) means no proxy. */
export function resolveTrustProxyHops(env: { TRUST_PROXY_HOPS?: string; NODE_ENV?: string }): number {
  const raw = env.TRUST_PROXY_HOPS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0;
  }
  return env.NODE_ENV === "production" ? 1 : 0;
}
