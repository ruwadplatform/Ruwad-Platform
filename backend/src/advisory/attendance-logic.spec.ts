import { OUTCOME_LABEL, Presence, PresenceEvent, checkDailyWebhook, decideOutcome, deriveSegments, signDailyWebhook, summarizeAttendance, verifyDailyWebhook } from "./attendance-logic";
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

// ---- connected stretches: the REAL sessions captured in the live test with Daily (2026-10-28) ---------------------------------------------------------
describe("connected stretches (real Daily sessions)", () => {
  const sec = (unixSeconds: number) => new Date(Math.round(unixSeconds * 1000));
  const join = (t: number): PresenceEvent => ({ kind: "joined", at: sec(t) });
  const leave = (t: number, stayStartedAt?: number): PresenceEvent => ({ kind: "left", at: sec(t), stayStartedAt: stayStartedAt === undefined ? null : sec(stayStartedAt) });
  const seconds = (segs: { from: Date; to: Date | null }[]) => Math.round(segs.reduce((n, s) => n + (s.to!.getTime() - s.from.getTime()), 0)) / 1000;

  // The founder: joined, dropped out after 122 s, came back 10 s later, left at 137.76 s after the first join. (event_ts of each event.)
  const FOUNDER = [join(1793176898.647), leave(1793177020.692, 1793176898.662), join(1793177030.833), leave(1793177036.410, 1793176898.662)];
  // The advisor: a backgrounded tab that dropped and came back five times: 73 s in, a 3 minute gap, then four short stretches, each after a 2.5 to 3 s gap.
  const ADVISOR = [
    join(1793176905.431), leave(1793176978.691, 1793176905.436),
    join(1793177158.277), leave(1793177194.036, 1793176905.436),
    join(1793177196.709), leave(1793177253.475, 1793176905.436),
    join(1793177256.010), leave(1793177312.779, 1793176905.436),
    join(1793177315.709), leave(1793177372.471, 1793176905.436),
  ];

  it("counts only the connected stretches: the founder's reconnection is 127.6 s connected, not the 137.8 s span", () => {
    const segs = deriveSegments(FOUNDER);
    expect(segs).toHaveLength(2);
    expect(seconds([segs[0]!])).toBeCloseTo(122.045, 2);
    expect(seconds([segs[1]!])).toBeCloseTo(5.577, 2);
    expect(seconds(segs)).toBeCloseTo(127.622, 2);
    expect(segs.every((s) => !s.inferred)).toBe(true);
  });

  it("the advisor's five-stretch session is 279.3 s connected out of a 467 s span: the 3 minute gap and the three short gaps are not attendance", () => {
    const segs = deriveSegments(ADVISOR);
    expect(segs).toHaveLength(5);
    expect(seconds(segs)).toBeCloseTo(279.316, 2);
    const span = (segs[4]!.to!.getTime() - segs[0]!.from.getTime()) / 1000;
    expect(span).toBeCloseTo(467.04, 2);
    expect(span - seconds(segs)).toBeCloseTo(187.724, 2); // what the previous accounting wrongly counted as presence
  });

  it("the answer depends only on WHICH events exist: every arrival order of the founder's four events gives the same stretches", () => {
    const perms = (xs: PresenceEvent[]): PresenceEvent[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    const want = JSON.stringify(deriveSegments(FOUNDER));
    const all = perms(FOUNDER);
    expect(all).toHaveLength(24);
    for (const p of all) expect(JSON.stringify(deriveSegments(p))).toBe(want);
  });

  it("the advisor's ten events in 200 shuffled orders, each delivered twice, always give the same five stretches", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const want = JSON.stringify(deriveSegments(ADVISOR));
    for (let i = 0; i < 200; i++) {
      const doubled = [...ADVISOR, ...ADVISOR];
      for (let j = doubled.length - 1; j > 0; j--) { const k = Math.floor(rnd() * (j + 1)); [doubled[j], doubled[k]] = [doubled[k]!, doubled[j]!]; }
      expect(JSON.stringify(deriveSegments(doubled))).toBe(want);
    }
  });

  it("a lost JOIN for the first stretch is recovered exactly from the leave's own joined_at (nothing is estimated)", () => {
    const segs = deriveSegments([FOUNDER[1]!]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.from.getTime()).toBe(sec(1793176898.662).getTime());
    expect(segs[0]!.inferred).toBe(false);
  });

  it("a lost REjoin is flagged, and only then can a gap be counted (the safest fallback: it never counts less than was there)", () => {
    const segs = deriveSegments([FOUNDER[0]!, FOUNDER[1]!, FOUNDER[3]!]); // the second join never arrived
    expect(segs).toHaveLength(2);
    expect(segs[1]!.inferred).toBe(true);
    expect(segs[1]!.from.getTime()).toBe(segs[0]!.to!.getTime()); // starts where the previous stretch ended
    expect(seconds(segs)).toBeCloseTo(137.763, 2); // the whole span: exactly the old behaviour, and no worse
  });

  it("a join with no leave stays open (still in, or we never heard); a leave with no usable start adds nothing", () => {
    expect(deriveSegments([join(1793176898.647)])).toEqual([{ from: sec(1793176898.647), to: null, inferred: false }]);
    expect(deriveSegments([leave(1793176978.691)])).toEqual([]); // no joined_at hint and nothing before it: nothing to count
    expect(deriveSegments([join(1793176898.647), join(1793177000)])).toHaveLength(1); // a second join while already in is the same stay
  });

  it("a leave at or before its own join, and an empty list, produce no negative or empty stretches", () => {
    expect(deriveSegments([join(1793177000), leave(1793177000)])).toEqual([]);
    expect(deriveSegments([])).toEqual([]);
  });

  it("founder and advisor are computed independently, and the overlap is the time both were connected at once (73.3 s: only the advisor's first stretch)", () => {
    const t0 = 1793176898;
    const window = { from: sec(t0 - 600), to: sec(t0 + 3600) };
    const rows = [
      ...deriveSegments(FOUNDER).map((s): Presence => ({ role: "FOUNDER", joinedAt: s.from, leftAt: s.to })),
      ...deriveSegments(ADVISOR).map((s): Presence => ({ role: "ADVISOR", joinedAt: s.from, leftAt: s.to })),
    ];
    const sum = summarizeAttendance(rows, window, sec(t0 + 7200));
    expect(sum.founder.minutes).toBe(2.1); // 127.6 s
    expect(sum.advisor.minutes).toBe(4.7); // 279.3 s (it was 7.8 min when the gaps were counted)
    expect(sum.overlapMinutes).toBe(1.2); // 73.26 s: the founder's first stretch overlaps the advisor's first stretch only
    expect(decideOutcome(sum, 5)).toBe("NO_OVERLAP"); // together for 1.2 min: below the 5 minute minimum, so a person looks at it (unchanged rule)
  });
});
