import { createHmac, timingSafeEqual } from "crypto";

export type EmailAction = "approve" | "reject";
export interface EmailActionPayload { sid: string; act: EmailAction; exp: number }

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

/** Stateless HMAC token for the Accept/Reject buttons in the admin email.
 * It only proves "this link was issued by RUWĀD for this submission and
 * action"; the submission's own status transitions make it effectively
 * single-use, since a second click finds it already reviewed. */
export function signEmailAction(sid: string, act: EmailAction, secret: string): string {
  const body = b64(JSON.stringify({ sid, act, exp: Date.now() + TTL_MS } satisfies EmailActionPayload));
  return `${body}.${sign(body, secret)}`;
}

export function verifyEmailAction(token: string | undefined, secret: string): EmailActionPayload | null {
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = sign(body, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as EmailActionPayload;
    if ((p.act !== "approve" && p.act !== "reject") || typeof p.sid !== "string" || typeof p.exp !== "number" || p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}
