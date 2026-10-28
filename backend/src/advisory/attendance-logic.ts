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

// ---- connected stretches, from Daily's own join and leave events ----------------------------------------------------------------------------------

/** One join or leave of one session, at the moment it happened. `at` is the event's own time (Daily's event_ts for a join, joined_at + duration for a
 * leave), NOT the time we received it. `stayStartedAt` is Daily's joined_at on a LEAVE: when the stay first began. */
export interface PresenceEvent {
  kind: "joined" | "left";
  at: Date;
  stayStartedAt?: Date | null;
}

/** One stretch of time a participant was actually connected. `to` is null while they are still in (or we never heard that they left). `inferred` marks
 * a stretch whose start had to be estimated because its join event never arrived. */
export interface Segment {
  from: Date;
  to: Date | null;
  inferred: boolean;
}

/** The stretches a session was really connected, from its join and leave events, in any order and with duplicates.
 *
 * What a live test with Daily showed (2026-10-28): `joined_at` and `duration` on every event refer to the FIRST join and `duration` simply keeps
 * growing, so a leave's duration is the whole span, gaps included. But each event's own time is exact: a leave's event_ts equals joined_at + duration,
 * and a REjoin's participant.joined carries its own event_ts (the moment the connection came back; for the first join it equals joined_at). So the
 * stretches are [a join's time, the next leave's time], and what lies between a leave and the next join is a gap that must not count. One real
 * session had 188 s of gaps (one of them 3 minutes) inside a 467 s span.
 *
 * The result depends only on WHICH events exist, never on the order they arrived: a leave that arrives first, a join that arrives late, a repeated
 * event under a new id: all give the same answer. When a stretch's own join event is missing, its start is estimated: Daily's joined_at (exact) if it is
 * the first stretch, otherwise the end of the previous stretch (this can count the gap, which is why it is flagged `inferred`). Nothing is invented
 * beyond that: a leave with no usable start adds nothing. */
export function deriveSegments(events: PresenceEvent[]): Segment[] {
  const seen = new Set<string>();
  const ordered = events
    .filter((e) => { const k = `${e.kind}|${e.at.getTime()}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => a.at.getTime() - b.at.getTime() || (a.kind === b.kind ? 0 : a.kind === "joined" ? -1 : 1)); // a join sorts before a leave at the same instant
  const segments: Segment[] = [];
  let open: Date | null = null;
  for (const e of ordered) {
    if (e.kind === "joined") {
      if (open === null) open = e.at; // a second join while already in is the same stay seen twice: keep the earlier
      continue;
    }
    if (open !== null) {
      if (e.at.getTime() > open.getTime()) segments.push({ from: open, to: e.at, inferred: false });
      open = null;
      continue;
    }
    // a leave whose join never arrived
    const previousEnd = segments.length ? segments[segments.length - 1]!.to : null;
    const hint = e.stayStartedAt ?? null;
    const startMs = Math.max(hint ? hint.getTime() : -Infinity, previousEnd ? previousEnd.getTime() : -Infinity);
    if (Number.isFinite(startMs) && startMs < e.at.getTime()) segments.push({ from: new Date(startMs), to: e.at, inferred: previousEnd !== null });
  }
  if (open !== null) segments.push({ from: open, to: null, inferred: false });
  return segments;
}

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
