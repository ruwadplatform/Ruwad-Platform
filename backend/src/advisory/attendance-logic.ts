import { createHmac, timingSafeEqual } from "crypto";
import { AttendanceOutcome, BookingParty } from "./advisory.enums";

/** Attendance: who was in the meeting room, when, and what that means. All pure, so every rule is tested without a database or a provider. */

const MINUTE = 60_000;

export interface Presence {
  role: BookingParty;
  joinedAt: Date;
  /** Null while the person is still in the room (or we never heard that they left). */
  leftAt: Date | null;
}

export interface RoleAttendance {
  /** We have at least one record of this person being in the room. */
  hasRecord: boolean;
  firstJoinedAt: string | null;
  lastLeftAt: string | null;
  /** Total minutes in the room, counted only inside the meeting window. */
  minutes: number;
  /** In the room right now. */
  present: boolean;
}

export interface AttendanceSummary {
  founder: RoleAttendance;
  advisor: RoleAttendance;
  /** Minutes both were in the room at the same time. */
  overlapMinutes: number;
  /** Whether any attendance was recorded at all. Without it, a no-show can't be told apart from a missing report. */
  hasData: boolean;
}

type Interval = [number, number];

/** Merges overlapping intervals into a sorted, disjoint list. */
function union(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

const total = (xs: Interval[]) => xs.reduce((s, [a, b]) => s + (b - a), 0);

function intersect(xs: Interval[], ys: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [a, b] of xs) for (const [c, d] of ys) {
    const lo = Math.max(a, c), hi = Math.min(b, d);
    if (hi > lo) out.push([lo, hi]);
  }
  return union(out);
}

/** Summarises who was present. Time outside the meeting window doesn't count; a person still "in" (no leave recorded) counts until `now` (or the end
 * of the window, whichever is earlier). */
export function summarizeAttendance(rows: Presence[], window: { from: Date; to: Date }, now: Date): AttendanceSummary {
  const from = window.from.getTime(), to = window.to.getTime();
  const horizon = Math.min(now.getTime(), to);
  const per = (role: BookingParty) => {
    const mine = rows.filter((r) => r.role === role);
    const intervals = union(mine.map((r): Interval => [Math.max(r.joinedAt.getTime(), from), Math.min(r.leftAt ? r.leftAt.getTime() : horizon, to)]));
    const joined = mine.map((r) => r.joinedAt.getTime());
    const left = mine.filter((r) => r.leftAt).map((r) => r.leftAt!.getTime());
    const present = mine.some((r) => !r.leftAt && r.joinedAt.getTime() <= now.getTime() && now.getTime() <= to);
    const attendance: RoleAttendance = {
      hasRecord: mine.length > 0,
      firstJoinedAt: joined.length ? new Date(Math.min(...joined)).toISOString() : null,
      lastLeftAt: left.length ? new Date(Math.max(...left)).toISOString() : null,
      minutes: Math.round((total(intervals) / MINUTE) * 10) / 10,
      present,
    };
    return { attendance, intervals };
  };
  const f = per("FOUNDER");
  const a = per("ADVISOR");
  return {
    founder: f.attendance,
    advisor: a.attendance,
    overlapMinutes: Math.round((total(intersect(f.intervals, a.intervals)) / MINUTE) * 10) / 10,
    hasData: rows.length > 0,
  };
}

/** What the attendance suggests happened. Deliberately conservative: it only calls a no-show when the OTHER person's presence proves attendance was
 * being recorded; with no data at all (a provider hiccup, webhooks off, a simulated room nobody entered) it says UNKNOWN rather than guess. This is a
 * suggestion for a person to confirm. It never completes anything by itself unless auto-completion has been separately approved and switched on. */
export function decideOutcome(s: AttendanceSummary, minMinutes: number): AttendanceOutcome {
  if (!s.hasData) return "UNKNOWN";
  const f = s.founder.minutes, a = s.advisor.minutes;
  if (s.founder.hasRecord && s.advisor.hasRecord) return s.overlapMinutes >= minMinutes ? "ATTENDED_BOTH" : "NO_OVERLAP";
  if (s.advisor.hasRecord && !s.founder.hasRecord) return a >= minMinutes ? "FOUNDER_NO_SHOW" : "UNKNOWN";
  if (s.founder.hasRecord && !s.advisor.hasRecord) return f >= minMinutes ? "ADVISOR_NO_SHOW" : "UNKNOWN";
  return "UNKNOWN";
}

export const OUTCOME_LABEL: Record<AttendanceOutcome, string> = {
  ATTENDED_BOTH: "Both attended",
  FOUNDER_NO_SHOW: "The startup didn't attend",
  ADVISOR_NO_SHOW: "The advisor didn't attend",
  BOTH_NO_SHOW: "Neither attended",
  NO_OVERLAP: "Both joined, but not together for long enough",
  UNKNOWN: "No attendance was recorded",
};

// ---- Daily webhook signature ---------------------------------------------------------------------------------------------------------------------

/** Why a webhook was refused. Carries no secret, signature or body: only the reason and, for a stale timestamp, how far off the clock was. */
export type WebhookCheck = { ok: true } | { ok: false; reason: "missing-header" | "bad-timestamp" | "stale-timestamp" | "signature-mismatch"; skewSeconds?: number };

/** Verifies a Daily webhook: HMAC-SHA256 of "<timestamp>.<raw body>" keyed with the base64-DECODED webhook secret, compared with the base64
 * signature header, in constant time, and only if the timestamp is recent (replay protection). Per Daily's documentation (headers
 * X-Webhook-Signature and X-Webhook-Timestamp; the documentation names no tolerance, so it is configurable and defaults to 5 minutes).
 * Returns the reason when it refuses, so an operator can tell a stale timestamp from a wrong secret without anything sensitive reaching a log. */
export function checkDailyWebhook(p: { secretBase64: string; timestamp: string | undefined; signature: string | undefined; rawBody: Buffer | string; now: Date; toleranceSeconds?: number }): WebhookCheck {
  if (!p.secretBase64 || !p.timestamp || !p.signature) return { ok: false, reason: "missing-header" };
  const ts = Number(p.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad-timestamp" };
  const seconds = ts > 1e12 ? ts / 1000 : ts; // tolerate a millisecond timestamp
  const skewSeconds = Math.round(p.now.getTime() / 1000 - seconds);
  if (Math.abs(p.now.getTime() / 1000 - seconds) > (p.toleranceSeconds ?? 300)) return { ok: false, reason: "stale-timestamp", skewSeconds };
  const key = Buffer.from(p.secretBase64, "base64");
  const body = typeof p.rawBody === "string" ? p.rawBody : p.rawBody.toString("utf8");
  const expected = createHmac("sha256", key).update(`${p.timestamp}.${body}`).digest();
  let given: Buffer;
  try { given = Buffer.from(p.signature, "base64"); } catch { return { ok: false, reason: "signature-mismatch" }; }
  return given.length === expected.length && timingSafeEqual(given, expected) ? { ok: true } : { ok: false, reason: "signature-mismatch" };
}

export const verifyDailyWebhook = (p: Parameters<typeof checkDailyWebhook>[0]): boolean => checkDailyWebhook(p).ok;

/** Signs a body the way Daily does (used by tests, and handy for a one-off local check). */
export function signDailyWebhook(secretBase64: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", Buffer.from(secretBase64, "base64")).update(`${timestamp}.${rawBody}`).digest("base64");
}
