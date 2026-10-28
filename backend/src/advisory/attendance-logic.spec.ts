import { OUTCOME_LABEL, Presence, checkDailyWebhook, decideOutcome, signDailyWebhook, summarizeAttendance, verifyDailyWebhook } from "./attendance-logic";
import { ATTENDANCE_OUTCOMES } from "./advisory.enums";

const at = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00Z`);
// A 10:00–10:30 consultation; the room is open from 09:50 to 10:45.
const WINDOW = { from: at("09:50"), to: at("10:45") };
const NOW_AFTER = at("12:00");
const p = (role: "FOUNDER" | "ADVISOR", joined: string, left: string | null): Presence => ({ role, joinedAt: at(joined), leftAt: left ? at(left) : null });

describe("attendance summary", () => {
  it("counts the minutes each person was in the room, and the minutes both were there together", () => {
    const s = summarizeAttendance([p("ADVISOR", "09:58", "10:32"), p("FOUNDER", "10:02", "10:30")], WINDOW, NOW_AFTER);
    expect(s.advisor.minutes).toBe(34);
    expect(s.founder.minutes).toBe(28);
    expect(s.overlapMinutes).toBe(28);
    expect(s.hasData).toBe(true);
    expect(s.advisor.firstJoinedAt).toBe(at("09:58").toISOString());
    expect(s.founder.lastLeftAt).toBe(at("10:30").toISOString());
  });

  it("a person who dropped out and came back has both stretches added, and overlapping stretches aren't double counted", () => {
    const s = summarizeAttendance([p("FOUNDER", "10:00", "10:10"), p("FOUNDER", "10:20", "10:30"), p("FOUNDER", "10:05", "10:12")], WINDOW, NOW_AFTER);
    expect(s.founder.minutes).toBe(22); // 10:00–10:12 and 10:20–10:30
  });

  it("time outside the meeting window doesn't count", () => {
    const s = summarizeAttendance([p("ADVISOR", "09:00", "11:30")], WINDOW, NOW_AFTER);
    expect(s.advisor.minutes).toBe(55); // 09:50 to 10:45
  });

  it("someone still in the room (no leave recorded) counts until now, and shows as present", () => {
    const s = summarizeAttendance([p("ADVISOR", "10:00", null), p("FOUNDER", "10:05", null)], WINDOW, at("10:20"));
    expect(s.advisor).toMatchObject({ minutes: 20, present: true });
    expect(s.founder).toMatchObject({ minutes: 15, present: true });
    expect(s.overlapMinutes).toBe(15);
  });

  it("with no leave recorded long after the meeting, they count only until the window closed (a missed leave event can't inflate attendance)", () => {
    const s = summarizeAttendance([p("ADVISOR", "10:00", null)], WINDOW, at("23:00"));
    expect(s.advisor.minutes).toBe(45);
    expect(s.advisor.present).toBe(false);
  });

  it("no rows: no data", () => {
    const s = summarizeAttendance([], WINDOW, NOW_AFTER);
    expect(s).toMatchObject({ hasData: false, overlapMinutes: 0 });
    expect(s.founder.hasRecord).toBe(false);
  });

  it("people who were in the room at different times have no overlap", () => {
    const s = summarizeAttendance([p("ADVISOR", "10:00", "10:10"), p("FOUNDER", "10:15", "10:30")], WINDOW, NOW_AFTER);
    expect(s.overlapMinutes).toBe(0);
    expect(s.founder.minutes).toBe(15);
  });
});

describe("what attendance suggests happened", () => {
  const out = (rows: Presence[], min = 5) => decideOutcome(summarizeAttendance(rows, WINDOW, NOW_AFTER), min);

  it("both present together for long enough: attended", () => {
    expect(out([p("ADVISOR", "10:00", "10:30"), p("FOUNDER", "10:02", "10:29")])).toBe("ATTENDED_BOTH");
  });

  it("both joined but never overlapped enough: no overlap, for a person to look at", () => {
    expect(out([p("ADVISOR", "10:00", "10:10"), p("FOUNDER", "10:12", "10:30")])).toBe("NO_OVERLAP");
    expect(out([p("ADVISOR", "10:00", "10:30"), p("FOUNDER", "10:27", "10:30")])).toBe("NO_OVERLAP"); // only 3 minutes together
  });

  it("a no-show is only suggested when the other person's presence shows attendance was being recorded", () => {
    expect(out([p("ADVISOR", "10:00", "10:30")])).toBe("FOUNDER_NO_SHOW");
    expect(out([p("FOUNDER", "10:00", "10:30")])).toBe("ADVISOR_NO_SHOW");
  });

  it("a brief appearance by one side isn't enough to call the other a no-show", () => {
    expect(out([p("ADVISOR", "10:00", "10:02")])).toBe("UNKNOWN");
  });

  it("no attendance at all is UNKNOWN, never a guess (a provider outage or missing webhook must not look like two no-shows)", () => {
    expect(out([])).toBe("UNKNOWN");
  });

  it("every outcome has a human label", () => {
    for (const o of ATTENDANCE_OUTCOMES) expect(OUTCOME_LABEL[o].length).toBeGreaterThan(5);
  });

  it("a short meeting is described truthfully: 3 minutes together is NO_OVERLAP (below the 5 minute minimum), and its label does not claim they were never together", () => {
    const rows = [p("ADVISOR", "10:00", "10:30"), p("FOUNDER", "10:27", "10:30")];
    const summary = summarizeAttendance(rows, WINDOW, NOW_AFTER);
    expect(summary.overlapMinutes).toBe(3);
    expect(decideOutcome(summary, 5)).toBe("NO_OVERLAP");
    expect(OUTCOME_LABEL.NO_OVERLAP).not.toMatch(/never at the same time/i); // true for 0 minutes together AND for 3
    expect(OUTCOME_LABEL.NO_OVERLAP).toMatch(/not together for long enough/i);
    expect(decideOutcome(summarizeAttendance([p("ADVISOR", "10:00", "10:30"), p("FOUNDER", "10:25", "10:30")], WINDOW, NOW_AFTER), 5)).toBe("ATTENDED_BOTH"); // exactly 5 minutes counts
  });
});

describe("Daily webhook signature", () => {
  const secret = Buffer.from("a-test-secret-not-real-0123456789").toString("base64");
  const body = JSON.stringify({ id: "evt_1", type: "participant.joined", payload: { room: "ruwad-x", user_id: "u1" } });
  const now = new Date("2026-11-10T10:00:00Z");
  const ts = String(Math.floor(now.getTime() / 1000));
  const good = signDailyWebhook(secret, ts, body);

  it("accepts a correctly signed, recent request", () => {
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: body, now })).toBe(true);
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: Buffer.from(body), now })).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, a wrong timestamp, and a missing or malformed header", () => {
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: body.replace("u1", "u2"), now })).toBe(false);
    expect(verifyDailyWebhook({ secretBase64: Buffer.from("other").toString("base64"), timestamp: ts, signature: good, rawBody: body, now })).toBe(false);
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: String(Number(ts) + 1), signature: good, rawBody: body, now: new Date(now.getTime() + 1000) })).toBe(false);
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: undefined, signature: good, rawBody: body, now })).toBe(false);
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: ts, signature: undefined, rawBody: body, now })).toBe(false);
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: "soon", signature: good, rawBody: body, now })).toBe(false);
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: ts, signature: "not base64 !!", rawBody: body, now })).toBe(false);
    expect(verifyDailyWebhook({ secretBase64: "", timestamp: ts, signature: good, rawBody: body, now })).toBe(false);
  });

  it("rejects an old request even with a valid signature (replay protection), but tolerates small clock differences", () => {
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: body, now: new Date(now.getTime() + 10 * 60_000) })).toBe(false);
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: body, now: new Date(now.getTime() + 2 * 60_000) })).toBe(true);
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: body, now: new Date(now.getTime() - 2 * 60_000) })).toBe(true);
  });

  it("the signature is over 'timestamp.body': swapping in another timestamp fails", () => {
    const other = String(Number(ts) + 60);
    expect(verifyDailyWebhook({ secretBase64: secret, timestamp: other, signature: good, rawBody: body, now: new Date(now.getTime() + 60_000) })).toBe(false);
  });

  it("says WHY it refused, and the reason carries no secret, signature or body", () => {
    const why = (p: Partial<Parameters<typeof checkDailyWebhook>[0]>) => checkDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: body, now, ...p });
    expect(why({})).toEqual({ ok: true });
    expect(why({ timestamp: undefined })).toEqual({ ok: false, reason: "missing-header" });
    expect(why({ signature: undefined })).toEqual({ ok: false, reason: "missing-header" });
    expect(why({ timestamp: "soon" })).toEqual({ ok: false, reason: "bad-timestamp" });
    expect(why({ now: new Date(now.getTime() + 20 * 60_000) })).toEqual({ ok: false, reason: "stale-timestamp", skewSeconds: 1200 });
    expect(why({ rawBody: body.replace("u1", "u2") })).toEqual({ ok: false, reason: "signature-mismatch" });
    expect(why({ signature: "not base64 !!" })).toEqual({ ok: false, reason: "signature-mismatch" });
    for (const r of [why({ now: new Date(now.getTime() + 20 * 60_000) }), why({ rawBody: "tampered" })]) {
      const text = JSON.stringify(r);
      expect(text).not.toContain(secret);
      expect(text).not.toContain(good);
      expect(text).not.toContain("tampered");
    }
  });

  it("the replay window is configurable and still enforced on both sides (a future timestamp is refused too)", () => {
    const tenMinutesLater = new Date(now.getTime() + 10 * 60_000);
    expect(checkDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: body, now: tenMinutesLater }).ok).toBe(false); // default 5 minutes
    expect(checkDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: body, now: tenMinutesLater, toleranceSeconds: 900 }).ok).toBe(true);
    expect(checkDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: body, now: new Date(now.getTime() + 20 * 60_000), toleranceSeconds: 900 }).ok).toBe(false);
    expect(checkDailyWebhook({ secretBase64: secret, timestamp: ts, signature: good, rawBody: body, now: new Date(now.getTime() - 10 * 60_000), toleranceSeconds: 300 }).ok).toBe(false); // from the future
  });

  it("accepts a millisecond timestamp, and a Daily-shaped body with fractional-second times (signed over the exact raw text)", () => {
    const raw = '{"version":"1.0.0","type":"participant.left","id":"e","payload":{"room":"r","user_id":"u","session_id":"s","joined_at":1708972291.567,"duration":11.419000148773193},"event_ts":1708972303.001}';
    const msTs = String(now.getTime());
    expect(checkDailyWebhook({ secretBase64: secret, timestamp: msTs, signature: signDailyWebhook(secret, msTs, raw), rawBody: raw, now }).ok).toBe(true);
    // reformatting the JSON (even without changing its meaning) breaks the signature: it is checked against the raw bytes
    const pretty = JSON.stringify(JSON.parse(raw), null, 2);
    expect(checkDailyWebhook({ secretBase64: secret, timestamp: ts, signature: signDailyWebhook(secret, ts, raw), rawBody: pretty, now }).ok).toBe(false);
  });
});
