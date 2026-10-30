import { createHmac, randomInt, timingSafeEqual } from "crypto";

/** The pure rules of email verification: how a code is made, stored, compared, rate-limited and tied to a browser. No database, no network, no clock
 * of its own (the time is always passed in), so every rule can be pinned by a test. */

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** Codes that reached the inbox (or are still being sent) per account per 24 hours. */
export const MAX_SENT_PER_DAY = 10;
/** Every code row per account per 24 hours, delivered or not, so a failing provider cannot make the table grow without bound. */
export const MAX_ROWS_PER_DAY = 30;
/** Codes requested from one network address per 24 hours (stored only as a keyed hash). */
export const MAX_PER_IP_PER_DAY = 30;
export const PENDING_TTL_MS = 30 * 60 * 1000;
/** Old code rows are deleted after this long (they are useless long before it). */
export const CODE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** A uniformly random 6-digit code from the operating system's secure generator, zero-padded ("004217"). */
export function generateCode(): string {
  return String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

/** What a person typed or pasted, reduced to digits ("123 456", "123-456" and "123456" are the same). Null when it is not exactly six digits. */
export function normalizeCodeInput(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 32) return null;
  const digits = input.replace(/[\s-]/g, "");
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(digits) ? digits : null;
}

/** HMAC-SHA-256 of the code under the server secret, bound to the account and to this particular code row. A leaked table cannot be reversed by trying
 * the million possible codes, because the key is not in the table, and a hash from one row is useless in another. Hex, 64 characters. */
export function hashCode(key: Buffer, userId: string, codeId: string, code: string): string {
  return createHmac("sha256", key).update(`otp|${userId}|${codeId}|${code}`).digest("hex");
}

/** Constant-time comparison of two hex digests of equal length; anything else is simply "no". */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length || !/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** A network address reduced to a keyed hash, kept only to cap how many codes one address can ask for. */
export function hashIp(key: Buffer, ip: string | undefined): string | null {
  const v = (ip ?? "").trim();
  return v ? createHmac("sha256", key).update(`ip|${v}`).digest("hex") : null;
}

/** "m***@gmail.com": enough for a person to recognise their own address, not enough to learn anyone else's. */
export function maskEmail(email: string): string {
  const e = email.trim();
  const at = e.lastIndexOf("@");
  if (at < 1) return "***";
  return `${e[0]}***${e.slice(at)}`;
}

export interface SendHistory {
  /** When the newest code that was delivered (or is still being sent) was created; null if none. */
  lastSentAt: Date | null;
  sentLast24h: number;
  rowsLast24h: number;
  ipRowsLast24h: number;
}
export type SendDecision = { ok: true } | { ok: false; reason: "COOLDOWN" | "DAILY" | "ROWS" | "IP"; retryAfterSeconds?: number };

/** May another code be sent now? A code whose delivery FAILED never counts towards the cooldown or the daily limit, so a provider hiccup does not lock a
 * person out; the overall row cap still bounds the damage. */
export function decideSend(h: SendHistory, now: Date): SendDecision {
  if (h.rowsLast24h >= MAX_ROWS_PER_DAY) return { ok: false, reason: "ROWS" };
  if (h.ipRowsLast24h >= MAX_PER_IP_PER_DAY) return { ok: false, reason: "IP" };
  if (h.sentLast24h >= MAX_SENT_PER_DAY) return { ok: false, reason: "DAILY" };
  if (h.lastSentAt) {
    const wait = RESEND_COOLDOWN_MS - (now.getTime() - h.lastSentAt.getTime());
    if (wait > 0) return { ok: false, reason: "COOLDOWN", retryAfterSeconds: Math.ceil(wait / 1000) };
  }
  return { ok: true };
}

/* ---- the "pending verification" ticket -------------------------------------------------------------------------------------------------------- */

export interface PendingTicket {
  /** The account this browser is verifying (a made-up id for an address that already had an account, so the cookie looks the same either way). */
  u: string;
  /** The address as typed at sign-up, masked, so the verify page can say where the code went without asking the server who is who. */
  m: string;
  /** Expiry, ms since the epoch. */
  e: number;
}

const ticketMac = (key: Buffer, body: string) => createHmac("sha256", key).update(`pending|${body}`).digest();

/** A signed, short-lived note that THIS browser just signed up or proved a password. It is not a login token: nothing but the verification endpoints
 * ever reads it, and it carries no role or permission. */
export function signPending(key: Buffer, ticket: PendingTicket): string {
  const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${body}.${ticketMac(key, body).toString("base64url")}`;
}

export function readPending(key: Buffer, token: string | undefined, now: Date): PendingTicket | null {
  if (!token || token.length > 1000) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = ticketMac(key, body);
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PendingTicket;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return typeof t.u === "string" && uuid.test(t.u) && typeof t.m === "string" && t.m.length <= 120 && typeof t.e === "number" && t.e > now.getTime() ? t : null;
  } catch {
    return null;
  }
}
