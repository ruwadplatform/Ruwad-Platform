import { SLOT_STEP_MINUTES, slotsForDate } from "./advisory-slots.ts";
import { MAX_BOOKING_DAYS, MIN_NOTICE_MINUTES, addDays, pad2, riyadhDate, riyadhInstant, ymdKey } from "./advisory-time.ts";
import type { AdvisorSummary, AvailabilityFilter } from "./advisory-types.ts";

// Re-exported so existing imports keep working (the helpers now live in advisory-time.ts).
export { MIN_NOTICE_MINUTES, riyadhInstant };

/** Directory searches only look this far ahead for an advisor's next slot. */
const SEARCH_DAYS = 21;
/** The directory shows the next slot of the shortest consultation. */
const DIRECTORY_MINUTES = SLOT_STEP_MINUTES;

export interface NextSlot {
  /** The slot's start as an instant. */
  at: Date;
  /** Whole Riyadh calendar days from today (0 = today). */
  daysFromToday: number;
  /** Riyadh date "YYYY-MM-DD". */
  date: string;
  time: string;
}

/** The soonest slot an advisor offers from `now`, honouring the minimum notice; null if there is none in the next three weeks. It is computed
 * with the same generator as the booking calendar, so the directory and the booking form always agree. */
export function nextAvailableSlot(advisor: Pick<AdvisorSummary, "availability">, now: Date = new Date()): NextSlot | null {
  const today = riyadhDate(now);
  for (let i = 0; i < Math.min(SEARCH_DAYS, MAX_BOOKING_DAYS); i++) {
    const day = addDays(today, i);
    const first = slotsForDate(advisor, day, DIRECTORY_MINUTES, now)[0];
    if (first) return { at: first.start, daysFromToday: i, date: ymdKey(day), time: first.time };
  }
  return null;
}

const WINDOW_DAYS: Record<Exclude<AvailabilityFilter, "any">, number> = { today: 0, week: 7, twoWeeks: 14 };

/** Does the advisor have a slot inside the chosen availability window? */
export function matchesAvailability(advisor: Pick<AdvisorSummary, "availability">, filter: AvailabilityFilter, now: Date = new Date()): boolean {
  if (filter === "any") return true;
  const slot = nextAvailableSlot(advisor, now);
  return !!slot && slot.daysFromToday <= WINDOW_DAYS[filter];
}

/** "Mon 26 Oct · 10:00 AM" in Riyadh time. */
export function formatSlot(slot: NextSlot): string {
  const [y, m, d] = slot.date.split("-").map(Number);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, d!)));
  const [hh, mm] = slot.time.split(":").map(Number);
  const h12 = hh! % 12 === 0 ? 12 : hh! % 12;
  return `${day} · ${pad2(h12)}:${pad2(mm!)} ${hh! < 12 ? "AM" : "PM"}`;
}
