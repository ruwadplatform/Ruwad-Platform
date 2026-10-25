import { AvailabilityInput, datesWithSlots, isOfferedSlot, slotsForDate } from "./advisory-slots";
import { MAX_BOOKING_DAYS, addDays, parseYmd, riyadhDate, riyadhInstant, weekdayOf, ymdKey } from "./advisory-time";
import { DEMO_ADVISORS } from "./seed/demo-advisors";

const ymd = (s: string) => parseYmd(s)!;
const times = (xs: { time: string }[]) => xs.map((s) => s.time);

const omarRules = DEMO_ADVISORS.find((a) => a.slug === "omar-al-harbi")!.rules.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime }));
const omar = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({ rules: omarRules, timeOff: [], busy: [], ...over });
// Sunday 4 Jan 2026, 08:00 Riyadh. Omar is open Sun/Mon/Wed 09:00–12:00 and 14:00–16:30, Thu 10:00–11:30 and 14:00–15:30.
const SUNDAY_8AM = riyadhInstant(ymd("2026-01-04"), "08:00");
const SUN = ymd("2026-01-04");

describe("slot engine — the same cases the frontend calendar is tested with, so the two can't drift", () => {
  it("30-minute grid inside the windows, honouring two hours' notice", () => {
    expect(times(slotsForDate(omar(), SUN, 30, SUNDAY_8AM))).toEqual(["10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00"]);
  });

  it("longer consultations have fewer slots: they must fit inside a window", () => {
    expect(times(slotsForDate(omar(), SUN, 45, SUNDAY_8AM))).toEqual(["10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30"]);
    const sixty = slotsForDate(omar(), SUN, 60, SUNDAY_8AM);
    expect(times(sixty)).toEqual(["10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30"]);
    expect(sixty.at(-1)!.end.getTime() - sixty.at(-1)!.start.getTime()).toBe(60 * 60_000);
  });

  it("the end of a window is respected exactly", () => {
    const thursday = ymd("2026-01-08");
    expect(times(slotsForDate(omar(), thursday, 60, SUNDAY_8AM))).toEqual(["10:00", "10:30", "14:00", "14:30"]);
  });

  it("a date with no rule, a past date and a date beyond the horizon have no slots", () => {
    expect(slotsForDate(omar(), ymd("2026-01-06"), 30, SUNDAY_8AM)).toEqual([]); // Tuesday
    expect(slotsForDate(omar(), ymd("2026-01-03"), 30, SUNDAY_8AM)).toEqual([]); // yesterday
    expect(slotsForDate(omar(), addDays(SUN, MAX_BOOKING_DAYS + 7), 30, SUNDAY_8AM)).toEqual([]);
  });

  it("minimum notice removes today's slots that are too soon, and the whole day late at night", () => {
    expect(times(slotsForDate(omar(), SUN, 30, riyadhInstant(SUN, "13:00")))).toEqual(["15:00", "15:30", "16:00"]);
    expect(slotsForDate(omar(), SUN, 30, riyadhInstant(SUN, "20:00"))).toEqual([]);
  });

  it("dates with slots exclude closed weekdays and never include Saturday for Omar", () => {
    const dates = datesWithSlots(omar(), 30, SUNDAY_8AM);
    expect(dates).toContain("2026-01-05");
    expect(dates).not.toContain("2026-01-06");
    expect(dates.every((k) => weekdayOf(ymd(k)) !== 6)).toBe(true);
    expect(dates.length).toBeLessThanOrEqual(MAX_BOOKING_DAYS + 1);
  });
});

describe("slot engine — what the server adds: time off and slots already held", () => {
  it("a whole day off removes every slot that day", () => {
    expect(slotsForDate(omar({ timeOff: [{ date: "2026-01-04", startTime: null, endTime: null }] }), SUN, 30, SUNDAY_8AM)).toEqual([]);
  });

  it("a part-day off removes only the slots it touches, including ones that would run into it", () => {
    const off = omar({ timeOff: [{ date: "2026-01-04", startTime: "10:30", endTime: "11:30" }] });
    // 10:00 for 30 min ends at 10:30 (fine); 10:30, 11:00 clash; 11:30 starts as the off ends (fine)
    expect(times(slotsForDate(off, SUN, 30, SUNDAY_8AM))).toEqual(["10:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00"]);
    // a 60-minute consultation at 10:00 would run into the time off
    expect(times(slotsForDate(off, SUN, 60, SUNDAY_8AM))).not.toContain("10:00");
  });

  it("a held interval removes every slot it overlaps, whatever the consultation length", () => {
    const busy = [{ start: riyadhInstant(SUN, "10:00"), end: riyadhInstant(SUN, "10:45") }];
    const t30 = times(slotsForDate(omar({ busy }), SUN, 30, SUNDAY_8AM));
    expect(t30).not.toContain("10:00");
    expect(t30).not.toContain("10:30"); // 10:30–11:00 overlaps 10:00–10:45
    expect(t30).toContain("11:00");
    // a 45-minute consultation starting at 09:30 isn't offered at all (window starts 09:00 but notice), and 09:30+45 would overlap
    expect(times(slotsForDate(omar({ busy }), SUN, 60, SUNDAY_8AM))).not.toContain("09:30");
  });

  it("adjacent is not overlapping: a consultation may start exactly when another ends", () => {
    const busy = [{ start: riyadhInstant(SUN, "10:00"), end: riyadhInstant(SUN, "10:30") }];
    expect(times(slotsForDate(omar({ busy }), SUN, 30, SUNDAY_8AM))).toContain("10:30");
  });

  it("isOfferedSlot accepts exactly the offered instants and nothing else", () => {
    expect(isOfferedSlot(omar(), riyadhInstant(SUN, "10:30"), 30, SUNDAY_8AM)).toBe(true);
    expect(isOfferedSlot(omar(), riyadhInstant(SUN, "10:15"), 30, SUNDAY_8AM)).toBe(false); // off the 30-minute grid
    expect(isOfferedSlot(omar(), riyadhInstant(SUN, "09:00"), 30, SUNDAY_8AM)).toBe(false); // inside the two-hour notice
    expect(isOfferedSlot(omar(), riyadhInstant(SUN, "16:30"), 30, SUNDAY_8AM)).toBe(false); // starts as the window closes
    expect(isOfferedSlot(omar(), riyadhInstant(SUN, "12:00"), 30, SUNDAY_8AM)).toBe(false); // between the windows
    expect(isOfferedSlot({ rules: [], timeOff: [], busy: [] }, riyadhInstant(SUN, "10:00"), 30, SUNDAY_8AM)).toBe(false);
  });
});

describe("time zones", () => {
  it("Riyadh is a fixed UTC+3: 10:00 in Riyadh is 07:00 UTC", () => {
    expect(riyadhInstant(SUN, "10:00").toISOString()).toBe("2026-01-04T07:00:00.000Z");
    expect(slotsForDate(omar(), SUN, 30, SUNDAY_8AM)[0]!.start.toISOString()).toBe("2026-01-04T07:00:00.000Z");
  });

  it("the Riyadh calendar date of an instant rolls over at 21:00 UTC", () => {
    expect(ymdKey(riyadhDate(new Date("2026-01-04T20:59:00Z")))).toBe("2026-01-04");
    expect(ymdKey(riyadhDate(new Date("2026-01-04T21:00:00Z")))).toBe("2026-01-05");
  });

  it("parseYmd rejects impossible dates instead of rolling them over", () => {
    expect(parseYmd("2026-02-31")).toBeNull();
    expect(parseYmd("2026-13-01")).toBeNull();
    expect(parseYmd("not-a-date")).toBeNull();
    expect(parseYmd("2026-02-28")).toEqual({ y: 2026, m: 2, d: 28 });
  });
});
