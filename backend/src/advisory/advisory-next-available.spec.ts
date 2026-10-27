import { DIRECTORY_SEARCH_DAYS, nextAvailableFor } from "./advisory-next-available";
import { AvailabilityInput } from "./advisory-slots";
import { addDays, parseYmd, riyadhInstant } from "./advisory-time";
import { DEMO_ADVISORS } from "./testing/demo-advisors";

const ymd = (s: string) => parseYmd(s)!;
// Sunday 4 Jan 2026, 08:00 Riyadh. Omar is open Sun/Mon/Wed 09:00–12:00 and 14:00–16:30, Thu 10:00–11:30 and 14:00–15:30.
const NOW = riyadhInstant(ymd("2026-01-04"), "08:00");
const rules = DEMO_ADVISORS.find((a) => a.slug === "omar-al-harbi")!.rules.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime }));
const input = (over: Partial<AvailabilityInput> = {}): AvailabilityInput => ({ rules, timeOff: [], busy: [], ...over });
const at = (day: string, time: string) => riyadhInstant(ymd(day), time).toISOString();

describe("nextAvailableFor: what the directory shows", () => {
  it("is the first real slot, honouring the two-hour notice", () => {
    expect(nextAvailableFor(input(), 30, NOW)).toEqual({ startsAt: at("2026-01-04", "10:00"), minutes: 30 });
  });

  it("skips a slot that is already booked (the bug this fixes)", () => {
    const busy = [{ start: riyadhInstant(ymd("2026-01-04"), "10:00"), end: riyadhInstant(ymd("2026-01-04"), "10:30") }];
    expect(nextAvailableFor(input({ busy }), 30, NOW)?.startsAt).toBe(at("2026-01-04", "10:30"));
  });

  it("moves to the next open day when the whole of today is booked or off", () => {
    const wholeDayBooked = [{ start: riyadhInstant(ymd("2026-01-04"), "09:00"), end: riyadhInstant(ymd("2026-01-04"), "17:00") }];
    expect(nextAvailableFor(input({ busy: wholeDayBooked }), 30, NOW)?.startsAt).toBe(at("2026-01-05", "09:00")); // Monday
    const off = { date: "2026-01-04", startTime: null, endTime: null };
    expect(nextAvailableFor(input({ timeOff: [off] }), 30, NOW)?.startsAt).toBe(at("2026-01-05", "09:00"));
  });

  it("a part-day time off only removes the slots it touches", () => {
    const off = { date: "2026-01-04", startTime: "10:00", endTime: "12:00" };
    expect(nextAvailableFor(input({ timeOff: [off] }), 30, NOW)?.startsAt).toBe(at("2026-01-04", "14:00"));
  });

  it("uses the consultation length it is given: a booking can block a long slot but not a short one", () => {
    const busy = [{ start: riyadhInstant(ymd("2026-01-04"), "10:30"), end: riyadhInstant(ymd("2026-01-04"), "11:00") }];
    expect(nextAvailableFor(input({ busy }), 30, NOW)?.startsAt).toBe(at("2026-01-04", "10:00")); // 10:00–10:30 ends as the booking starts
    expect(nextAvailableFor(input({ busy }), 60, NOW)?.startsAt).toBe(at("2026-01-04", "11:00")); // 10:00–11:00 would overlap it
  });

  it("is null when there are no services, no hours, or nothing inside the horizon", () => {
    expect(nextAvailableFor(input(), null, NOW)).toBeNull();
    expect(nextAvailableFor({ rules: [], timeOff: [], busy: [] }, 30, NOW)).toBeNull();
    // every day in the search horizon is off
    const timeOff = Array.from({ length: DIRECTORY_SEARCH_DAYS }, (_, i) => {
      const d = addDays(ymd("2026-01-04"), i);
      return { date: `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`, startTime: null, endTime: null };
    });
    expect(nextAvailableFor(input({ timeOff }), 30, NOW)).toBeNull();
  });
});
