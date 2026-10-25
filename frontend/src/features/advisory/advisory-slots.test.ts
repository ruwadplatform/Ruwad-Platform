import { test } from "node:test";
import assert from "node:assert/strict";
import { datesWithSlots, slotsForDate } from "./advisory-slots.ts";
import { MAX_BOOKING_DAYS, addDays, formatClock, formatLongDate, offsetLabel, parseYmd, riyadhDate, riyadhInstant, weekdayOf, ymdKey } from "./advisory-time.ts";
import { DEMO_ADVISOR_PROFILES, DEMO_ADVISORS } from "./demo-advisors.ts";
import { CONSULTATION_TYPES } from "./advisory-types.ts";

const omar = DEMO_ADVISOR_PROFILES.find((a) => a.id === "omar-al-harbi")!;
const reem = DEMO_ADVISOR_PROFILES.find((a) => a.id === "reem-al-salem")!;
const lina = DEMO_ADVISOR_PROFILES.find((a) => a.id === "lina-al-rashid")!;
// Sunday 4 Jan 2026, 08:00 Riyadh. Omar is open Sun/Mon/Wed 09:00–12:00 and 14:00–16:30, Thu 10:00–11:30 and 14:00–15:30.
const SUNDAY_8AM = riyadhInstant(2026, 1, 4, "08:00");
const SUN = { y: 2026, m: 1, d: 4 };
const times = (xs: { time: string }[]) => xs.map((s) => s.time);

test("the demo profiles carry services, an honest empty publications/reviews list, and no ratings", () => {
  assert.equal(DEMO_ADVISOR_PROFILES.length, 6);
  for (const p of DEMO_ADVISOR_PROFILES) {
    assert.ok(p.isDemo && !p.affiliationVerified);
    assert.deepEqual(p.publications, []);
    assert.deepEqual(p.reviews, []);
    assert.ok(p.services.length >= 2);
    assert.ok(p.about.includes("fictional demonstration profile"));
    // every service belongs to a type the directory filter knows, and the summary advertises exactly those types
    assert.deepEqual([...new Set(p.services.map((s) => s.typeId))].sort(), [...p.consultationTypes].sort());
    for (const s of p.services) assert.equal(s.minutes, CONSULTATION_TYPES.find((t) => t.id === s.typeId)!.minutes);
  }
  assert.equal(DEMO_ADVISORS.length, 6);
  assert.ok(DEMO_ADVISORS.every((a) => !("services" in a) && !("about" in a)));
});

test("slots sit on a 30-minute grid inside the windows and honour the two-hour notice", () => {
  assert.deepEqual(times(slotsForDate(omar, SUN, 30, SUNDAY_8AM)), ["10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00"]);
});

test("longer consultations have fewer slots: they must fit inside a window", () => {
  assert.deepEqual(times(slotsForDate(omar, SUN, 45, SUNDAY_8AM)), ["10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30"]);
  assert.deepEqual(times(slotsForDate(omar, SUN, 60, SUNDAY_8AM)), ["10:00", "10:30", "11:00", "14:00", "14:30", "15:00", "15:30"]);
  const [last] = slotsForDate(omar, SUN, 60, SUNDAY_8AM).slice(-1);
  assert.equal(last!.end.getTime() - last!.start.getTime(), 60 * 60_000);
  assert.equal(last!.time, "15:30"); // 15:30 + 60 min ends exactly at 16:30, the end of the window; 16:00 would run past it
});

test("the end of a window is respected exactly", () => {
  const thursday = { y: 2026, m: 1, d: 8 };
  assert.deepEqual(times(slotsForDate(omar, thursday, 60, SUNDAY_8AM)), ["10:00", "10:30", "14:00", "14:30"]);
  assert.deepEqual(times(slotsForDate(omar, thursday, 30, SUNDAY_8AM)), ["10:00", "10:30", "11:00", "14:00", "14:30", "15:00"]);
});

test("a date with no rule, a past date and a date beyond the horizon have no slots", () => {
  assert.deepEqual(slotsForDate(omar, { y: 2026, m: 1, d: 6 }, 30, SUNDAY_8AM), []); // Tuesday: Omar is closed
  assert.deepEqual(slotsForDate(omar, { y: 2026, m: 1, d: 3 }, 30, SUNDAY_8AM), []); // yesterday
  assert.deepEqual(slotsForDate(omar, addDays(SUN, MAX_BOOKING_DAYS + 7), 30, SUNDAY_8AM), []);
});

test("minimum notice removes today's slots that are too soon, and the whole day late at night", () => {
  assert.deepEqual(times(slotsForDate(omar, SUN, 30, riyadhInstant(2026, 1, 4, "13:00"))), ["15:00", "15:30", "16:00"]);
  assert.deepEqual(slotsForDate(omar, SUN, 30, riyadhInstant(2026, 1, 4, "20:00")), []);
});

test("dates with slots depend on the consultation length", () => {
  const thirty = datesWithSlots(lina, 30, SUNDAY_8AM);
  assert.ok(thirty.has("2026-01-05") && thirty.has("2026-01-07") && thirty.has("2026-01-08")); // Mon, Wed, Thu
  assert.ok(!thirty.has("2026-01-06")); // Tuesday: closed
  assert.ok([...thirty].every((k) => weekdayOf(parseYmd(k)) !== 6)); // never Saturday
  assert.ok(thirty.size <= MAX_BOOKING_DAYS + 1);
  // Reem is open Tue/Wed only; a 60-minute consultation fits both of her windows (150 and 90 minutes), so Tuesday stays
  assert.ok(datesWithSlots(reem, 60, SUNDAY_8AM).has("2026-01-06"));
});

test("an advisor with no rules has no dates and no slots", () => {
  assert.equal(datesWithSlots({ availability: [] }, 30, SUNDAY_8AM).size, 0);
});

test("Riyadh date helpers", () => {
  assert.deepEqual(riyadhDate(riyadhInstant(2026, 1, 4, "23:30")), SUN);
  assert.equal(ymdKey({ y: 2026, m: 3, d: 9 }), "2026-03-09");
  assert.deepEqual(addDays({ y: 2026, m: 12, d: 31 }, 1), { y: 2027, m: 1, d: 1 });
  assert.equal(weekdayOf(SUN), 0);
});

test("times are shown in the chosen zone", () => {
  const at = riyadhInstant(2026, 1, 4, "10:00");
  assert.equal(formatClock(at, "Asia/Riyadh"), "10:00 AM");
  assert.equal(formatClock(at, "UTC"), "07:00 AM");
  assert.equal(formatClock(at, "Asia/Karachi"), "12:00 PM");
  assert.equal(offsetLabel(at, "Asia/Riyadh"), "UTC+3");
  assert.equal(formatLongDate(SUN), "Sunday, 4 January 2026");
});
