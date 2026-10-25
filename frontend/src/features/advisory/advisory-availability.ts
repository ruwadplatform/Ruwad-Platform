import { MIN_NOTICE_MINUTES, daysBetween, minutesOf, pad2, parseYmd, riyadhDate, riyadhInstant, timeOf, ymdKey } from "./advisory-time.ts";
import type { AdvisorSummary, AvailabilityFilter } from "./advisory-types.ts";

// Re-exported so existing imports keep working (the helpers live in advisory-time.ts).
export { MIN_NOTICE_MINUTES, riyadhInstant };

export interface NextSlot {
  /** The slot's start as an instant. */
  at: Date;
  /** Whole Riyadh calendar days from today (0 = today). */
  daysFromToday: number;
  /** Riyadh date "YYYY-MM-DD". */
  date: string;
  time: string;
}

/** The directory's "Next available" for an advisor.
 *
 * It is NOT calculated here: the server works it out from the advisor's weekly hours, time off, the two-hour notice and every booking that holds
 * a time (the same engine the booking calendar uses) and sends it as `nextAvailable`. This only turns that into the shape the card shows, and
 * returns null when there is none, or when the page has been open so long that the slot is now inside the notice period and can't be promised
 * (the directory refreshes itself, so that is rare). Before the server's value existed this was computed in the browser from weekly hours
 * alone, which ignored bookings and time off. */
export function nextAvailableSlot(advisor: Pick<AdvisorSummary, "nextAvailable">, now: Date = new Date()): NextSlot | null {
  const next = advisor.nextAvailable;
  if (!next) return null;
  const at = new Date(next.startsAt);
  if (Number.isNaN(at.getTime()) || at.getTime() < now.getTime() + MIN_NOTICE_MINUTES * 60_000) return null;
  const date = riyadhDate(at);
  const minutes = (at.getUTCHours() * 60 + at.getUTCMinutes() + 3 * 60) % (24 * 60); // Riyadh is a fixed UTC+3
  return { at, daysFromToday: daysBetween(riyadhDate(now), date), date: ymdKey(date), time: timeOf(minutes) };
}

const WINDOW_DAYS: Record<Exclude<AvailabilityFilter, "any">, number> = { today: 0, week: 7, twoWeeks: 14 };

/** Does the advisor have a slot inside the chosen availability window? */
export function matchesAvailability(advisor: Pick<AdvisorSummary, "nextAvailable">, filter: AvailabilityFilter, now: Date = new Date()): boolean {
  if (filter === "any") return true;
  const slot = nextAvailableSlot(advisor, now);
  return !!slot && slot.daysFromToday <= WINDOW_DAYS[filter];
}

/** "Mon 26 Oct · 10:00 AM" in Riyadh time. */
export function formatSlot(slot: NextSlot): string {
  const d = parseYmd(slot.date);
  const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(d.y, d.m - 1, d.d)));
  const mins = minutesOf(slot.time);
  const hh = Math.floor(mins / 60);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${day} · ${pad2(h12)}:${pad2(mins % 60)} ${hh < 12 ? "AM" : "PM"}`;
}
